package application

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"github.com/badStephane/dieuliko/apps/api/internal/auth"
	"github.com/badStephane/dieuliko/apps/api/internal/candidate"
	"github.com/badStephane/dieuliko/apps/api/internal/company"
)

const candidateToken = "candidate-session"

var (
	sessionUserID = uuid.MustParse("00000000-0000-0000-0000-00000000000a")
	sentID        = uuid.MustParse("00000000-0000-0000-0000-0000000000b1")
)

// sessions authenticates the candidate token; other auth.Accounts methods are never called here.
type sessions struct{ auth.Accounts }

func (sessions) Authenticate(_ context.Context, token string) (auth.User, error) {
	if token != candidateToken {
		return auth.User{}, auth.ErrUnauthenticated
	}
	return auth.User{ID: sessionUserID, Role: auth.RoleCandidate, Email: "awa@example.sn", FirstName: "Awa", LastName: "Diop", EmailVerified: true}, nil
}

var sentDetail = Detail{Application: Application{
	ID: sentID, CompanySlug: companySlug, CompanyName: "Cabinet Ndiaye", CompanyCity: "Dakar",
	Status: StatusSent, CreatedAt: time.Date(2026, 9, 28, 9, 0, 0, 0, time.UTC),
}}

// fakeApplications records calls and returns canned results; err applies to every call.
type fakeApplications struct {
	err          error
	gotApplicant Applicant
	gotSlug      string
	gotID        uuid.UUID
	withdrawn    bool
}

func (f *fakeApplications) Apply(_ context.Context, applicant Applicant, slug string) (Detail, error) {
	f.gotApplicant, f.gotSlug = applicant, slug
	return sentDetail, f.err
}

func (f *fakeApplications) List(context.Context, uuid.UUID) ([]Application, error) {
	return []Application{sentDetail.Application}, f.err
}

func (f *fakeApplications) Get(_ context.Context, _ uuid.UUID, id uuid.UUID) (Detail, error) {
	f.gotID = id
	return sentDetail, f.err
}

func (f *fakeApplications) Withdraw(_ context.Context, _ uuid.UUID, id uuid.UUID) error {
	f.gotID, f.withdrawn = id, true
	return f.err
}

func newRouter(applications Applications) *gin.Engine {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	NewHandler(applications, NewLimiter(time.Minute)).Register(router.Group("/v1"), auth.RequireUser(sessions{}), candidate.RequireCandidateSpace)
	return router
}

func call(router *gin.Engine, method, path, body string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+candidateToken)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	return rec
}

type envelope struct {
	Data  json.RawMessage `json:"data"`
	Error *struct {
		Code   string            `json:"code"`
		Fields map[string]string `json:"fields"`
	} `json:"error"`
}

func decode(t *testing.T, rec *httptest.ResponseRecorder) envelope {
	t.Helper()
	var body envelope
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode %s: %v", rec.Body.String(), err)
	}
	return body
}

func TestApplySendsTheSessionCandidateAndAnswersCreated(t *testing.T) {
	applications := &fakeApplications{}

	rec := call(newRouter(applications), http.MethodPost, "/v1/me/applications", `{"companySlug":"cabinet-ndiaye"}`)

	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d, body %s", rec.Code, rec.Body.String())
	}
	want := Applicant{ID: sessionUserID, FirstName: "Awa", LastName: "Diop", Email: "awa@example.sn", EmailVerified: true}
	if applications.gotApplicant != want || applications.gotSlug != companySlug {
		t.Errorf("applied as %+v to %q", applications.gotApplicant, applications.gotSlug)
	}
	if !strings.Contains(string(decode(t, rec).Data), `"status":"sent"`) {
		t.Errorf("body = %s", rec.Body.String())
	}
}

func TestApplyRejectsAMissingCompany(t *testing.T) {
	applications := &fakeApplications{}

	rec := call(newRouter(applications), http.MethodPost, "/v1/me/applications", `{"companySlug":""}`)

	body := decode(t, rec)
	if rec.Code != http.StatusUnprocessableEntity || body.Error == nil || body.Error.Fields["companySlug"] == "" {
		t.Errorf("status = %d, body %s", rec.Code, rec.Body.String())
	}
	if applications.gotSlug != "" {
		t.Error("the service was called")
	}
}

func TestApplyMapsServiceErrors(t *testing.T) {
	tests := []struct {
		err    error
		status int
		code   string
	}{
		{&ValidationError{Fields: map[string]string{"cv": "Ajoutez votre CV."}}, http.StatusUnprocessableEntity, "validation_failed"},
		{ErrEmailUnverified, http.StatusForbidden, CodeEmailUnverified},
		{company.ErrNotFound, http.StatusNotFound, "not_found"},
		{ErrAlreadyApplied, http.StatusConflict, CodeAlreadyApplied},
		{ErrDailyLimit, http.StatusTooManyRequests, CodeDailyLimit},
	}
	for _, tt := range tests {
		t.Run(tt.code, func(t *testing.T) {
			rec := call(newRouter(&fakeApplications{err: tt.err}), http.MethodPost, "/v1/me/applications", `{"companySlug":"cabinet-ndiaye"}`)

			body := decode(t, rec)
			if rec.Code != tt.status || body.Error == nil || body.Error.Code != tt.code {
				t.Errorf("status = %d, body %s", rec.Code, rec.Body.String())
			}
		})
	}
}

func TestListGetAndWithdraw(t *testing.T) {
	applications := &fakeApplications{}
	router := newRouter(applications)
	path := "/v1/me/applications/" + sentID.String()

	if rec := call(router, http.MethodGet, "/v1/me/applications", ""); rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), sentID.String()) {
		t.Errorf("list: status %d body %s", rec.Code, rec.Body.String())
	}
	if rec := call(router, http.MethodGet, path, ""); rec.Code != http.StatusOK || applications.gotID != sentID {
		t.Errorf("get: status %d, id %s", rec.Code, applications.gotID)
	}
	if rec := call(router, http.MethodPost, path+"/withdraw", ""); rec.Code != http.StatusOK || !applications.withdrawn {
		t.Errorf("withdraw: status %d, withdrawn %v", rec.Code, applications.withdrawn)
	}
}

func TestUnknownOrMalformedApplicationIsNotFound(t *testing.T) {
	tests := []struct {
		name string
		path string
		err  error
	}{
		{"malformed id", "/v1/me/applications/pas-un-uuid", nil},
		{"unknown id", "/v1/me/applications/" + sentID.String(), ErrNotFound},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rec := call(newRouter(&fakeApplications{err: tt.err}), http.MethodGet, tt.path, "")

			if rec.Code != http.StatusNotFound {
				t.Errorf("status = %d, body %s", rec.Code, rec.Body.String())
			}
		})
	}
}

func TestApplicationsNeedASession(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/v1/me/applications", nil)
	rec := httptest.NewRecorder()

	newRouter(&fakeApplications{}).ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Errorf("status = %d", rec.Code)
	}
}
