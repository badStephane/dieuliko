package admin

import (
	"context"
	"errors"
	"fmt"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/badStephane/dieuliko/apps/api/internal/auth"
	"github.com/badStephane/dieuliko/apps/api/internal/database/dbgen"
	"github.com/badStephane/dieuliko/apps/api/internal/httpx"
	"github.com/badStephane/dieuliko/apps/api/internal/listing"
	"github.com/badStephane/dieuliko/apps/api/internal/logo"
)

// logoField is the field a rejected image is reported on.
const logoField = logo.UploadField

// SetLogo stores a new logo for a listing and drops the previous one (see listing.Logos).
func (s *CompanyService) SetLogo(ctx context.Context, adminID uuid.UUID, slug string, content []byte) (AdminCompany, error) {
	err := s.logos.Set(ctx, slug, content, s.auditLogo(adminID, slug, "company.logo_set"))
	var invalid *logo.InvalidError
	if errors.As(err, &invalid) {
		return AdminCompany{}, &ValidationError{Fields: map[string]string{logoField: invalid.Message}}
	}
	if err != nil {
		return AdminCompany{}, err
	}
	return s.Get(ctx, slug)
}

// RemoveLogo takes the logo off a listing; the monogram is shown again. Removing a missing logo is not an error.
func (s *CompanyService) RemoveLogo(ctx context.Context, adminID uuid.UUID, slug string) (AdminCompany, error) {
	if err := s.logos.Remove(ctx, slug, s.auditLogo(adminID, slug, "company.logo_remove")); err != nil {
		return AdminCompany{}, err
	}
	return s.Get(ctx, slug)
}

func (s *CompanyService) auditLogo(adminID uuid.UUID, slug, action string) listing.Record {
	return func(ctx context.Context, q *dbgen.Queries) error {
		return recordAudit(ctx, q, adminID, action, "company", slug, nil)
	}
}

// LogoKey implements logo.KeyReader for the back-office: hidden listings included.
func (s *CompanyService) LogoKey(ctx context.Context, slug string) (*string, error) {
	row, err := dbgen.New(s.db).GetAdminCompany(ctx, slug)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, logo.ErrNoListing
	}
	if err != nil {
		return nil, fmt.Errorf("admin logo key: %w", err)
	}
	return row.LogoKey, nil
}

func (h *Handler) registerLogos(companies *gin.RouterGroup) {
	companies.GET("/:slug/logo", h.getLogo)
	companies.PUT("/:slug/logo", h.uploadLogo)
	companies.DELETE("/:slug/logo", h.removeLogo)
}

func (h *Handler) getLogo(c *gin.Context) {
	logo.Get(c, h.services.Companies.LogoKey, h.services.Logos, false)
}

// uploadLogo expects a multipart/form-data body whose "file" part is the image.
func (h *Handler) uploadLogo(c *gin.Context) {
	adminID := auth.CurrentUser(c).ID
	if !h.allowChange(c, adminID) {
		return
	}
	content, ok := logo.ReadUpload(c)
	if !ok {
		return
	}
	listing, err := h.services.Companies.SetLogo(c.Request.Context(), adminID, c.Param("slug"), content)
	if err != nil {
		writeError(c, err)
		return
	}
	httpx.OK(c, listing)
}

func (h *Handler) removeLogo(c *gin.Context) {
	adminID := auth.CurrentUser(c).ID
	if !h.allowChange(c, adminID) {
		return
	}
	listing, err := h.services.Companies.RemoveLogo(c.Request.Context(), adminID, c.Param("slug"))
	if err != nil {
		writeError(c, err)
		return
	}
	httpx.OK(c, listing)
}
