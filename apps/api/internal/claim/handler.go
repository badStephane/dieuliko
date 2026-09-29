package claim

import (
	"context"
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"github.com/badStephane/dieuliko/apps/api/internal/auth"
	"github.com/badStephane/dieuliko/apps/api/internal/company"
	"github.com/badStephane/dieuliko/apps/api/internal/httpx"
)

// Error codes specific to claims (see httpx for the shared ones).
const (
	CodeEmailUnverified = "email_unverified"
	CodeClaimOpen       = "claim_open"
	CodeCompanyClaimed  = "company_claimed"
	CodeNoPendingClaim  = "no_pending_claim"
)

// Claims is what the handler needs from Service (faked in tests).
type Claims interface {
	Current(ctx context.Context, userID uuid.UUID) (*Claim, error)
	Request(ctx context.Context, requester Requester, input RequestInput) (Claim, error)
	Cancel(ctx context.Context, userID uuid.UUID) error
}

// Handler serves /company/claim.
type Handler struct {
	claims Claims
}

// NewHandler builds the handler.
func NewHandler(claims Claims) *Handler {
	return &Handler{claims: claims}
}

// Register mounts the routes on a router group (e.g. /v1) behind the session check.
func (h *Handler) Register(group *gin.RouterGroup, requireUser gin.HandlerFunc) {
	claims := group.Group("/company/claim", requireUser, RequireCompanyAccount)
	claims.GET("", h.current)
	claims.POST("", h.request)
	claims.DELETE("", h.cancel)
}

// RequireCompanyAccount restricts a route to company accounts (use after auth.RequireUser).
func RequireCompanyAccount(c *gin.Context) {
	if auth.CurrentUser(c).Role != auth.RoleCompany {
		httpx.Fail(c, http.StatusForbidden, httpx.CodeForbidden, "Cet espace est réservé aux comptes entreprise.")
		return
	}
	c.Next()
}

func (h *Handler) current(c *gin.Context) {
	claim, err := h.claims.Current(c.Request.Context(), auth.CurrentUser(c).ID)
	if err != nil {
		writeError(c, err)
		return
	}
	httpx.OK(c, claim)
}

func (h *Handler) request(c *gin.Context) {
	var input RequestInput
	if !httpx.BindJSON(c, &input) {
		return
	}
	user := auth.CurrentUser(c)
	claim, err := h.claims.Request(c.Request.Context(), Requester{ID: user.ID, EmailVerified: user.EmailVerified}, input)
	if err != nil {
		writeError(c, err)
		return
	}
	httpx.Created(c, claim)
}

func (h *Handler) cancel(c *gin.Context) {
	if err := h.claims.Cancel(c.Request.Context(), auth.CurrentUser(c).ID); err != nil {
		writeError(c, err)
		return
	}
	httpx.OK(c, nil)
}

func writeError(c *gin.Context, err error) {
	var validation *ValidationError
	switch {
	case errors.As(err, &validation):
		httpx.FailFields(c, http.StatusUnprocessableEntity, httpx.CodeValidation, "Certains champs sont invalides.", validation.Fields)
	case errors.Is(err, ErrEmailUnverified):
		httpx.Fail(c, http.StatusForbidden, CodeEmailUnverified, "Confirmez d’abord votre adresse email.")
	case errors.Is(err, company.ErrNotFound):
		httpx.Fail(c, http.StatusNotFound, httpx.CodeNotFound, "Cette entreprise n’est pas dans l’annuaire.")
	case errors.Is(err, ErrClaimOpen):
		httpx.Fail(c, http.StatusConflict, CodeClaimOpen, "Vous avez déjà une demande en cours.")
	case errors.Is(err, ErrCompanyClaimed):
		httpx.Fail(c, http.StatusConflict, CodeCompanyClaimed, "Cette fiche est déjà gérée par un autre compte. Contactez-nous si c’est une erreur.")
	case errors.Is(err, ErrNoPendingClaim):
		httpx.Fail(c, http.StatusNotFound, CodeNoPendingClaim, "Vous n’avez pas de demande en attente.")
	default:
		httpx.InternalError(c, err)
	}
}
