package listing

import (
	"bytes"
	"context"
	"errors"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"github.com/badStephane/dieuliko/apps/api/internal/auth"
	"github.com/badStephane/dieuliko/apps/api/internal/claim"
	"github.com/badStephane/dieuliko/apps/api/internal/httpx"
)

const (
	managerToken   = "manager-session"
	candidateToken = "candidate-session"
)

var (
	manager    = auth.User{ID: uuid.MustParse("00000000-0000-0000-0000-00000000000c"), Role: auth.RoleCompany, EmailVerified: true}
	membership = claim.Membership{CompanyID: uuid.MustParse("00000000-0000-0000-0000-0000000000d1"), Slug: "sonatel"}
)

// sessions authenticates the test tokens; other auth.Accounts methods are never called here.
type sessions struct{ auth.Accounts }

func (sessions) Authenticate(_ context.Context, token string) (auth.User, error) {
	switch token {
	case managerToken:
		return manager, nil
	case candidateToken:
		return auth.User{ID: uuid.New(), Role: auth.RoleCandidate}, nil
	}
	return auth.User{}, auth.ErrUnauthenticated
}

type members struct{}

func (members) Membership(_ context.Context, userID uuid.UUID) (claim.Membership, error) {
	if userID == manager.ID {
		return membership, nil
	}
	return claim.Membership{}, claim.ErrNotMember
}

// fakeManager records calls; err applies to every call.
type fakeManager struct {
	err       error
	gotMember Member
	gotInput  UpdateInput
	gotLogo   []byte
	removed   bool
}

var testListing = Listing{Input: Input{Name: "Sonatel", Sector: "telecoms-energie", City: "Dakar", SocialLinks: map[string]string{}}, Slug: "sonatel"}

func (f *fakeManager) Get(context.Context, uuid.UUID) (Listing, error) { return testListing, f.err }

func (f *fakeManager) Update(_ context.Context, member Member, input UpdateInput) (Listing, error) {
	f.gotMember, f.gotInput = member, input
	return testListing, f.err
}

func (f *fakeManager) SetLogo(_ context.Context, member Member, content []byte) (Listing, error) {
	f.gotMember, f.gotLogo = member, content
	return testListing, f.err
}

func (f *fakeManager) RemoveLogo(_ context.Context, member Member) (Listing, error) {
	f.gotMember, f.removed = member, true
	return testListing, f.err
}

func newRouter(listings Managed) *gin.Engine {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	NewHandler(listings, NewLimiter(time.Minute)).Register(router.Group("/v1"), auth.RequireUser(sessions{}), members{})
	return router
}

func serve(router *gin.Engine, method, path, token string, body *bytes.Buffer, contentType string) *httptest.ResponseRecorder {
	if body == nil {
		body = &bytes.Buffer{}
	}
	req := httptest.NewRequest(method, path, body)
	req.Header.Set("Content-Type", contentType)
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	return rec
}

func TestListingRoutesAreForTheManager(t *testing.T) {
	router := newRouter(&fakeManager{})

	if rec := serve(router, http.MethodGet, "/v1/company/listing", candidateToken, nil, ""); rec.Code != http.StatusForbidden {
		t.Errorf("candidate: status %d", rec.Code)
	}
	if rec := serve(router, http.MethodGet, "/v1/company/listing", managerToken, nil, ""); rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), `"slug":"sonatel"`) {
		t.Errorf("manager: status %d, body %s", rec.Code, rec.Body)
	}
}

func TestPutListingPassesTheMemberAndTheEdit(t *testing.T) {
	listings := &fakeManager{}
	body := bytes.NewBufferString(`{"name":"Sonatel","sector":"telecoms-energie","city":"Dakar","companyType":"","description":"Opérateur","website":"","email":"","phone":"","address":"","size":"","socialLinks":{},"expectedUpdatedAt":"2026-09-29T10:00:00.123456Z"}`)

	rec := serve(newRouter(listings), http.MethodPut, "/v1/company/listing", managerToken, body, "application/json")

	if rec.Code != http.StatusOK {
		t.Fatalf("status %d, body %s", rec.Code, rec.Body)
	}
	want := Member{UserID: manager.ID, CompanyID: membership.CompanyID, Slug: "sonatel"}
	if listings.gotMember != want || listings.gotInput.Description != "Opérateur" || listings.gotInput.ExpectedUpdatedAt.Nanosecond() != 123456000 {
		t.Errorf("service got %+v, %+v", listings.gotMember, listings.gotInput)
	}
}

func TestLogoRoutesReachTheService(t *testing.T) {
	listings := &fakeManager{}
	var body bytes.Buffer
	form := multipart.NewWriter(&body)
	part, _ := form.CreateFormFile("file", "logo.png")
	_, _ = part.Write([]byte("image"))
	_ = form.Close()
	router := newRouter(listings)

	if rec := serve(router, http.MethodPut, "/v1/company/listing/logo", managerToken, &body, form.FormDataContentType()); rec.Code != http.StatusOK || string(listings.gotLogo) != "image" {
		t.Errorf("upload: status %d, got %q", rec.Code, listings.gotLogo)
	}
	if rec := serve(router, http.MethodDelete, "/v1/company/listing/logo", managerToken, nil, ""); rec.Code != http.StatusOK || !listings.removed {
		t.Errorf("remove: status %d", rec.Code)
	}
}

func TestListingErrorsMapToStatusAndCode(t *testing.T) {
	tests := []struct {
		err    error
		status int
		code   string
	}{
		{ErrStale, http.StatusConflict, CodeStale},
		{&ValidationError{Fields: map[string]string{"website": "x"}}, http.StatusUnprocessableEntity, httpx.CodeValidation},
		{errors.New("database down"), http.StatusInternalServerError, httpx.CodeInternal},
	}
	for _, tt := range tests {
		t.Run(tt.code, func(t *testing.T) {
			rec := serve(newRouter(&fakeManager{err: tt.err}), http.MethodPut, "/v1/company/listing", managerToken, bytes.NewBufferString(`{}`), "application/json")

			if rec.Code != tt.status || !strings.Contains(rec.Body.String(), `"code":"`+tt.code+`"`) {
				t.Errorf("status %d, body %s", rec.Code, rec.Body)
			}
		})
	}
}
