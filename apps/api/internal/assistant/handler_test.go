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
	"github.com/badStephane/dieuliko/apps/api/internal/company"
	"github.com/badStephane/dieuliko/apps/api/internal/httpx"
)

const candidateToken = "candidate-session"

// sessions authenticates the candidate token; other auth.Accounts methods are never called here.
type sessions struct{ auth.Accounts }

func (sessions) Authenticate(_ context.Context, token string) (auth.User, error) {
	if token != candidateToken {
		return auth.User{}, auth.ErrUnauthenticated
	}
	return auth.User{ID: userID, Role: auth.RoleCandidate, FirstName: "Awa", LastName: "Diop"}, nil
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

// fakeLetters records calls and returns canned results; err applies to every call.
type fakeLetters struct {
	err        error
	gotAuthor  Author
	gotSlug    string
	gotContent string
	deleted    bool
}

var testLetter = Letter{CompanySlug: "cabinet-ndiaye", CompanyName: "Cabinet Ndiaye", CompanyCity: "Dakar", Content: "Madame, Monsieur,", UpdatedAt: time.Date(2026, 9, 28, 9, 0, 0, 0, time.UTC)}

func (f *fakeLetters) List(context.Context, uuid.UUID) ([]Letter, error) {
	return []Letter{testLetter}, f.err
}

func (f *fakeLetters) Get(_ context.Context, _ uuid.UUID, slug string) (Letter, error) {
	f.gotSlug = slug
	return testLetter, f.err
}

func (f *fakeLetters) Generate(_ context.Context, author Author, slug string) (Letter, error) {
	f.gotAuthor, f.gotSlug = author, slug
	return testLetter, f.err
}

func (f *fakeLetters) Save(_ context.Context, _ uuid.UUID, slug, content string) (Letter, error) {
	f.gotSlug, f.gotContent = slug, content
	return testLetter, f.err
}

func (f *fakeLetters) Delete(_ context.Context, _ uuid.UUID, slug string) error {
	f.gotSlug, f.deleted = slug, true
	return f.err
}

func newRouter(rewriter Rewriter) *gin.Engine {
	return newRouterWith(rewriter, &fakeLetters{})
}

func newRouterWith(rewriter Rewriter, letters Letters) *gin.Engine {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	NewHandler(rewriter, letters, NewLimiter(time.Minute)).Register(router.Group("/v1"), auth.RequireUser(sessions{}), candidate.RequireCandidateSpace)
	return router
}

func request(router *gin.Engine, method, path, body string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+candidateToken)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	return rec
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

func TestLetterRoutes(t *testing.T) {
	letters := &fakeLetters{}
	router := newRouterWith(&fakeRewriter{}, letters)

	list := request(router, http.MethodGet, "/v1/me/letters", "")
	get := request(router, http.MethodGet, "/v1/me/letters/cabinet-ndiaye", "")
	generate := request(router, http.MethodPost, "/v1/me/letters/cabinet-ndiaye/generate", "")
	author := letters.gotAuthor
	save := request(router, http.MethodPut, "/v1/me/letters/cabinet-ndiaye", `{"content":"Ma lettre."}`)
	content := letters.gotContent
	remove := request(router, http.MethodDelete, "/v1/me/letters/cabinet-ndiaye", "")

	for name, rec := range map[string]*httptest.ResponseRecorder{"list": list, "get": get, "generate": generate, "save": save, "delete": remove} {
		if rec.Code != http.StatusOK {
			t.Errorf("%s: status %d, body %s", name, rec.Code, rec.Body)
		}
	}
	if !strings.Contains(list.Body.String(), `"companyName":"Cabinet Ndiaye"`) {
		t.Errorf("list body %s", list.Body)
	}
	if author.ID != userID || author.FirstName != "Awa" || author.LastName != "Diop" {
		t.Errorf("letter written for %+v, want the session's candidate", author)
	}
	if content != "Ma lettre." || !letters.deleted || letters.gotSlug != "cabinet-ndiaye" {
		t.Errorf("service received content %q, deleted %v, slug %q", content, letters.deleted, letters.gotSlug)
	}
}

func TestLetterRoutesAcceptALetterAtItsFullLength(t *testing.T) {
	letters := &fakeLetters{}
	body := `{"content":"` + strings.Repeat("é", MaxLetterLength) + `"}`

	rec := request(newRouterWith(&fakeRewriter{}, letters), http.MethodPut, "/v1/me/letters/cabinet-ndiaye", body)

	if rec.Code != http.StatusOK {
		t.Errorf("status %d: a %d-character letter must fit in the request", rec.Code, MaxLetterLength)
	}
}

func TestLetterRoutesMapErrors(t *testing.T) {
	tests := []struct {
		name   string
		err    error
		status int
		code   string
	}{
		{"no letter yet", ErrNoLetter, http.StatusNotFound, CodeNoLetter},
		{"unknown company", company.ErrNotFound, http.StatusNotFound, httpx.CodeNotFound},
		{"profile to complete", fieldError("profile", "Complétez votre profil."), http.StatusUnprocessableEntity, httpx.CodeValidation},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rec := request(newRouterWith(&fakeRewriter{}, &fakeLetters{err: tt.err}), http.MethodGet, "/v1/me/letters/x", "")

			body := envelope(t, rec)
			if rec.Code != tt.status || body.Error == nil || body.Error.Code != tt.code {
				t.Errorf("status %d, body %s", rec.Code, rec.Body)
			}
		})
	}
}

func TestLetterGenerationSharesTheAssistantBudget(t *testing.T) {
	router := newRouterWith(&fakeRewriter{answer: "ok"}, &fakeLetters{})

	for range rewriteBurst {
		post(router, candidateToken, `{"kind":"summary","text":"x"}`)
	}
	rec := request(router, http.MethodPost, "/v1/me/letters/cabinet-ndiaye/generate", "")

	if rec.Code != http.StatusTooManyRequests {
		t.Errorf("status %d, want 429 once the budget is spent on rewrites", rec.Code)
	}
}
