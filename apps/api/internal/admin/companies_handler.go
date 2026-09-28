package admin

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

// Pagination bounds of the back-office lists.
const (
	defaultPageLimit = 20
	maxPageLimit     = 50
	maxPageOffset    = 100_000
	// maxCompanyBodyBytes fits a listing at every limit (about 4 KB of text, plus links) with room to spare.
	maxCompanyBodyBytes = 32 << 10
)

// CompanyManager is what the handler needs from CompanyService (faked in tests).
type CompanyManager interface {
	Search(ctx context.Context, filters CompanyFilters, offset, limit int) (CompanyPage, error)
	Get(ctx context.Context, slug string) (AdminCompany, error)
	Create(ctx context.Context, adminID uuid.UUID, input CompanyInput) (AdminCompany, error)
	Update(ctx context.Context, adminID uuid.UUID, slug string, input CompanyInput) (AdminCompany, error)
	SetHidden(ctx context.Context, adminID uuid.UUID, slug string, hidden bool) (AdminCompany, error)
	SetVerified(ctx context.Context, adminID uuid.UUID, slug string, verified bool) (AdminCompany, error)
}

func (h *Handler) registerCompanies(admin *gin.RouterGroup) {
	companies := admin.Group("/companies")
	companies.GET("", h.listCompanies)
	companies.POST("", h.createCompany)
	companies.GET("/:slug", h.getCompany)
	companies.PUT("/:slug", h.updateCompany)
	companies.PUT("/:slug/visibility", h.setCompanyVisibility)
	companies.PUT("/:slug/verification", h.setCompanyVerification)
}

func (h *Handler) listCompanies(c *gin.Context) {
	offset, limit, ok := pageParams(c)
	if !ok {
		return
	}
	status := c.Query("status")
	if status != "" && status != StatusVisible && status != StatusHidden {
		httpx.Fail(c, http.StatusBadRequest, httpx.CodeBadRequest, "Le paramètre « status » doit valoir visible ou hidden.")
		return
	}
	page, err := h.services.Companies.Search(c.Request.Context(), CompanyFilters{Query: c.Query("q"), Status: status}, offset, limit)
	if err != nil {
		writeError(c, err)
		return
	}
	httpx.OK(c, page)
}

func (h *Handler) getCompany(c *gin.Context) {
	listing, err := h.services.Companies.Get(c.Request.Context(), c.Param("slug"))
	if err != nil {
		writeError(c, err)
		return
	}
	httpx.OK(c, listing)
}

func (h *Handler) createCompany(c *gin.Context) {
	adminID := auth.CurrentUser(c).ID
	var input CompanyInput
	if !h.allowChange(c, adminID) || !httpx.BindJSONLimit(c, &input, maxCompanyBodyBytes) {
		return
	}
	listing, err := h.services.Companies.Create(c.Request.Context(), adminID, input)
	if err != nil {
		writeError(c, err)
		return
	}
	httpx.Created(c, listing)
}

func (h *Handler) updateCompany(c *gin.Context) {
	adminID := auth.CurrentUser(c).ID
	var input CompanyInput
	if !h.allowChange(c, adminID) || !httpx.BindJSONLimit(c, &input, maxCompanyBodyBytes) {
		return
	}
	listing, err := h.services.Companies.Update(c.Request.Context(), adminID, c.Param("slug"), input)
	if err != nil {
		writeError(c, err)
		return
	}
	httpx.OK(c, listing)
}

type visibilityRequest struct {
	Hidden *bool `json:"hidden"`
}

func (h *Handler) setCompanyVisibility(c *gin.Context) {
	adminID := auth.CurrentUser(c).ID
	var req visibilityRequest
	if !h.allowChange(c, adminID) || !bindFlag(c, &req, &req.Hidden, "hidden") {
		return
	}
	listing, err := h.services.Companies.SetHidden(c.Request.Context(), adminID, c.Param("slug"), *req.Hidden)
	if err != nil {
		writeError(c, err)
		return
	}
	httpx.OK(c, listing)
}

type verificationRequest struct {
	Verified *bool `json:"verified"`
}

func (h *Handler) setCompanyVerification(c *gin.Context) {
	adminID := auth.CurrentUser(c).ID
	var req verificationRequest
	if !h.allowChange(c, adminID) || !bindFlag(c, &req, &req.Verified, "verified") {
		return
	}
	listing, err := h.services.Companies.SetVerified(c.Request.Context(), adminID, c.Param("slug"), *req.Verified)
	if err != nil {
		writeError(c, err)
		return
	}
	httpx.OK(c, listing)
}

// bindFlag reads a small JSON body whose boolean field (behind flag) must be present.
func bindFlag(c *gin.Context, body any, flag **bool, field string) bool {
	if !httpx.BindJSONLimit(c, body, 1<<10) {
		return false
	}
	if *flag == nil {
		httpx.FailFields(c, http.StatusUnprocessableEntity, httpx.CodeValidation, "Certains champs sont invalides.",
			map[string]string{field: "Ce champ est obligatoire (true ou false)."})
		return false
	}
	return true
}

// pageParams reads offset and limit; it answers 400 when they are out of bounds.
func pageParams(c *gin.Context) (int, int, bool) {
	offset, err := httpx.IntQuery(c, "offset", 0, 0, maxPageOffset)
	if err == nil {
		var limit int
		if limit, err = httpx.IntQuery(c, "limit", defaultPageLimit, 1, maxPageLimit); err == nil {
			return offset, limit, true
		}
	}
	httpx.Fail(c, http.StatusBadRequest, httpx.CodeBadRequest, err.Error())
	return 0, 0, false
}

// writeError maps back-office errors to responses.
func writeError(c *gin.Context, err error) {
	var validation *ValidationError
	switch {
	case errors.As(err, &validation):
		httpx.FailFields(c, http.StatusUnprocessableEntity, httpx.CodeValidation, "Certains champs sont invalides.", validation.Fields)
	case errors.Is(err, company.ErrNotFound):
		httpx.Fail(c, http.StatusNotFound, httpx.CodeNotFound, "Entreprise introuvable.")
	default:
		httpx.InternalError(c, err)
	}
}
