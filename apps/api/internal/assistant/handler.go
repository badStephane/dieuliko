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
	"github.com/badStephane/dieuliko/apps/api/internal/company"
	"github.com/badStephane/dieuliko/apps/api/internal/httpx"
)

// Error codes specific to the writing assistant (see httpx for the shared ones).
const (
	CodeAIBusy        = "ai_busy"
	CodeAIUnavailable = "ai_unavailable"
	CodeAIFailed      = "ai_failed"
	CodeNoLetter      = "no_letter"
)

// maxLetterBodyBytes fits a letter at MaxLetterLength characters of up to 4 bytes, plus JSON.
const maxLetterBodyBytes = 32 << 10

// Requests per candidate: 20 per hour on average, bursts of 5, so one person cannot drain the shared budget.
const (
	rewritesPerSecond = 20.0 / 3600
	rewriteBurst      = 5
)

// Rewriter is what the handler needs from Service (faked in tests).
type Rewriter interface {
	Rewrite(ctx context.Context, userID uuid.UUID, input RewriteInput) (string, error)
}

// Letters is what the handler needs from LetterService (faked in tests).
type Letters interface {
	List(ctx context.Context, userID uuid.UUID) ([]Letter, error)
	Get(ctx context.Context, userID uuid.UUID, slug string) (Letter, error)
	Generate(ctx context.Context, author Author, slug string) (Letter, error)
	Save(ctx context.Context, userID uuid.UUID, slug, content string) (Letter, error)
	Delete(ctx context.Context, userID uuid.UUID, slug string) error
}

// NewLimiter budgets assistant requests (rewrites and letter drafts) per candidate; idle buckets are kept for idleTTL.
func NewLimiter(idleTTL time.Duration) *httpx.RateLimiter {
	return httpx.NewRateLimiter(rewritesPerSecond, rewriteBurst, idleTTL)
}

// Handler serves /me/assist and /me/letters.
type Handler struct {
	rewriter Rewriter
	letters  Letters
	limiter  *httpx.RateLimiter
}

// NewHandler builds the handler; limiter is shared by every request that calls the model.
func NewHandler(rewriter Rewriter, letters Letters, limiter *httpx.RateLimiter) *Handler {
	return &Handler{rewriter: rewriter, letters: letters, limiter: limiter}
}

// Register mounts the routes on a router group (e.g. /v1) behind the session and candidate checks.
func (h *Handler) Register(group *gin.RouterGroup, requireUser, requireCandidate gin.HandlerFunc) {
	assist := group.Group("/me/assist", requireUser, requireCandidate)
	assist.POST("/rewrite", h.rewrite)

	letters := group.Group("/me/letters", requireUser, requireCandidate)
	letters.GET("", h.listLetters)
	letters.GET("/:slug", h.getLetter)
	letters.POST("/:slug/generate", h.generateLetter)
	letters.PUT("/:slug", h.saveLetter)
	letters.DELETE("/:slug", h.deleteLetter)
}

// allowModelCall spends one unit of the candidate's assistant budget; it answers 429 when exhausted.
func (h *Handler) allowModelCall(c *gin.Context, userID uuid.UUID) bool {
	if h.limiter.Allow(userID.String()) {
		return true
	}
	c.Header("Retry-After", "60")
	httpx.Fail(c, http.StatusTooManyRequests, httpx.CodeRateLimited, "Vous avez beaucoup sollicité l’assistant. Réessayez dans quelques minutes.")
	return false
}

type textResponse struct {
	Text string `json:"text"`
}

func (h *Handler) rewrite(c *gin.Context) {
	userID := auth.CurrentUser(c).ID
	if !h.allowModelCall(c, userID) {
		return
	}
	var input RewriteInput
	// Letters are rewritten too, so the body may be as large as a saved letter.
	if !httpx.BindJSONLimit(c, &input, maxLetterBodyBytes) {
		return
	}
	text, err := h.rewriter.Rewrite(c.Request.Context(), userID, input)
	if err != nil {
		writeError(c, err)
		return
	}
	httpx.OK(c, textResponse{Text: text})
}

func (h *Handler) listLetters(c *gin.Context) {
	letters, err := h.letters.List(c.Request.Context(), auth.CurrentUser(c).ID)
	if err != nil {
		writeError(c, err)
		return
	}
	httpx.OK(c, letters)
}

func (h *Handler) getLetter(c *gin.Context) {
	letter, err := h.letters.Get(c.Request.Context(), auth.CurrentUser(c).ID, c.Param("slug"))
	if err != nil {
		writeError(c, err)
		return
	}
	httpx.OK(c, letter)
}

func (h *Handler) generateLetter(c *gin.Context) {
	user := auth.CurrentUser(c)
	if !h.allowModelCall(c, user.ID) {
		return
	}
	author := Author{ID: user.ID, FirstName: user.FirstName, LastName: user.LastName}
	letter, err := h.letters.Generate(c.Request.Context(), author, c.Param("slug"))
	if err != nil {
		writeError(c, err)
		return
	}
	httpx.OK(c, letter)
}

type letterRequest struct {
	Content string `json:"content"`
}

func (h *Handler) saveLetter(c *gin.Context) {
	var req letterRequest
	if !httpx.BindJSONLimit(c, &req, maxLetterBodyBytes) {
		return
	}
	letter, err := h.letters.Save(c.Request.Context(), auth.CurrentUser(c).ID, c.Param("slug"), req.Content)
	if err != nil {
		writeError(c, err)
		return
	}
	httpx.OK(c, letter)
}

func (h *Handler) deleteLetter(c *gin.Context) {
	if err := h.letters.Delete(c.Request.Context(), auth.CurrentUser(c).ID, c.Param("slug")); err != nil {
		writeError(c, err)
		return
	}
	httpx.OK(c, nil)
}

// writeError maps assistant errors to responses; provider details only reach the logs.
func writeError(c *gin.Context, err error) {
	var validation *ValidationError
	switch {
	case errors.As(err, &validation):
		httpx.FailFields(c, http.StatusUnprocessableEntity, httpx.CodeValidation, "Certains champs sont invalides.", validation.Fields)
	case errors.Is(err, ErrNoLetter):
		httpx.Fail(c, http.StatusNotFound, CodeNoLetter, "Vous n’avez pas encore de lettre pour cette entreprise.")
	case errors.Is(err, company.ErrNotFound):
		httpx.Fail(c, http.StatusNotFound, httpx.CodeNotFound, "Cette entreprise n’existe pas dans l’annuaire.")
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
