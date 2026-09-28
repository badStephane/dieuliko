package admin

import (
	"context"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"github.com/badStephane/dieuliko/apps/api/internal/auth"
	"github.com/badStephane/dieuliko/apps/api/internal/httpx"
)

// AccountManager is what the handler needs from AccountService (faked in tests).
type AccountManager interface {
	Search(ctx context.Context, filters CandidateFilters, offset, limit int) (CandidatePage, error)
	Get(ctx context.Context, id uuid.UUID) (CandidateDetail, error)
	SetSuspended(ctx context.Context, adminID, id uuid.UUID, suspended bool) (CandidateDetail, error)
	Delete(ctx context.Context, adminID, id uuid.UUID, confirmEmail string) error
}

func (h *Handler) registerAccounts(admin *gin.RouterGroup) {
	candidates := admin.Group("/candidates")
	candidates.GET("", h.listCandidates)
	candidates.GET("/:id", h.getCandidate)
	candidates.PUT("/:id/suspension", h.setSuspension)
	// POST rather than DELETE: the request carries the typed confirmation.
	candidates.POST("/:id/deletion", h.deleteCandidate)
}

func (h *Handler) listCandidates(c *gin.Context) {
	offset, limit, ok := pageParams(c)
	if !ok {
		return
	}
	status := c.Query("status")
	if status != "" && status != CandidateActive && status != CandidateSuspended {
		httpx.Fail(c, http.StatusBadRequest, httpx.CodeBadRequest, "Le paramètre « status » doit valoir active ou suspended.")
		return
	}
	page, err := h.services.Accounts.Search(c.Request.Context(), CandidateFilters{Query: c.Query("q"), Status: status}, offset, limit)
	if err != nil {
		writeError(c, err)
		return
	}
	httpx.OK(c, page)
}

func (h *Handler) getCandidate(c *gin.Context) {
	id, ok := candidateIDParam(c)
	if !ok {
		return
	}
	detail, err := h.services.Accounts.Get(c.Request.Context(), id)
	if err != nil {
		writeError(c, err)
		return
	}
	httpx.OK(c, detail)
}

type suspensionRequest struct {
	Suspended *bool `json:"suspended"`
}

func (h *Handler) setSuspension(c *gin.Context) {
	adminID := auth.CurrentUser(c).ID
	id, ok := candidateIDParam(c)
	var req suspensionRequest
	if !ok || !h.allowChange(c, adminID) || !bindFlag(c, &req, &req.Suspended, "suspended") {
		return
	}
	detail, err := h.services.Accounts.SetSuspended(c.Request.Context(), adminID, id, *req.Suspended)
	if err != nil {
		writeError(c, err)
		return
	}
	httpx.OK(c, detail)
}

type deletionRequest struct {
	ConfirmEmail string `json:"confirmEmail"`
}

func (h *Handler) deleteCandidate(c *gin.Context) {
	adminID := auth.CurrentUser(c).ID
	id, ok := candidateIDParam(c)
	var req deletionRequest
	if !ok || !h.allowChange(c, adminID) || !httpx.BindJSONLimit(c, &req, 1<<10) {
		return
	}
	if err := h.services.Accounts.Delete(c.Request.Context(), adminID, id, req.ConfirmEmail); err != nil {
		writeError(c, err)
		return
	}
	httpx.OK(c, nil)
}

// candidateIDParam reads :id; a malformed id is simply not found.
func candidateIDParam(c *gin.Context) (uuid.UUID, bool) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		writeError(c, ErrCandidateNotFound)
		return uuid.UUID{}, false
	}
	return id, true
}
