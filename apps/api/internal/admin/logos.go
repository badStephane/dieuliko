package admin

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/badStephane/dieuliko/apps/api/internal/auth"
	"github.com/badStephane/dieuliko/apps/api/internal/company"
	"github.com/badStephane/dieuliko/apps/api/internal/database/dbgen"
	"github.com/badStephane/dieuliko/apps/api/internal/httpx"
	"github.com/badStephane/dieuliko/apps/api/internal/logo"
)

// logoField is the multipart part holding the image, and the field its errors are reported on.
const logoField = "file"

// maxLogoMultipartOverhead leaves room for the multipart boundaries and headers around the file.
const maxLogoMultipartOverhead = 16 << 10

// SetLogo stores a new logo for a listing and drops the previous one. The file is stored before the row points to it,
// so the listing never shows a missing logo; if the row cannot be updated the new file is deleted again.
func (s *CompanyService) SetLogo(ctx context.Context, adminID uuid.UUID, slug string, content []byte) (AdminCompany, error) {
	format, err := logo.Validate(content)
	var invalid *logo.InvalidError
	if errors.As(err, &invalid) {
		return AdminCompany{}, &ValidationError{Fields: map[string]string{logoField: invalid.Message}}
	}
	if err != nil {
		return AdminCompany{}, err
	}
	key := logo.NewKey(format)
	if err := s.store.Put(ctx, key, bytes.NewReader(content), int64(len(content)), format.ContentType); err != nil {
		return AdminCompany{}, fmt.Errorf("admin set logo: %w", err)
	}
	previous, err := s.replaceLogo(ctx, adminID, slug, &key, "company.logo_set")
	if err != nil {
		s.deleteLogo(ctx, key)
		return AdminCompany{}, err
	}
	s.deleteLogo(ctx, previous)
	return s.Get(ctx, slug)
}

// RemoveLogo takes the logo off a listing; the monogram is shown again. Removing a missing logo is not an error.
func (s *CompanyService) RemoveLogo(ctx context.Context, adminID uuid.UUID, slug string) (AdminCompany, error) {
	previous, err := s.replaceLogo(ctx, adminID, slug, nil, "company.logo_remove")
	if err != nil {
		return AdminCompany{}, err
	}
	s.deleteLogo(ctx, previous)
	return s.Get(ctx, slug)
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

// replaceLogo points the listing at key (nil: no logo) and returns the key it replaced ("" when none). Nothing is
// audited when there was no logo to remove.
func (s *CompanyService) replaceLogo(ctx context.Context, adminID uuid.UUID, slug string, key *string, action string) (string, error) {
	var previous string
	err := pgx.BeginFunc(ctx, s.db, func(tx pgx.Tx) error {
		q := dbgen.New(tx)
		current, err := q.LockCompanyLogo(ctx, slug)
		if errors.Is(err, pgx.ErrNoRows) {
			return company.ErrNotFound
		}
		if err != nil {
			return fmt.Errorf("admin %s: lock: %w", action, err)
		}
		if current == nil && key == nil {
			return nil
		}
		if current != nil {
			previous = *current
		}
		if err := q.SetCompanyLogo(ctx, dbgen.SetCompanyLogoParams{Slug: slug, LogoKey: key}); err != nil {
			return fmt.Errorf("admin %s: %w", action, err)
		}
		return recordAudit(ctx, q, adminID, action, "company", slug, nil)
	})
	return previous, err
}

// deleteLogo removes a file no listing points to anymore. A failure only leaves an orphan file behind, so it is
// logged rather than returned; it runs even if the client went away.
func (s *CompanyService) deleteLogo(ctx context.Context, key string) {
	if key == "" {
		return
	}
	if err := s.store.Delete(context.WithoutCancel(ctx), key); err != nil {
		s.logger.Error("orphan logo file", slog.String("key", key), slog.String("error", err.Error()))
	}
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
	content, ok := readLogo(c)
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

// readLogo streams the multipart body up to its "file" part; on failure it answers and returns false.
func readLogo(c *gin.Context) ([]byte, bool) {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, logo.MaxBytes+maxLogoMultipartOverhead)
	reader, err := c.Request.MultipartReader()
	if err != nil {
		httpx.Fail(c, http.StatusBadRequest, httpx.CodeBadRequest, "Envoyez le logo dans un formulaire (multipart/form-data).")
		return nil, false
	}
	for {
		part, err := reader.NextPart()
		if err != nil {
			failLogoRead(c, err)
			return nil, false
		}
		if part.FormName() != logoField {
			continue // NextPart discards the unread rest of this part
		}
		content, err := logo.ReadAll(part)
		if err == nil && len(content) > logo.MaxBytes {
			err = &http.MaxBytesError{Limit: logo.MaxBytes}
		}
		if err != nil {
			failLogoRead(c, err)
			return nil, false
		}
		return content, true
	}
}

func failLogoRead(c *gin.Context, err error) {
	var tooLarge *http.MaxBytesError
	message := ""
	switch {
	case errors.As(err, &tooLarge):
		message = logo.MsgTooLarge
	case errors.Is(err, io.EOF):
		message = "Choisissez une image."
	default:
		httpx.Fail(c, http.StatusBadRequest, httpx.CodeBadRequest, "Requête invalide.")
		return
	}
	httpx.FailFields(c, http.StatusUnprocessableEntity, httpx.CodeValidation, message, map[string]string{logoField: message})
}
