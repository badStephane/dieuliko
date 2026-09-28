package admin

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"github.com/badStephane/dieuliko/apps/api/internal/auth"
)

const (
	adminToken     = "admin-session"
	candidateToken = "candidate-session"
)

var adminID = uuid.MustParse("00000000-0000-0000-0000-0000000000ad")

// sessions authenticates one admin and one candidate token; other auth.Accounts methods are never called here.
type sessions struct{ auth.Accounts }

func (sessions) Authenticate(_ context.Context, token string) (auth.User, error) {
	switch token {
	case adminToken:
		return auth.User{ID: adminID, Role: auth.RoleAdmin, FirstName: "Admin", LastName: "Dieuliko"}, nil
	case candidateToken:
		return auth.User{ID: uuid.New(), Role: auth.RoleCandidate, FirstName: "Awa", LastName: "Diop"}, nil
	default:
		return auth.User{}, auth.ErrUnauthenticated
	}
}

type fakeStats struct{ stats Stats }

func (f fakeStats) Get(context.Context) (Stats, error) { return f.stats, nil }

// newRouter mounts the back-office with the given services; unset ones are never reached by the test.
func newRouter(services Services) *gin.Engine {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	NewHandler(services, NewLimiter(time.Minute)).Register(router.Group("/v1"), auth.RequireUser(sessions{}))
	return router
}

func send(router *gin.Engine, method, path, token, body string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	return rec
}

func TestTheBackOfficeIsForAdminsOnly(t *testing.T) {
	router := newRouter(Services{Stats: fakeStats{}})
	tests := []struct {
		name   string
		token  string
		status int
	}{
		{"no session", "", http.StatusUnauthorized},
		{"candidate", candidateToken, http.StatusForbidden},
		{"admin", adminToken, http.StatusOK},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if rec := send(router, http.MethodGet, "/v1/admin/stats", tt.token, ""); rec.Code != tt.status {
				t.Errorf("status = %d, want %d (body %s)", rec.Code, tt.status, rec.Body.String())
			}
		})
	}
}

func TestStatsAreServedToAdmins(t *testing.T) {
	router := newRouter(Services{Stats: fakeStats{stats: Stats{Letters: 7, TopCompanies: []TopCompany{}}}})

	rec := send(router, http.MethodGet, "/v1/admin/stats", adminToken, "")

	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), `"letters":7`) {
		t.Errorf("status %d body %s", rec.Code, rec.Body.String())
	}
}
