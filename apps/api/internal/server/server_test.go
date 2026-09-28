package server

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/badStephane/dieuliko/apps/api/internal/assistant"
	"github.com/badStephane/dieuliko/apps/api/internal/auth"
	"github.com/badStephane/dieuliko/apps/api/internal/candidate"
	"github.com/badStephane/dieuliko/apps/api/internal/company"
	"github.com/badStephane/dieuliko/apps/api/internal/config"
	"github.com/badStephane/dieuliko/apps/api/internal/httpx"
)

const internalToken = "0123456789abcdef0123456789abcdef"

type pinger struct{ err error }

func (p pinger) Ping(context.Context) error { return p.err }

// emptyDirectory is a Repository with no companies.
type emptyDirectory struct{}

func (emptyDirectory) Search(context.Context, company.Filters, company.PageRequest) (company.Page, error) {
	return company.Page{Items: []company.Company{}}, nil
}

func (emptyDirectory) FindBySlug(context.Context, string) (company.Company, error) {
	return company.Company{}, company.ErrNotFound
}

func (emptyDirectory) Slugs(context.Context) ([]string, error) { return []string{}, nil }

func (emptyDirectory) SectorCounts(context.Context) ([]company.SectorCount, error) {
	return []company.SectorCount{}, nil
}

func (emptyDirectory) CityCounts(context.Context) ([]company.CityCount, error) {
	return []company.CityCount{}, nil
}

// noAccounts rejects every session; enough to check the auth routes are mounted.
type noAccounts struct{}

func (noAccounts) Register(context.Context, auth.RegisterInput) (auth.User, auth.Session, error) {
	return auth.User{}, auth.Session{}, auth.ErrEmailTaken
}

func (noAccounts) Login(context.Context, string, string) (auth.User, auth.Session, error) {
	return auth.User{}, auth.Session{}, auth.ErrInvalidCredentials
}

func (noAccounts) Logout(context.Context, string) error { return nil }

func (noAccounts) Authenticate(context.Context, string) (auth.User, error) {
	return auth.User{}, auth.ErrUnauthenticated
}

func (noAccounts) ResendVerification(context.Context, auth.User) error { return nil }

func (noAccounts) VerifyEmail(context.Context, string) error { return auth.ErrInvalidToken }

func (noAccounts) RequestPasswordReset(context.Context, string) error { return nil }

func (noAccounts) ResetPassword(context.Context, string, string) error { return auth.ErrInvalidToken }

func deps(db Pinger, burst int) Deps {
	return Deps{
		Config:      config.Config{CORSOrigins: []string{"https://dieuliko.sn"}, InternalToken: internalToken},
		Logger:      slog.New(slog.NewTextHandler(io.Discard, nil)),
		DB:          db,
		Companies:   emptyDirectory{},
		RateLimiter: httpx.NewRateLimiter(1, burst, time.Minute),
		// Twice the public burst: internal calls outlast public ones but stay bounded.
		InternalLimiter: httpx.NewRateLimiter(1, 2*burst, time.Minute),
		Accounts:        noAccounts{},
		AuthLimiters:    auth.NewLimiters(time.Minute),
		// Candidate routes are only checked to be mounted behind the session: the services are never reached.
		UploadLimiter: candidate.NewUploadLimiter(time.Minute),
		AssistLimiter: assistant.NewLimiter(time.Minute),
	}
}

func newTestServer(t *testing.T, db Pinger, burst int) http.Handler {
	t.Helper()
	gin.SetMode(gin.TestMode)
	handler, err := New(deps(db, burst))
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	return handler
}

func do(handler http.Handler, method, path string, headers map[string]string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, path, nil)
	for key, value := range headers {
		req.Header.Set(key, value)
	}
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	return rec
}

func TestProbes(t *testing.T) {
	healthy := newTestServer(t, pinger{}, 10)
	down := newTestServer(t, pinger{err: errors.New("connection refused")}, 10)

	tests := []struct {
		name    string
		handler http.Handler
		path    string
		status  int
	}{
		{"liveness ignores the database", down, "/healthz", http.StatusOK},
		{"ready when the database answers", healthy, "/readyz", http.StatusOK},
		{"not ready without database", down, "/readyz", http.StatusServiceUnavailable},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if rec := do(tt.handler, http.MethodGet, tt.path, nil); rec.Code != tt.status {
				t.Fatalf("status %d, want %d (%s)", rec.Code, tt.status, rec.Body.String())
			}
		})
	}
}

func TestMountsDirectoryRoutesUnderV1(t *testing.T) {
	handler := newTestServer(t, pinger{}, 10)

	rec := do(handler, http.MethodGet, "/v1/companies", nil)

	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), `"meta":{"total":0`) {
		t.Fatalf("status %d body %s", rec.Code, rec.Body.String())
	}
	if rec.Header().Get("X-Request-ID") == "" || rec.Header().Get("X-Content-Type-Options") != "nosniff" {
		t.Errorf("missing global headers: %v", rec.Header())
	}
}

func TestMountsAuthRoutesUnderV1(t *testing.T) {
	handler := newTestServer(t, pinger{}, 10)

	rec := do(handler, http.MethodGet, "/v1/auth/me", nil)

	if rec.Code != http.StatusUnauthorized || !strings.Contains(rec.Body.String(), `"code":"unauthenticated"`) {
		t.Fatalf("status %d body %s", rec.Code, rec.Body.String())
	}
}

func TestMountsCandidateRoutesUnderV1BehindASession(t *testing.T) {
	handler := newTestServer(t, pinger{}, 10)

	for _, route := range []struct{ method, path string }{
		{http.MethodGet, "/v1/me/profile"},
		{http.MethodGet, "/v1/me/cv"},
		{http.MethodPost, "/v1/me/assist/rewrite"},
	} {
		path := route.path
		rec := do(handler, route.method, path, nil)

		if rec.Code != http.StatusUnauthorized || !strings.Contains(rec.Body.String(), `"code":"unauthenticated"`) {
			t.Errorf("%s: status %d body %s", path, rec.Code, rec.Body.String())
		}
	}
}

func TestUnknownRoutesAndMethodsUseTheEnvelope(t *testing.T) {
	handler := newTestServer(t, pinger{}, 10)

	notFound := do(handler, http.MethodGet, "/v2/nothing", nil)
	notAllowed := do(handler, http.MethodDelete, "/v1/companies", nil)

	if notFound.Code != http.StatusNotFound || !strings.Contains(notFound.Body.String(), `"code":"not_found"`) {
		t.Errorf("404: %d %s", notFound.Code, notFound.Body.String())
	}
	if notAllowed.Code != http.StatusMethodNotAllowed || !strings.Contains(notAllowed.Body.String(), `"code":"method_not_allowed"`) {
		t.Errorf("405: %d %s", notAllowed.Code, notAllowed.Body.String())
	}
}

func TestCORSAllowsOnlyConfiguredOrigins(t *testing.T) {
	handler := newTestServer(t, pinger{}, 10)

	allowed := do(handler, http.MethodGet, "/v1/sectors", map[string]string{"Origin": "https://dieuliko.sn"})
	foreign := do(handler, http.MethodGet, "/v1/sectors", map[string]string{"Origin": "https://evil.example"})

	if got := allowed.Header().Get("Access-Control-Allow-Origin"); got != "https://dieuliko.sn" {
		t.Errorf("allowed origin header = %q", got)
	}
	if foreign.Header().Get("Access-Control-Allow-Origin") != "" {
		t.Errorf("foreign origin got CORS headers: %v", foreign.Header())
	}
}

func TestRateLimitAppliesToAPIButNotProbes(t *testing.T) {
	handler := newTestServer(t, pinger{}, 1)

	do(handler, http.MethodGet, "/v1/sectors", nil)
	limited := do(handler, http.MethodGet, "/v1/sectors", nil)
	probe := do(handler, http.MethodGet, "/healthz", nil)

	if limited.Code != http.StatusTooManyRequests {
		t.Errorf("second API call: %d, want 429", limited.Code)
	}
	if probe.Code != http.StatusOK {
		t.Errorf("probe: %d, want 200", probe.Code)
	}
}

func TestInternalTokenUsesTheInternalBudget(t *testing.T) {
	handler := newTestServer(t, pinger{}, 1)
	internal := map[string]string{httpx.InternalTokenHeader: internalToken}

	for i := range 2 {
		if rec := do(handler, http.MethodGet, "/v1/sectors", internal); rec.Code != http.StatusOK {
			t.Fatalf("internal call %d: %d, want 200", i, rec.Code)
		}
	}
	if rec := do(handler, http.MethodGet, "/v1/sectors", internal); rec.Code != http.StatusTooManyRequests {
		t.Fatalf("internal call over budget: %d, want 429", rec.Code)
	}
	if rec := do(handler, http.MethodGet, "/v1/sectors", nil); rec.Code != http.StatusOK {
		t.Fatalf("public call: %d, want 200 (separate bucket)", rec.Code)
	}
}

func TestRejectsInvalidTrustedProxies(t *testing.T) {
	d := deps(pinger{}, 1)
	d.Config.TrustedProxies = []string{"not-an-ip"}

	if _, err := New(d); err == nil {
		t.Fatal("New succeeded, want a trusted proxies error")
	}
}
