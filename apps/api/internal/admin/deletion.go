package admin

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/badStephane/dieuliko/apps/api/internal/auth"
	"github.com/badStephane/dieuliko/apps/api/internal/company"
	"github.com/badStephane/dieuliko/apps/api/internal/database/dbgen"
	"github.com/badStephane/dieuliko/apps/api/internal/httpx"
)

// CodeHasApplications is the error code of a deletion refused because candidates applied to the listing.
const CodeHasApplications = "company_has_applications"

// ErrCompanyHasApplications is returned when a listing that received applications is deleted: they are the
// candidates' history, so the listing can only be hidden.
var ErrCompanyHasApplications = errors.New("company has applications")

// Delete erases a listing once its name is typed again (case and surrounding spaces ignored). The letters candidates
// wrote for it go with it; a listing that received applications cannot be deleted. Its logo file is removed after.
func (s *CompanyService) Delete(ctx context.Context, adminID uuid.UUID, slug, confirmName string) error {
	var logoKey *string
	err := pgx.BeginFunc(ctx, s.db, func(tx pgx.Tx) error {
		q := dbgen.New(tx)
		row, err := q.LockAdminCompany(ctx, slug)
		if errors.Is(err, pgx.ErrNoRows) {
			return company.ErrNotFound
		}
		if err != nil {
			return fmt.Errorf("admin delete company: lock: %w", err)
		}
		if !strings.EqualFold(strings.TrimSpace(confirmName), row.Name) {
			return &ValidationError{Fields: map[string]string{"confirmName": "Recopiez exactement le nom de l’entreprise."}}
		}
		if row.Applications > 0 {
			return ErrCompanyHasApplications
		}
		if logoKey, err = q.DeleteAdminCompany(ctx, slug); err != nil {
			return fmt.Errorf("admin delete company: %w", err)
		}
		return recordAudit(ctx, q, adminID, "company.delete", "company", slug, nil)
	})
	if err != nil {
		return err
	}
	if logoKey != nil {
		s.deleteLogo(ctx, *logoKey)
	}
	return nil
}

type companyDeletionRequest struct {
	ConfirmName string `json:"confirmName"`
}

func (h *Handler) deleteCompany(c *gin.Context) {
	adminID := auth.CurrentUser(c).ID
	var req companyDeletionRequest
	if !h.allowChange(c, adminID) || !httpx.BindJSONLimit(c, &req, 1<<10) {
		return
	}
	err := h.services.Companies.Delete(c.Request.Context(), adminID, c.Param("slug"), req.ConfirmName)
	if errors.Is(err, ErrCompanyHasApplications) {
		httpx.Fail(c, http.StatusConflict, CodeHasApplications,
			"Des candidats ont postulé auprès de cette entreprise : masquez la fiche plutôt que de la supprimer.")
		return
	}
	if err != nil {
		writeError(c, err)
		return
	}
	httpx.OK(c, nil)
}
