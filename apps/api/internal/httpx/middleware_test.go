package httpx

import (
	"bytes"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
)

func newRouter(middleware ...gin.HandlerFunc) *gin.Engine {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.Use(middleware...)
	return router
}

func get(router http.Handler, path string) *httptest.ResponseRecorder {
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, path, nil))
	return rec
}

func TestRateLimiterRefusesClientsOverBudget(t *testing.T) {
	limiter := NewRateLimiter(1, 2, time.Minute)
	now := time.Unix(0, 0)
	limiter.now = func() time.Time { return now }

	if !limiter.Allow("a") || !limiter.Allow("a") {
		t.Fatal("burst of 2 should be allowed")
	}
	if limiter.Allow("a") {
		t.Fatal("third immediate request should be refused")
	}
	if !limiter.Allow("b") {
		t.Fatal("other clients have their own bucket")
	}

	now = now.Add(time.Second)
	if !limiter.Allow("a") {
		t.Fatal("bucket should refill after one second")
	}
}

func TestRateLimiterEvictsIdleClients(t *testing.T) {
	limiter := NewRateLimiter(1, 1, time.Minute)
	now := time.Unix(0, 0)
	limiter.now = func() time.Time { return now }
	limiter.Allow("idle")
	now = now.Add(30 * time.Second)
	limiter.Allow("active")

	now = now.Add(45 * time.Second)
	limiter.Evict()

	if _, ok := limiter.clients["idle"]; ok {
		t.Error("idle client should be evicted")
	}
	if _, ok := limiter.clients["active"]; !ok {
		t.Error("recently seen client should be kept")
	}
}

func TestRateLimiterMiddlewareAnswers429(t *testing.T) {
	never := func(*gin.Context) bool { return false }
	router := newRouter(RateLimit(NewRateLimiter(1, 1, time.Minute), NewRateLimiter(1, 1, time.Minute), never))
	router.GET("/", func(c *gin.Context) { OK(c, "hi") })

	if rec := get(router, "/"); rec.Code != http.StatusOK {
		t.Fatalf("first request: %d", rec.Code)
	}
	rec := get(router, "/")

	if rec.Code != http.StatusTooManyRequests || rec.Header().Get("Retry-After") != "1" {
		t.Fatalf("second request: %d, Retry-After %q", rec.Code, rec.Header().Get("Retry-After"))
	}
	if !strings.Contains(rec.Body.String(), `"code":"rate_limited"`) {
		t.Errorf("body %s", rec.Body.String())
	}
}

func TestRecoverTurnsPanicsIntoInternalErrors(t *testing.T) {
	var logs bytes.Buffer
	logger := slog.New(slog.NewTextHandler(&logs, nil))
	router := newRouter(AccessLog(logger), Recover())
	router.GET("/boom", func(*gin.Context) { panic("secret detail") })

	rec := get(router, "/boom")

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("status %d", rec.Code)
	}
	if strings.Contains(rec.Body.String(), "secret detail") || !strings.Contains(rec.Body.String(), `"code":"internal_error"`) {
		t.Errorf("body %s", rec.Body.String())
	}
	if !strings.Contains(logs.String(), "panic: secret detail") || !strings.Contains(logs.String(), "level=ERROR") {
		t.Errorf("logs %s", logs.String())
	}
}

func TestAccessLogRecordsRouteAndStatus(t *testing.T) {
	var logs bytes.Buffer
	router := newRouter(AccessLog(slog.New(slog.NewTextHandler(&logs, nil))))
	router.GET("/items/:id", func(c *gin.Context) { OK(c, nil) })

	get(router, "/items/42")

	for _, want := range []string{"level=INFO", "route=/items/:id", "path=/items/42", "status=200"} {
		if !strings.Contains(logs.String(), want) {
			t.Errorf("logs %q missing %q", logs.String(), want)
		}
	}
}

func TestSecurityHeaders(t *testing.T) {
	router := newRouter(SecurityHeaders())
	router.GET("/", func(c *gin.Context) { OK(c, nil) })

	rec := get(router, "/")

	for header, want := range map[string]string{
		"X-Content-Type-Options": "nosniff",
		"X-Frame-Options":        "DENY",
		"Referrer-Policy":        "no-referrer",
	} {
		if got := rec.Header().Get(header); got != want {
			t.Errorf("%s = %q, want %q", header, got, want)
		}
	}
}

func TestEnvelopes(t *testing.T) {
	router := newRouter()
	router.GET("/ok", func(c *gin.Context) { OK(c, []int{1}) })
	router.GET("/page", func(c *gin.Context) { OKPage(c, []int{}, PageMeta{Total: 3, Offset: 0, Limit: 12}) })
	router.GET("/fail", func(c *gin.Context) { Fail(c, http.StatusNotFound, CodeNotFound, "Introuvable.") })

	tests := map[string]string{
		"/ok":   `{"success":true,"data":[1],"error":null}`,
		"/page": `{"success":true,"data":[],"error":null,"meta":{"total":3,"offset":0,"limit":12}}`,
		"/fail": `{"success":false,"data":null,"error":{"code":"not_found","message":"Introuvable."}}`,
	}
	for path, want := range tests {
		if got := get(router, path).Body.String(); got != want {
			t.Errorf("%s = %s, want %s", path, got, want)
		}
	}
}

func TestHasInternalToken(t *testing.T) {
	tests := []struct {
		name      string
		token     string
		presented string
		want      bool
	}{
		{"matching token", "s3cret", "s3cret", true},
		{"wrong token", "s3cret", "guess", false},
		{"missing header", "s3cret", "", false},
		{"feature disabled", "", "", false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			c, _ := gin.CreateTestContext(httptest.NewRecorder())
			c.Request = httptest.NewRequest(http.MethodGet, "/", nil)
			if tt.presented != "" {
				c.Request.Header.Set(InternalTokenHeader, tt.presented)
			}

			if got := HasInternalToken(tt.token)(c); got != tt.want {
				t.Errorf("got %v, want %v", got, tt.want)
			}
		})
	}
}

func TestRateLimitGivesInternalRequestsTheirOwnFiniteBucket(t *testing.T) {
	isInternal := func(c *gin.Context) bool { return c.GetHeader(InternalTokenHeader) == "ok" }
	router := newRouter(RateLimit(NewRateLimiter(1, 1, time.Minute), NewRateLimiter(1, 3, time.Minute), isInternal))
	router.GET("/", func(c *gin.Context) { OK(c, nil) })
	internalGet := func() int {
		rec := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, "/", nil)
		req.Header.Set(InternalTokenHeader, "ok")
		router.ServeHTTP(rec, req)
		return rec.Code
	}

	for i := range 3 {
		if code := internalGet(); code != http.StatusOK {
			t.Fatalf("internal request %d: %d, want 200 (larger burst)", i, code)
		}
	}
	if code := internalGet(); code != http.StatusTooManyRequests {
		t.Fatalf("internal request over budget: %d, want 429", code)
	}
	if code := get(router, "/").Code; code != http.StatusOK {
		t.Fatalf("public request: %d, want 200 (separate bucket)", code)
	}
}
