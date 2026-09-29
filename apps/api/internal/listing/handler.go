package listing

import (
	"context"
	"errors"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"github.com/badStephane/dieuliko/apps/api/internal/auth"
	"github.com/badStephane/dieuliko/apps/api/internal/claim"
	"github.com/badStephane/dieuliko/apps/api/internal/httpx"
	"github.com/badStephane/dieuliko/apps/api/internal/logo"
)

// CodeStale answers an edit of a listing that changed since it was read.
const CodeStale = "stale_listing"

// maxListingBodyBytes fits a listing with a long description (2000 characters of up to 4 bytes) and its links.
const maxListingBodyBytes = 32 << 10

// Changes per manager: 30 per minute on average, bursts of 10.
const (
	changesPerSecond = 30.0 / 60
	changesBurst     = 10
)

// Managed is what the handler needs from Manager (faked in tests).
type Managed interface {
	Get(ctx context.Context, companyID uuid.UUID) (Listing, error)
	Update(ctx context.Context, member Member, input UpdateInput) (Listing, error)
	SetLogo(ctx context.Context, member Member, content []byte) (Listing, error)
	RemoveLogo(ctx context.Context, member Member) (Listing, error)
}

// NewLimiter budgets listing changes per manager; idle buckets are kept for idleTTL.
func NewLimiter(idleTTL time.Duration) *httpx.RateLimiter {
	return httpx.NewRateLimiter(changesPerSecond, changesBurst, idleTTL)
}

// Handler serves /company/listing.
type Handler struct {
	listings Managed
	limiter  *httpx.RateLimiter
}

// NewHandler builds the handler; limiter budgets changes (not reads).
func NewHandler(listings Managed, limiter *httpx.RateLimiter) *Handler {
	return &Handler{listings: listings, limiter: limiter}
}

// Register mounts the routes behind the session, the company account and the approved claim checks.
func (h *Handler) Register(group *gin.RouterGroup, requireUser gin.HandlerFunc, members claim.Members) {
	listing := group.Group("/company/listing", requireUser, claim.RequireCompanyAccount, claim.RequireMember(members))
	listing.GET("", h.get)
	listing.PUT("", h.update)
	listing.PUT("/logo", h.setLogo)
	listing.DELETE("/logo", h.removeLogo)
}

func currentMember(c *gin.Context) Member {
	membership := claim.CurrentMembership(c)
	return Member{UserID: auth.CurrentUser(c).ID, CompanyID: membership.CompanyID, Slug: membership.Slug}
}

// allowChange spends one unit of the manager's budget; it answers 429 when exhausted.
func (h *Handler) allowChange(c *gin.Context, member Member) bool {
	if h.limiter.Allow(member.UserID.String()) {
		return true
	}
	c.Header("Retry-After", "60")
	httpx.Fail(c, http.StatusTooManyRequests, httpx.CodeRateLimited, "Trop de modifications d’affilée. Réessayez dans une minute.")
	return false
}

func (h *Handler) get(c *gin.Context) {
	listing, err := h.listings.Get(c.Request.Context(), claim.CurrentMembership(c).CompanyID)
	respond(c, listing, err)
}

func (h *Handler) update(c *gin.Context) {
	member := currentMember(c)
	var input UpdateInput
	if !h.allowChange(c, member) || !httpx.BindJSONLimit(c, &input, maxListingBodyBytes) {
		return
	}
	listing, err := h.listings.Update(c.Request.Context(), member, input)
	respond(c, listing, err)
}

// setLogo expects a multipart/form-data body whose "file" part is the image.
func (h *Handler) setLogo(c *gin.Context) {
	member := currentMember(c)
	if !h.allowChange(c, member) {
		return
	}
	content, ok := logo.ReadUpload(c)
	if !ok {
		return
	}
	listing, err := h.listings.SetLogo(c.Request.Context(), member, content)
	respond(c, listing, err)
}

func (h *Handler) removeLogo(c *gin.Context) {
	member := currentMember(c)
	if !h.allowChange(c, member) {
		return
	}
	listing, err := h.listings.RemoveLogo(c.Request.Context(), member)
	respond(c, listing, err)
}

func respond(c *gin.Context, listing Listing, err error) {
	var validation *ValidationError
	switch {
	case err == nil:
		httpx.OK(c, listing)
	case errors.As(err, &validation):
		httpx.FailFields(c, http.StatusUnprocessableEntity, httpx.CodeValidation, "Certains champs sont invalides.", validation.Fields)
	case errors.Is(err, ErrStale):
		httpx.Fail(c, http.StatusConflict, CodeStale, "Votre fiche a été modifiée entre-temps. Rechargez la page pour voir la dernière version.")
	default:
		httpx.InternalError(c, err)
	}
}
