package admin

import (
	"context"
	"fmt"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/badStephane/dieuliko/apps/api/internal/database/dbgen"
	"github.com/badStephane/dieuliko/apps/api/internal/httpx"
)

// AuditEntry is one back-office change. AdminName and TargetLabel are read live: empty once the account or the
// listing is gone.
type AuditEntry struct {
	ID            int64     `json:"id"`
	Action        string    `json:"action"`
	TargetType    string    `json:"targetType"`
	TargetID      string    `json:"targetId"`
	TargetLabel   string    `json:"targetLabel"`
	ChangedFields []string  `json:"changedFields"`
	AdminName     string    `json:"adminName"`
	CreatedAt     time.Time `json:"createdAt"`
}

// AuditFilters narrows the activity log; an empty TargetType lists everything.
type AuditFilters struct {
	TargetType string // "company", "user", "claim" or ""
}

// AuditPage is one page of the activity log and the number of entries.
type AuditPage struct {
	Items []AuditEntry `json:"items"`
	Total int          `json:"total"`
}

// AuditReader is what the handler needs from AuditService (faked in tests).
type AuditReader interface {
	List(ctx context.Context, filters AuditFilters, offset, limit int) (AuditPage, error)
}

// AuditService reads admin_audit.
type AuditService struct {
	queries *dbgen.Queries
}

// NewAuditService builds the service; db is satisfied by *pgxpool.Pool.
func NewAuditService(db dbgen.DBTX) *AuditService {
	return &AuditService{queries: dbgen.New(db)}
}

// List returns the newest entries first (Items is never nil).
func (s *AuditService) List(ctx context.Context, filters AuditFilters, offset, limit int) (AuditPage, error) {
	targetType := nullable(filters.TargetType)
	rows, err := s.queries.ListAdminAudit(ctx, dbgen.ListAdminAuditParams{TargetType: targetType, RowOffset: int32(offset), RowLimit: int32(limit)})
	if err != nil {
		return AuditPage{}, fmt.Errorf("admin audit: %w", err)
	}
	total, err := s.queries.CountAdminAudit(ctx, targetType)
	if err != nil {
		return AuditPage{}, fmt.Errorf("admin audit count: %w", err)
	}
	items := make([]AuditEntry, 0, len(rows))
	for _, row := range rows {
		items = append(items, AuditEntry{
			ID: row.ID, Action: row.Action, TargetType: row.TargetType, TargetID: row.TargetID, TargetLabel: row.TargetLabel,
			ChangedFields: row.ChangedFields, AdminName: row.AdminName, CreatedAt: row.CreatedAt,
		})
	}
	return AuditPage{Items: items, Total: int(total)}, nil
}

func (h *Handler) listAudit(c *gin.Context) {
	offset, limit, ok := pageParams(c)
	if !ok {
		return
	}
	targetType := c.Query("type")
	if targetType != "" && targetType != "company" && targetType != "user" && targetType != "claim" {
		httpx.Fail(c, http.StatusBadRequest, httpx.CodeBadRequest, "Le paramètre « type » doit valoir company, user ou claim.")
		return
	}
	page, err := h.services.Audit.List(c.Request.Context(), AuditFilters{TargetType: targetType}, offset, limit)
	if err != nil {
		httpx.InternalError(c, err)
		return
	}
	httpx.OK(c, page)
}
