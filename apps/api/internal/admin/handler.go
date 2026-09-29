// Package admin serves the back-office: directory moderation, candidate accounts and the dashboard. Every route sits
// behind a session of role admin. Admins never see what candidates wrote or uploaded (CVs, letters, applications).
package admin

import (
	"context"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"github.com/badStephane/dieuliko/apps/api/internal/auth"
	"github.com/badStephane/dieuliko/apps/api/internal/httpx"
	"github.com/badStephane/dieuliko/apps/api/internal/storage"
)

// Changes per admin: 30 per minute on average, bursts of 10 (reads fall under the global limiter).
const (
	changesPerSecond = 30.0 / 60
	changesBurst     = 10
)

// StatsReader is what the handler needs from StatsService (faked in tests).
type StatsReader interface {
	Get(ctx context.Context) (Stats, error)
}

// Services are the back-office use cases the handler exposes.
type Services struct {
	Stats     StatsReader
	Companies CompanyManager
	Accounts  AccountManager
	// Logos holds the company logos (the store of CompanyService).
	Logos storage.Store
}

// NewLimiter budgets back-office changes per admin; idle buckets are kept for idleTTL.
func NewLimiter(idleTTL time.Duration) *httpx.RateLimiter {
	return httpx.NewRateLimiter(changesPerSecond, changesBurst, idleTTL)
}

// RequireAdmin rejects signed-in users who are not admins (after auth.RequireUser).
func RequireAdmin(c *gin.Context) {
	if auth.CurrentUser(c).Role != auth.RoleAdmin {
		httpx.Fail(c, http.StatusForbidden, httpx.CodeForbidden, "Espace réservé à l’administration.")
		return
	}
	c.Next()
}

// Handler serves /admin.
type Handler struct {
	services Services
	limiter  *httpx.RateLimiter
}

// NewHandler builds the handler; limiter budgets changes (not reads).
func NewHandler(services Services, limiter *httpx.RateLimiter) *Handler {
	return &Handler{services: services, limiter: limiter}
}

// Register mounts the routes on a router group (e.g. /v1) behind the session and admin checks.
func (h *Handler) Register(group *gin.RouterGroup, requireUser gin.HandlerFunc) {
	admin := group.Group("/admin", requireUser, RequireAdmin)
	admin.GET("/stats", h.stats)
	h.registerCompanies(admin)
	h.registerAccounts(admin)
}

func (h *Handler) stats(c *gin.Context) {
	stats, err := h.services.Stats.Get(c.Request.Context())
	if err != nil {
		httpx.InternalError(c, err)
		return
	}
	httpx.OK(c, stats)
}

// allowChange spends one unit of the admin's budget; it answers 429 when exhausted.
func (h *Handler) allowChange(c *gin.Context, adminID uuid.UUID) bool {
	if h.limiter.Allow(adminID.String()) {
		return true
	}
	c.Header("Retry-After", "60")
	httpx.Fail(c, http.StatusTooManyRequests, httpx.CodeRateLimited, "Trop de modifications d’affilée. Réessayez dans une minute.")
	return false
}
