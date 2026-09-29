package admin

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"maps"
	"strconv"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/badStephane/dieuliko/apps/api/internal/company"
	"github.com/badStephane/dieuliko/apps/api/internal/database/dbgen"
	"github.com/badStephane/dieuliko/apps/api/internal/logo"
	"github.com/badStephane/dieuliko/apps/api/internal/storage"
)

// Listing status filters of the back-office search.
const (
	StatusVisible = "visible"
	StatusHidden  = "hidden"
)

// Quality gaps the back-office can list, to fix listings one after the other.
const (
	QualityNoLogo        = "no-logo"
	QualityNoDescription = "no-description"
	QualityNoContact     = "no-contact"
	QualityUnverified    = "unverified"
)

// Qualities are the accepted quality filters.
var Qualities = []string{QualityNoLogo, QualityNoDescription, QualityNoContact, QualityUnverified}

// Sort orders of the back-office company list.
const (
	SortName    = "name"
	SortUpdated = "updated"
)

// maxSlugAttempts bounds the "-2", "-3"… suffixes tried when a generated slug is taken.
const maxSlugAttempts = 100

// ValidationError names the invalid fields of a request, with French messages.
type ValidationError struct {
	Fields map[string]string
}

func (e *ValidationError) Error() string { return "invalid input" }

// DB is satisfied by *pgxpool.Pool.
type DB interface {
	dbgen.DBTX
	Begin(ctx context.Context) (pgx.Tx, error)
}

// AdminCompany is a listing as the back-office sees it; empty strings stand for missing optional values.
type AdminCompany struct {
	CompanyInput
	Slug        string     `json:"slug"`
	LogoVersion *string    `json:"logoVersion"`
	Verified    bool       `json:"verified"`
	HiddenAt    *time.Time `json:"hiddenAt"`
	CuratedAt   *time.Time `json:"curatedAt"`
	Source      string     `json:"source"`
	CreatedAt   time.Time  `json:"createdAt"`
	UpdatedAt   time.Time  `json:"updatedAt"`
	// Applications (sent or withdrawn) block the deletion; Letters are deleted with the listing.
	Applications int `json:"applications"`
	Letters      int `json:"letters"`
}

// CompanySummary is one line of the back-office company list.
type CompanySummary struct {
	Slug        string     `json:"slug"`
	Name        string     `json:"name"`
	Sector      string     `json:"sector"`
	City        string     `json:"city"`
	LogoVersion *string    `json:"logoVersion"`
	Verified    bool       `json:"verified"`
	HiddenAt    *time.Time `json:"hiddenAt"`
	CuratedAt   *time.Time `json:"curatedAt"`
	Source      string     `json:"source"`
	UpdatedAt   time.Time  `json:"updatedAt"`
}

// CompanyFilters narrows the back-office search; empty fields do not filter.
type CompanyFilters struct {
	Query   string
	Status  string // StatusVisible, StatusHidden or ""
	Quality string // one of Qualities, or ""
	Sort    string // SortName (default) or SortUpdated
}

// CompanyPage is one page of listings and the number of matches.
type CompanyPage struct {
	Items []CompanySummary `json:"items"`
	Total int              `json:"total"`
}

// CompanyService moderates the directory; every change is recorded in admin_audit. Logos go to store.
type CompanyService struct {
	db     DB
	store  storage.Store
	logger *slog.Logger
}

// NewCompanyService builds the service.
func NewCompanyService(db DB, store storage.Store, logger *slog.Logger) *CompanyService {
	return &CompanyService{db: db, store: store, logger: logger}
}

// Search lists listings, hidden ones included, by name.
func (s *CompanyService) Search(ctx context.Context, filters CompanyFilters, offset, limit int) (CompanyPage, error) {
	q := dbgen.New(s.db)
	words := company.SearchWords(filters.Query)
	status, quality := nullable(filters.Status), nullable(filters.Quality)
	rows, err := q.SearchAdminCompanies(ctx, dbgen.SearchAdminCompaniesParams{
		Status: status, Quality: quality, Words: words, Sort: filters.Sort, RowOffset: int32(offset), RowLimit: int32(limit),
	})
	if err != nil {
		return CompanyPage{}, fmt.Errorf("admin search companies: %w", err)
	}
	total, err := q.CountAdminCompanies(ctx, dbgen.CountAdminCompaniesParams{Status: status, Quality: quality, Words: words})
	if err != nil {
		return CompanyPage{}, fmt.Errorf("admin count companies: %w", err)
	}
	items := make([]CompanySummary, 0, len(rows))
	for _, row := range rows {
		items = append(items, CompanySummary{
			Slug: row.Slug, Name: row.Name, Sector: row.Sector, City: row.City, LogoVersion: logo.VersionOf(row.LogoKey),
			Verified: row.Verified, HiddenAt: row.HiddenAt, CuratedAt: row.CuratedAt, Source: row.Source, UpdatedAt: row.UpdatedAt,
		})
	}
	return CompanyPage{Items: items, Total: int(total)}, nil
}

// Get returns a listing, hidden or not, or company.ErrNotFound.
func (s *CompanyService) Get(ctx context.Context, slug string) (AdminCompany, error) {
	row, err := dbgen.New(s.db).GetAdminCompany(ctx, slug)
	if errors.Is(err, pgx.ErrNoRows) {
		return AdminCompany{}, company.ErrNotFound
	}
	if err != nil {
		return AdminCompany{}, fmt.Errorf("admin get company: %w", err)
	}
	return fromAdminRow(row)
}

// Create adds a listing under a slug generated from its name ("-2", "-3"… when taken).
func (s *CompanyService) Create(ctx context.Context, adminID uuid.UUID, input CompanyInput) (AdminCompany, error) {
	clean, err := s.validate(ctx, input)
	if err != nil {
		return AdminCompany{}, err
	}
	links, err := json.Marshal(clean.SocialLinks)
	if err != nil {
		return AdminCompany{}, fmt.Errorf("admin create company: encode links: %w", err)
	}
	var slug string
	err = pgx.BeginFunc(ctx, s.db, func(tx pgx.Tx) error {
		q := dbgen.New(tx)
		if slug, err = freeSlug(ctx, q, slugify(clean.Name)); err != nil {
			return err
		}
		params := dbgen.InsertAdminCompanyParams(updateParams(slug, clean, links))
		if err := q.InsertAdminCompany(ctx, params); err != nil {
			return fmt.Errorf("admin create company: %w", err)
		}
		return recordAudit(ctx, q, adminID, "company.create", "company", slug, nil)
	})
	if err != nil {
		return AdminCompany{}, err
	}
	return s.Get(ctx, slug)
}

// Update replaces the editable fields of a listing; its slug never changes, so its URL stays the same.
func (s *CompanyService) Update(ctx context.Context, adminID uuid.UUID, slug string, input CompanyInput) (AdminCompany, error) {
	clean, err := s.validate(ctx, input)
	if err != nil {
		return AdminCompany{}, err
	}
	links, err := json.Marshal(clean.SocialLinks)
	if err != nil {
		return AdminCompany{}, fmt.Errorf("admin update company: encode links: %w", err)
	}
	err = pgx.BeginFunc(ctx, s.db, func(tx pgx.Tx) error {
		q := dbgen.New(tx)
		row, err := q.LockAdminCompany(ctx, slug)
		if errors.Is(err, pgx.ErrNoRows) {
			return company.ErrNotFound
		}
		if err != nil {
			return fmt.Errorf("admin update company: lock: %w", err)
		}
		current, err := fromAdminRow(dbgen.GetAdminCompanyRow(row))
		if err != nil {
			return err
		}
		if err := q.UpdateAdminCompany(ctx, updateParams(slug, clean, links)); err != nil {
			return fmt.Errorf("admin update company: %w", err)
		}
		return recordAudit(ctx, q, adminID, "company.update", "company", slug, changedFields(current.CompanyInput, clean))
	})
	if err != nil {
		return AdminCompany{}, err
	}
	return s.Get(ctx, slug)
}

// SetHidden takes a listing out of the public directory, or puts it back.
func (s *CompanyService) SetHidden(ctx context.Context, adminID uuid.UUID, slug string, hidden bool) (AdminCompany, error) {
	action := map[bool]string{true: "company.hide", false: "company.unhide"}[hidden]
	return s.toggle(ctx, adminID, slug, action, func(q *dbgen.Queries) (int64, error) {
		return q.SetCompanyHidden(ctx, dbgen.SetCompanyHiddenParams{Slug: slug, Hidden: hidden})
	})
}

// SetVerified marks a listing as checked by the team, or not.
func (s *CompanyService) SetVerified(ctx context.Context, adminID uuid.UUID, slug string, verified bool) (AdminCompany, error) {
	action := map[bool]string{true: "company.verify", false: "company.unverify"}[verified]
	return s.toggle(ctx, adminID, slug, action, func(q *dbgen.Queries) (int64, error) {
		return q.SetCompanyVerified(ctx, dbgen.SetCompanyVerifiedParams{Slug: slug, Verified: verified})
	})
}

func (s *CompanyService) toggle(ctx context.Context, adminID uuid.UUID, slug, action string, update func(*dbgen.Queries) (int64, error)) (AdminCompany, error) {
	err := pgx.BeginFunc(ctx, s.db, func(tx pgx.Tx) error {
		q := dbgen.New(tx)
		affected, err := update(q)
		if err != nil {
			return fmt.Errorf("admin %s: %w", action, err)
		}
		if affected == 0 {
			return company.ErrNotFound
		}
		return recordAudit(ctx, q, adminID, action, "company", slug, nil)
	})
	if err != nil {
		return AdminCompany{}, err
	}
	return s.Get(ctx, slug)
}

// validate trims the input and checks every field, the sector against the taxonomy.
func (s *CompanyService) validate(ctx context.Context, input CompanyInput) (CompanyInput, error) {
	clean, problems := validateCompany(input)
	if problems["sector"] == "" {
		exists, err := dbgen.New(s.db).SectorExists(ctx, clean.Sector)
		if err != nil {
			return CompanyInput{}, fmt.Errorf("admin company: check sector: %w", err)
		}
		if !exists {
			problems["sector"] = "Secteur inconnu."
		}
	}
	if len(problems) > 0 {
		return CompanyInput{}, &ValidationError{Fields: problems}
	}
	return clean, nil
}

// freeSlug returns base, or base-2, base-3… for the first slug no listing uses.
func freeSlug(ctx context.Context, q *dbgen.Queries, base string) (string, error) {
	for attempt := 1; attempt <= maxSlugAttempts; attempt++ {
		candidate := base
		if attempt > 1 {
			candidate = base + "-" + strconv.Itoa(attempt)
		}
		taken, err := q.CompanySlugTaken(ctx, candidate)
		if err != nil {
			return "", fmt.Errorf("admin create company: check slug: %w", err)
		}
		if !taken {
			return candidate, nil
		}
	}
	return "", fmt.Errorf("admin create company: no free slug for %q", base)
}

func updateParams(slug string, input CompanyInput, links []byte) dbgen.UpdateAdminCompanyParams {
	return dbgen.UpdateAdminCompanyParams{
		Slug: slug, Name: input.Name, Sector: input.Sector, City: input.City,
		CompanyType: nullable(input.CompanyType), Description: nullable(input.Description), Website: nullable(input.Website),
		Email: nullable(input.Email), Phone: nullable(input.Phone), Address: nullable(input.Address), Size: nullable(input.Size),
		SocialLinks: links,
	}
}

func fromAdminRow(row dbgen.GetAdminCompanyRow) (AdminCompany, error) {
	links := map[string]string{}
	if err := json.Unmarshal(row.SocialLinks, &links); err != nil {
		return AdminCompany{}, fmt.Errorf("company %q: decode social_links: %w", row.Slug, err)
	}
	return AdminCompany{
		CompanyInput: CompanyInput{
			Name: row.Name, Sector: row.Sector, City: row.City, CompanyType: deref(row.CompanyType), Description: deref(row.Description),
			Website: deref(row.Website), Email: deref(row.Email), Phone: deref(row.Phone), Address: deref(row.Address), Size: deref(row.Size),
			SocialLinks: links,
		},
		Slug: row.Slug, LogoVersion: logo.VersionOf(row.LogoKey), Verified: row.Verified, HiddenAt: row.HiddenAt, CuratedAt: row.CuratedAt,
		Source:    row.Source,
		CreatedAt: row.CreatedAt, UpdatedAt: row.UpdatedAt, Applications: int(row.Applications), Letters: int(row.Letters),
	}, nil
}

// changedFields lists the JSON names of the fields that differ, in form order.
func changedFields(before, after CompanyInput) []string {
	pairs := []struct {
		name          string
		before, after string
	}{
		{"name", before.Name, after.Name}, {"sector", before.Sector, after.Sector}, {"city", before.City, after.City},
		{"companyType", before.CompanyType, after.CompanyType}, {"description", before.Description, after.Description},
		{"website", before.Website, after.Website}, {"email", before.Email, after.Email}, {"phone", before.Phone, after.Phone},
		{"address", before.Address, after.Address}, {"size", before.Size, after.Size},
	}
	changed := []string{}
	for _, pair := range pairs {
		if pair.before != pair.after {
			changed = append(changed, pair.name)
		}
	}
	if !maps.Equal(before.SocialLinks, after.SocialLinks) {
		changed = append(changed, "socialLinks")
	}
	return changed
}

// recordAudit keeps who did what; fields holds names only, never values.
func recordAudit(ctx context.Context, q *dbgen.Queries, adminID uuid.UUID, action, targetType, targetID string, fields []string) error {
	if fields == nil {
		fields = []string{}
	}
	err := q.InsertAdminAudit(ctx, dbgen.InsertAdminAuditParams{
		AdminID: pgtype.UUID{Bytes: adminID, Valid: true}, Action: action, TargetType: targetType, TargetID: targetID, ChangedFields: fields,
	})
	if err != nil {
		return fmt.Errorf("admin audit %s: %w", action, err)
	}
	return nil
}

func nullable(value string) *string {
	if value == "" {
		return nil
	}
	return &value
}

func deref(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}
