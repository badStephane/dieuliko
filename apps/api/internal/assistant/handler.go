package assistant

import (
	"context"
	"errors"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"github.com/badStephane/dieuliko/apps/api/internal/ai"
	"github.com/badStephane/dieuliko/apps/api/internal/auth"
	"github.com/badStephane/dieuliko/apps/api/internal/httpx"
)

// Error codes specific to the writing assistant (see httpx for the shared ones).
const (
	CodeAIBusy        = "ai_busy"
	CodeAIUnavailable = "ai_unavailable"
	CodeAIFailed      = "ai_failed"
)

// Requests per candidate: 20 per hour on average, bursts of 5, so one person cannot drain the shared budget.
const (
	rewritesPerSecond = 20.0 / 3600
	rewriteBurst      = 5
)

// Rewriter is what the handler needs from Service (faked in tests).
type Rewriter interface {
	Rewrite(ctx context.Context, userID uuid.UUID, input RewriteInput) (string, error)
}

// NewLimiter budgets assistant requests per candidate; idle buckets are kept for idleTTL.
func NewLimiter(idleTTL time.Duration) *httpx.RateLimiter {
	return httpx.NewRateLimiter(rewritesPerSecond, rewriteBurst, idleTTL)
}

// Handler serves /me/assist.
type Handler struct {
	rewriter Rewriter
	limiter  *httpx.RateLimiter
}

// NewHandler builds the handler.
func NewHandler(rewriter Rewriter, limiter *httpx.RateLimiter) *Handler {
	return &Handler{rewriter: rewriter, limiter: limiter}
}

// Register mounts the routes on a router group (e.g. /v1) behind the session and candidate checks.
func (h *Handler) Register(group *gin.RouterGroup, requireUser, requireCandidate gin.HandlerFunc) {
	assist := group.Group("/me/assist", requireUser, requireCandidate)
	assist.POST("/rewrite", h.rewrite)
}

type textResponse struct {
	Text string `json:"text"`
}

func (h *Handler) rewrite(c *gin.Context) {
	userID := auth.CurrentUser(c).ID
	if !h.limiter.Allow(userID.String()) {
		c.Header("Retry-After", "60")
		httpx.Fail(c, http.StatusTooManyRequests, httpx.CodeRateLimited, "Vous avez beaucoup sollicité l’assistant. Réessayez dans quelques minutes.")
		return
	}
	var input RewriteInput
	if !httpx.BindJSON(c, &input) {
		return
	}
	text, err := h.rewriter.Rewrite(c.Request.Context(), userID, input)
	if err != nil {
		writeError(c, err)
		return
	}
	httpx.OK(c, textResponse{Text: text})
}

// writeError maps assistant errors to responses; provider details only reach the logs.
func writeError(c *gin.Context, err error) {
	var validation *ValidationError
	switch {
	case errors.As(err, &validation):
		httpx.FailFields(c, http.StatusUnprocessableEntity, httpx.CodeValidation, "Certains champs sont invalides.", validation.Fields)
	case errors.Is(err, ai.ErrBusy):
		_ = c.Error(err)
		c.Header("Retry-After", "60")
		httpx.Fail(c, http.StatusServiceUnavailable, CodeAIBusy, "L’assistant est très sollicité en ce moment. Réessayez dans une minute.")
	case errors.Is(err, ai.ErrUnavailable):
		_ = c.Error(err)
		httpx.Fail(c, http.StatusServiceUnavailable, CodeAIUnavailable, "L’assistant de rédaction est momentanément indisponible.")
	case errors.Is(err, ai.ErrEmptyAnswer):
		_ = c.Error(err)
		httpx.Fail(c, http.StatusBadGateway, CodeAIFailed, "L’assistant n’a pas pu proposer de texte. Réessayez.")
	default:
		httpx.InternalError(c, err)
	}
}
