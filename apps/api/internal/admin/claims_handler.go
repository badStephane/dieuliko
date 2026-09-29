package admin

import (
	"context"
	"errors"
	"net/http"
	"slices"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"github.com/badStephane/dieuliko/apps/api/internal/auth"
	"github.com/badStephane/dieuliko/apps/api/internal/httpx"
)

// Error codes of claim reviews (see httpx for the shared ones).
const (
	CodeClaimNotPending  = "claim_not_pending"
	CodeClaimNotApproved = "claim_not_approved"
	CodeListingManaged   = "listing_managed"
)

// maxReasonBodyBytes fits a reason at maxReasonLength characters of up to 4 bytes, plus JSON.
const maxReasonBodyBytes = 4 << 10

// ClaimReviewer is what the handler needs from ClaimService (faked in tests).
type ClaimReviewer interface {
	List(ctx context.Context, status string, offset, limit int) (ClaimPage, error)
	Get(ctx context.Context, id uuid.UUID) (ClaimDetail, error)
	Approve(ctx context.Context, adminID, id uuid.UUID) (ClaimDetail, error)
	Reject(ctx context.Context, adminID, id uuid.UUID, reason string) (ClaimDetail, error)
	Revoke(ctx context.Context, adminID, id uuid.UUID, reason string) (ClaimDetail, error)
}

type reasonRequest struct {
	Reason string `json:"reason"`
}

func (h *Handler) registerClaims(admin *gin.RouterGroup) {
	claims := admin.Group("/claims")
	claims.GET("", h.listClaims)
	claims.GET("/:id", h.getClaim)
	claims.POST("/:id/approval", h.approveClaim)
	claims.POST("/:id/rejection", h.closeClaim(ClaimReviewer.Reject))
	claims.POST("/:id/revocation", h.closeClaim(ClaimReviewer.Revoke))
}

func (h *Handler) listClaims(c *gin.Context) {
	offset, limit, ok := pageParams(c)
	if !ok {
		return
	}
	status := c.DefaultQuery("status", "pending")
	if !slices.Contains(ClaimStatuses, status) {
		httpx.Fail(c, http.StatusBadRequest, httpx.CodeBadRequest, "Le paramètre « status » doit valoir "+strings.Join(ClaimStatuses, ", ")+".")
		return
	}
	page, err := h.services.Claims.List(c.Request.Context(), status, offset, limit)
	if err != nil {
		writeClaimError(c, err)
		return
	}
	httpx.OK(c, page)
}

func (h *Handler) getClaim(c *gin.Context) {
	id, ok := claimIDParam(c)
	if !ok {
		return
	}
	detail, err := h.services.Claims.Get(c.Request.Context(), id)
	if err != nil {
		writeClaimError(c, err)
		return
	}
	httpx.OK(c, detail)
}

func (h *Handler) approveClaim(c *gin.Context) {
	adminID := auth.CurrentUser(c).ID
	id, ok := claimIDParam(c)
	if !ok || !h.allowChange(c, adminID) {
		return
	}
	detail, err := h.services.Claims.Approve(c.Request.Context(), adminID, id)
	if err != nil {
		writeClaimError(c, err)
		return
	}
	httpx.OK(c, detail)
}

// closeClaim serves a decision that ends a claim with a reason (rejection or revocation).
func (h *Handler) closeClaim(decide func(ClaimReviewer, context.Context, uuid.UUID, uuid.UUID, string) (ClaimDetail, error)) gin.HandlerFunc {
	return func(c *gin.Context) {
		adminID := auth.CurrentUser(c).ID
		id, ok := claimIDParam(c)
		var req reasonRequest
		if !ok || !h.allowChange(c, adminID) || !httpx.BindJSONLimit(c, &req, maxReasonBodyBytes) {
			return
		}
		detail, err := decide(h.services.Claims, c.Request.Context(), adminID, id, req.Reason)
		if err != nil {
			writeClaimError(c, err)
			return
		}
		httpx.OK(c, detail)
	}
}

func claimIDParam(c *gin.Context) (uuid.UUID, bool) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		writeClaimError(c, ErrClaimNotFound)
		return uuid.UUID{}, false
	}
	return id, true
}

func writeClaimError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, ErrClaimNotFound):
		httpx.Fail(c, http.StatusNotFound, httpx.CodeNotFound, "Demande introuvable.")
	case errors.Is(err, ErrClaimNotPending):
		httpx.Fail(c, http.StatusConflict, CodeClaimNotPending, "Cette demande a déjà été traitée.")
	case errors.Is(err, ErrClaimNotApproved):
		httpx.Fail(c, http.StatusConflict, CodeClaimNotApproved, "Seule une demande acceptée peut être révoquée.")
	case errors.Is(err, ErrListingManaged):
		httpx.Fail(c, http.StatusConflict, CodeListingManaged, "Cette fiche est déjà gérée par un autre compte : révoquez-le d’abord.")
	default:
		writeError(c, err)
	}
}
