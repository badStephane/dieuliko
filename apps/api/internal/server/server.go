// Package server assembles the Gin router: global middleware, health probes and versioned routes.
package server

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-contrib/requestid"
	"github.com/gin-gonic/gin"

	"github.com/badStephane/dieuliko/apps/api/internal/assistant"
	"github.com/badStephane/dieuliko/apps/api/internal/auth"
	"github.com/badStephane/dieuliko/apps/api/internal/candidate"
	"github.com/badStephane/dieuliko/apps/api/internal/company"
	"github.com/badStephane/dieuliko/apps/api/internal/config"
	"github.com/badStephane/dieuliko/apps/api/internal/httpx"
)

const (
	readinessTimeout = 2 * time.Second
	corsMaxAge       = 12 * time.Hour
	// RateLimiterIdleTTL is how long an idle client's bucket is kept.
	RateLimiterIdleTTL = 10 * time.Minute
)

// Pinger checks that a dependency (PostgreSQL) is reachable.
type Pinger interface {
	Ping(ctx context.Context) error
}

// Deps are the collaborators the router needs.
type Deps struct {
	Config    config.Config
	Logger    *slog.Logger
	DB        Pinger
	Companies company.Repository
	// RateLimiter budgets public clients (per IP); InternalLimiter budgets token-bearing server calls.
	RateLimiter     *httpx.RateLimiter
	InternalLimiter *httpx.RateLimiter
	Accounts        auth.Accounts
	AuthLimiters    auth.Limiters
	Profiles        candidate.Profiles
	CVs             candidate.CVs
	// UploadLimiter budgets CV uploads per candidate.
	UploadLimiter *httpx.RateLimiter
	Assistant     assistant.Rewriter
	// AssistLimiter budgets writing-assistant requests per candidate.
	AssistLimiter *httpx.RateLimiter
}

// New returns the HTTP handler of the API.
func New(deps Deps) (*gin.Engine, error) {
	router := gin.New()
	if err := router.SetTrustedProxies(deps.Config.TrustedProxies); err != nil {
		return nil, fmt.Errorf("server: trusted proxies: %w", err)
	}
	router.HandleMethodNotAllowed = true
	router.NoRoute(func(c *gin.Context) {
		httpx.Fail(c, http.StatusNotFound, httpx.CodeNotFound, "Ressource introuvable.")
	})
	router.NoMethod(func(c *gin.Context) {
		httpx.Fail(c, http.StatusMethodNotAllowed, httpx.CodeNotAllowed, "Méthode non autorisée.")
	})

	router.Use(
		requestid.New(),
		httpx.AccessLog(deps.Logger),
		httpx.Recover(),
		httpx.SecurityHeaders(),
		cors.New(cors.Config{
			AllowOrigins: deps.Config.CORSOrigins,
			AllowMethods: []string{http.MethodGet, http.MethodOptions},
			// The browser only reads the public directory; account calls go through the Next.js server.
			AllowHeaders: []string{"Content-Type", "X-Request-ID"},
			MaxAge:       corsMaxAge,
		}),
	)

	// Probes stay outside the rate limiter so orchestrators are never throttled.
	router.GET("/healthz", func(c *gin.Context) { httpx.OK(c, gin.H{"status": "ok"}) })
	router.GET("/readyz", readiness(deps.DB))

	isInternal := httpx.HasInternalToken(deps.Config.InternalToken)
	v1 := router.Group("/v1", httpx.RateLimit(deps.RateLimiter, deps.InternalLimiter, isInternal))
	company.NewHandler(deps.Companies).Register(v1)
	auth.NewHandler(deps.Accounts, deps.AuthLimiters, httpx.EndUserIP(isInternal)).Register(v1)
	candidate.NewHandler(deps.Profiles, deps.CVs, deps.UploadLimiter).Register(v1, auth.RequireUser(deps.Accounts))
	assistant.NewHandler(deps.Assistant, deps.AssistLimiter).Register(v1, auth.RequireUser(deps.Accounts), candidate.RequireCandidate)

	return router, nil
}

func readiness(db Pinger) gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx, cancel := context.WithTimeout(c.Request.Context(), readinessTimeout)
		defer cancel()
		if err := db.Ping(ctx); err != nil {
			_ = c.Error(err)
			httpx.Fail(c, http.StatusServiceUnavailable, httpx.CodeInternal, "Base de données indisponible.")
			return
		}
		httpx.OK(c, gin.H{"status": "ready"})
	}
}
