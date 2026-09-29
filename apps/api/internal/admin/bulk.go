package admin

import (
	"context"
	"fmt"
	"regexp"
	"slices"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/badStephane/dieuliko/apps/api/internal/auth"
	"github.com/badStephane/dieuliko/apps/api/internal/database/dbgen"
	"github.com/badStephane/dieuliko/apps/api/internal/httpx"
)

// Bulk actions on listings, as named in requests.
const (
	BulkHide     = "hide"
	BulkUnhide   = "unhide"
	BulkVerify   = "verify"
	BulkUnverify = "unverify"
)

// MaxBulkSlugs bounds one bulk request (a few pages of the list).
const MaxBulkSlugs = 100

// maxBulkBodyBytes fits MaxBulkSlugs slugs of 120 characters.
const maxBulkBodyBytes = 16 << 10

var bulkSlugPattern = regexp.MustCompile(`^[a-z0-9-]{1,120}$`)

// BulkResult tells how many listings were changed.
type BulkResult struct {
	Updated int `json:"updated"`
}

// Bulk hides, shows, verifies or unverifies several listings at once, in one transaction. Unknown slugs and
// duplicates are skipped; each changed listing is audited as if changed alone.
func (s *CompanyService) Bulk(ctx context.Context, adminID uuid.UUID, action string, slugs []string) (BulkResult, error) {
	unique, err := validateBulk(action, slugs)
	if err != nil {
		return BulkResult{}, err
	}
	result := BulkResult{}
	err = pgx.BeginFunc(ctx, s.db, func(tx pgx.Tx) error {
		q := dbgen.New(tx)
		for _, slug := range unique {
			affected, err := applyBulk(ctx, q, action, slug)
			if err != nil {
				return fmt.Errorf("admin bulk %s %q: %w", action, slug, err)
			}
			if affected == 0 {
				continue
			}
			if err := recordAudit(ctx, q, adminID, "company."+action, "company", slug, nil); err != nil {
				return err
			}
			result.Updated++
		}
		return nil
	})
	if err != nil {
		return BulkResult{}, err
	}
	return result, nil
}

func applyBulk(ctx context.Context, q *dbgen.Queries, action, slug string) (int64, error) {
	switch action {
	case BulkHide, BulkUnhide:
		return q.SetCompanyHidden(ctx, dbgen.SetCompanyHiddenParams{Slug: slug, Hidden: action == BulkHide})
	default:
		return q.SetCompanyVerified(ctx, dbgen.SetCompanyVerifiedParams{Slug: slug, Verified: action == BulkVerify})
	}
}

// validateBulk checks the request and returns the slugs without duplicates, in their first order.
func validateBulk(action string, slugs []string) ([]string, error) {
	if !slices.Contains([]string{BulkHide, BulkUnhide, BulkVerify, BulkUnverify}, action) {
		return nil, &ValidationError{Fields: map[string]string{"action": "Action inconnue."}}
	}
	if len(slugs) == 0 || len(slugs) > MaxBulkSlugs {
		return nil, &ValidationError{Fields: map[string]string{"slugs": fmt.Sprintf("Sélectionnez entre 1 et %d fiches.", MaxBulkSlugs)}}
	}
	unique := make([]string, 0, len(slugs))
	for _, slug := range slugs {
		if !bulkSlugPattern.MatchString(slug) {
			return nil, &ValidationError{Fields: map[string]string{"slugs": "Une des fiches sélectionnées est invalide."}}
		}
		if !slices.Contains(unique, slug) {
			unique = append(unique, slug)
		}
	}
	return unique, nil
}

type bulkRequest struct {
	Action string   `json:"action"`
	Slugs  []string `json:"slugs"`
}

func (h *Handler) bulkCompanies(c *gin.Context) {
	adminID := auth.CurrentUser(c).ID
	var req bulkRequest
	if !h.allowChange(c, adminID) || !httpx.BindJSONLimit(c, &req, maxBulkBodyBytes) {
		return
	}
	result, err := h.services.Companies.Bulk(c.Request.Context(), adminID, req.Action, req.Slugs)
	if err != nil {
		writeError(c, err)
		return
	}
	httpx.OK(c, result)
}
