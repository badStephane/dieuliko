package assistant

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

	"github.com/badStephane/dieuliko/apps/api/internal/ai"
	"github.com/badStephane/dieuliko/apps/api/internal/auth"
	"github.com/badStephane/dieuliko/apps/api/internal/candidate"
	"github.com/badStephane/dieuliko/apps/api/internal/httpx"
)

const candidateToken = "candidate-session"

// sessions authenticates the candidate token; other auth.Accounts methods are never called here.
type sessions struct{ auth.Accounts }

func (sessions) Authenticate(_ context.Context, token string) (auth.User, error) {
	if token != candidateToken {
		return auth.User{}, auth.ErrUnauthenticated
	}
	return auth.User{ID: userID, Role: auth.RoleCandidate}, nil
}

type fakeRewriter struct {
	answer  string
	err     error
	gotUser uuid.UUID
	got     RewriteInput
}

func (f *fakeRewriter) Rewrite(_ context.Context, user uuid.UUID, input RewriteInput) (string, error) {
	f.gotUser, f.got = user, input
	return f.answer, f.err
}

func newRouter(rewriter Rewriter) *gin.Engine {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	NewHandler(rewriter, NewLimiter(time.Minute)).Register(router.Group("/v1"), auth.RequireUser(sessions{}), candidate.RequireCandidate)
	return router
}

func post(router *gin.Engine, token, body string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodPost, "/v1/me/assist/rewrite", strings.NewReader(body))
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

func TestRewriteRouteReturnsTheProposal(t *testing.T) {
	rewriter := &fakeRewriter{answer: "Texte amélioré."}

	rec := post(newRouter(rewriter), candidateToken, `{"kind":"summary","text":"brouillon"}`)

	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), `"text":"Texte amélioré."`) {
		t.Fatalf("status %d, body %s", rec.Code, rec.Body)
	}
	if rewriter.gotUser != userID || rewriter.got.Text != "brouillon" {
		t.Errorf("service received %v, %+v", rewriter.gotUser, rewriter.got)
	}
}

func TestRewriteRouteRequiresACandidateSession(t *testing.T) {
	rec := post(newRouter(&fakeRewriter{}), "", `{"kind":"summary"}`)

	if rec.Code != http.StatusUnauthorized {
		t.Errorf("status %d, want 401", rec.Code)
	}
}

func TestRewriteRouteMapsErrors(t *testing.T) {
	tests := []struct {
		name   string
		err    error
		status int
		code   string
	}{
		{"validation", fieldError("text", "Trop long."), http.StatusUnprocessableEntity, httpx.CodeValidation},
		{"provider busy", ai.ErrBusy, http.StatusServiceUnavailable, CodeAIBusy},
		{"not configured", ai.ErrUnavailable, http.StatusServiceUnavailable, CodeAIUnavailable},
		{"empty answer", ai.ErrEmptyAnswer, http.StatusBadGateway, CodeAIFailed},
		{"unexpected", errors.New("db down"), http.StatusInternalServerError, httpx.CodeInternal},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rec := post(newRouter(&fakeRewriter{err: tt.err}), candidateToken, `{"kind":"summary","text":"x"}`)

			body := envelope(t, rec)
			if rec.Code != tt.status || body.Error == nil || body.Error.Code != tt.code {
				t.Errorf("status %d, body %s", rec.Code, rec.Body)
			}
		})
	}
}

func TestRewriteRouteIsRateLimitedPerCandidate(t *testing.T) {
	router := newRouter(&fakeRewriter{answer: "ok"})

	var rec *httptest.ResponseRecorder
	for range rewriteBurst + 1 {
		rec = post(router, candidateToken, `{"kind":"summary","text":"x"}`)
	}

	if rec.Code != http.StatusTooManyRequests {
		t.Errorf("status %d after %d calls, want 429", rec.Code, rewriteBurst+1)
	}
}
