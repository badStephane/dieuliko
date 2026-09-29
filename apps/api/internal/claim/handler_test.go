package claim

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"github.com/badStephane/dieuliko/apps/api/internal/auth"
	"github.com/badStephane/dieuliko/apps/api/internal/company"
	"github.com/badStephane/dieuliko/apps/api/internal/httpx"
)

const (
	companyToken   = "company-session"
	candidateToken = "candidate-session"
	adminToken     = "admin-session"
)

var companyUser = auth.User{ID: uuid.MustParse("00000000-0000-0000-0000-00000000000c"), Role: auth.RoleCompany, EmailVerified: true}

// sessions authenticates the test tokens; other auth.Accounts methods are never called here.
type sessions struct{ auth.Accounts }

func (sessions) Authenticate(_ context.Context, token string) (auth.User, error) {
	switch token {
	case companyToken:
		return companyUser, nil
	case candidateToken:
		return auth.User{ID: uuid.New(), Role: auth.RoleCandidate}, nil
	case adminToken:
		return auth.User{ID: uuid.New(), Role: auth.RoleAdmin}, nil
	}
	return auth.User{}, auth.ErrUnauthenticated
}

// fakeClaims records calls and returns canned results; err applies to every call.
type fakeClaims struct {
	current      *Claim
	err          error
	gotRequester Requester
	gotInput     RequestInput
	cancelled    bool
}

var testClaim = Claim{
	ID: uuid.MustParse("00000000-0000-0000-0000-0000000000c1"), Status: StatusPending, JobTitle: "DRH",
	CreatedAt: time.Date(2026, 9, 29, 9, 0, 0, 0, time.UTC), Company: Listing{Slug: "sonatel", Name: "Sonatel", City: "Dakar"},
}

func (f *fakeClaims) Current(context.Context, uuid.UUID) (*Claim, error) { return f.current, f.err }

func (f *fakeClaims) Request(_ context.Context, requester Requester, input RequestInput) (Claim, error) {
	f.gotRequester, f.gotInput = requester, input
	return testClaim, f.err
}

func (f *fakeClaims) Cancel(context.Context, uuid.UUID) error {
	f.cancelled = true
	return f.err
}

func newRouter(claims Claims) *gin.Engine {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	NewHandler(claims).Register(router.Group("/v1"), auth.RequireUser(sessions{}))
	return router
}

func serve(router *gin.Engine, method, token, body string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, "/v1/company/claim", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	return rec
}

func envelope(t *testing.T, rec *httptest.ResponseRecorder) httpx.Envelope {
	t.Helper()
	var body httpx.Envelope
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode %q: %v", rec.Body, err)
	}
	return body
}

func TestClaimRoutesAreForCompanyAccounts(t *testing.T) {
	router := newRouter(&fakeClaims{})
	tests := []struct {
		name   string
		token  string
		status int
	}{
		{"no session", "", http.StatusUnauthorized},
		{"candidate", candidateToken, http.StatusForbidden},
		{"admin", adminToken, http.StatusForbidden},
		{"company", companyToken, http.StatusOK},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if rec := serve(router, http.MethodGet, tt.token, ""); rec.Code != tt.status {
				t.Errorf("status %d, want %d: %s", rec.Code, tt.status, rec.Body)
			}
		})
	}
}

func TestGetClaimReturnsNullWithoutARequest(t *testing.T) {
	rec := serve(newRouter(&fakeClaims{}), http.MethodGet, companyToken, "")

	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), `"data":null`) {
		t.Errorf("status %d, body %s", rec.Code, rec.Body)
	}
}

func TestPostClaimPassesTheAccountAndInput(t *testing.T) {
	claims := &fakeClaims{}

	rec := serve(newRouter(claims), http.MethodPost, companyToken, `{"companySlug":"sonatel","jobTitle":"DRH","phone":"","message":""}`)

	if rec.Code != http.StatusCreated || !strings.Contains(rec.Body.String(), `"slug":"sonatel"`) {
		t.Fatalf("status %d, body %s", rec.Code, rec.Body)
	}
	if claims.gotRequester != (Requester{ID: companyUser.ID, EmailVerified: true}) || claims.gotInput.CompanySlug != "sonatel" {
		t.Errorf("service received %+v, %+v", claims.gotRequester, claims.gotInput)
	}
}

func TestDeleteClaimCancelsIt(t *testing.T) {
	claims := &fakeClaims{}

	rec := serve(newRouter(claims), http.MethodDelete, companyToken, "")

	if rec.Code != http.StatusOK || !claims.cancelled {
		t.Errorf("status %d, cancelled %v", rec.Code, claims.cancelled)
	}
}

func TestClaimErrorsMapToStatusAndCode(t *testing.T) {
	tests := []struct {
		err    error
		status int
		code   string
	}{
		{&ValidationError{Fields: map[string]string{"jobTitle": "x"}}, http.StatusUnprocessableEntity, httpx.CodeValidation},
		{ErrEmailUnverified, http.StatusForbidden, CodeEmailUnverified},
		{company.ErrNotFound, http.StatusNotFound, httpx.CodeNotFound},
		{ErrClaimOpen, http.StatusConflict, CodeClaimOpen},
		{ErrCompanyClaimed, http.StatusConflict, CodeCompanyClaimed},
		{ErrNoPendingClaim, http.StatusNotFound, CodeNoPendingClaim},
		{errors.New("database down"), http.StatusInternalServerError, httpx.CodeInternal},
	}
	for _, tt := range tests {
		t.Run(tt.code, func(t *testing.T) {
			rec := serve(newRouter(&fakeClaims{err: tt.err}), http.MethodPost, companyToken, `{"companySlug":"sonatel","jobTitle":"DRH"}`)

			body := envelope(t, rec)
			if rec.Code != tt.status || body.Error == nil || body.Error.Code != tt.code {
				t.Errorf("status %d, body %s", rec.Code, rec.Body)
			}
		})
	}
}
