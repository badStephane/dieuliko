package company

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"slices"
	"strings"

	"github.com/jackc/pgx/v5"

	"github.com/badStephane/dieuliko/apps/api/internal/database/dbgen"
)

var companySizes = []string{"startup", "pme", "grande_entreprise"}

// scrapedRecord is one entry of data/companies_scraped.json.
type scrapedRecord struct {
	Name               string            `json:"name"`
	Slug               string            `json:"slug"`
	Sector             string            `json:"sector"`
	CompanyType        *string           `json:"company_type"`
	Description        *string           `json:"description"`
	Website            *string           `json:"website"`
	Email              *string           `json:"email"`
	Phone              *string           `json:"phone"`
	City               string            `json:"city"`
	Address            *string           `json:"address"`
	Size               *string           `json:"size"`
	LogoURL            *string           `json:"logo_url"`
	SocialLinks        map[string]string `json:"social_links"`
	AcceptsSpontaneous *bool             `json:"accepts_spontaneous"`
	Verified           bool              `json:"verified"`
	Source             string            `json:"source"`
	PlaceID            *string           `json:"place_id"`
	Rating             *float64          `json:"rating"`
	RatingCount        *int32            `json:"rating_count"`
	Notes              *string           `json:"notes"`
}

// ParseScraped decodes and validates the scraped company file. Every invalid record is reported.
func ParseScraped(r io.Reader) ([]dbgen.UpsertScrapedCompanyParams, error) {
	decoder := json.NewDecoder(r)
	decoder.DisallowUnknownFields()
	var records []scrapedRecord
	if err := decoder.Decode(&records); err != nil {
		return nil, fmt.Errorf("decode scraped companies: %w", err)
	}

	params := make([]dbgen.UpsertScrapedCompanyParams, 0, len(records))
	seen := make(map[string]int, len(records))
	var errs []error
	for i, record := range records {
		p, err := toUpsertParams(record)
		if err != nil {
			errs = append(errs, fmt.Errorf("record %d (%q): %w", i, record.Name, err))
			continue
		}
		if first, dup := seen[p.Slug]; dup {
			errs = append(errs, fmt.Errorf("record %d (%q): duplicate slug %q (already used by record %d)", i, record.Name, p.Slug, first))
			continue
		}
		seen[p.Slug] = i
		params = append(params, p)
	}
	if len(errs) > 0 {
		return nil, fmt.Errorf("invalid scraped companies: %w", errors.Join(errs...))
	}
	return params, nil
}

func toUpsertParams(record scrapedRecord) (dbgen.UpsertScrapedCompanyParams, error) {
	var errs []error
	name := strings.TrimSpace(record.Name)
	if name == "" {
		errs = append(errs, errors.New("name is required"))
	}
	slug := NormalizeSlug(strings.TrimSpace(record.Slug))
	if !IsValidSlug(slug) {
		errs = append(errs, fmt.Errorf("slug %q must be kebab-case", record.Slug))
	}
	sector := strings.TrimSpace(record.Sector)
	if sector == "" {
		errs = append(errs, errors.New("sector is required"))
	}
	city := strings.TrimSpace(record.City)
	if city == "" {
		errs = append(errs, errors.New("city is required"))
	}
	size := blankToNil(record.Size)
	if size != nil && !slices.Contains(companySizes, *size) {
		errs = append(errs, fmt.Errorf("size %q must be one of %v", *size, companySizes))
	}
	if record.Rating != nil && (*record.Rating < 0 || *record.Rating > 5) {
		errs = append(errs, fmt.Errorf("rating %v must be between 0 and 5", *record.Rating))
	}
	var ratingCount int32
	if record.RatingCount != nil {
		ratingCount = *record.RatingCount
	}
	if ratingCount < 0 {
		errs = append(errs, fmt.Errorf("rating_count %d must not be negative", ratingCount))
	}
	source := strings.TrimSpace(record.Source)
	if source == "" {
		errs = append(errs, errors.New("source is required"))
	}
	if len(errs) > 0 {
		return dbgen.UpsertScrapedCompanyParams{}, errors.Join(errs...)
	}

	socialLinks := record.SocialLinks
	if socialLinks == nil {
		socialLinks = map[string]string{}
	}
	socialJSON, err := json.Marshal(socialLinks)
	if err != nil {
		return dbgen.UpsertScrapedCompanyParams{}, fmt.Errorf("encode social_links: %w", err)
	}

	return dbgen.UpsertScrapedCompanyParams{
		Slug:               slug,
		Name:               name,
		Sector:             sector,
		CompanyType:        blankToNil(record.CompanyType),
		Description:        blankToNil(record.Description),
		Website:            blankToNil(record.Website),
		Email:              blankToNil(record.Email),
		Phone:              blankToNil(record.Phone),
		City:               city,
		Address:            blankToNil(record.Address),
		Size:               size,
		LogoUrl:            blankToNil(record.LogoURL),
		SocialLinks:        socialJSON,
		AcceptsSpontaneous: record.AcceptsSpontaneous,
		Verified:           record.Verified,
		Source:             source,
		PlaceID:            blankToNil(record.PlaceID),
		Rating:             record.Rating,
		RatingCount:        ratingCount,
		Notes:              blankToNil(record.Notes),
	}, nil
}

// TxBeginner is satisfied by *pgxpool.Pool and pgx.Tx.
type TxBeginner interface {
	Begin(ctx context.Context) (pgx.Tx, error)
}

// ImportScraped upserts the companies in a single transaction: either all of them land or none.
func ImportScraped(ctx context.Context, db TxBeginner, companies []dbgen.UpsertScrapedCompanyParams) error {
	tx, err := db.Begin(ctx)
	if err != nil {
		return fmt.Errorf("import companies: begin: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }() // no-op after a successful commit

	queries := dbgen.New(tx)
	for _, company := range companies {
		if err := queries.UpsertScrapedCompany(ctx, company); err != nil {
			return fmt.Errorf("import companies: upsert %q: %w", company.Slug, err)
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("import companies: commit: %w", err)
	}
	return nil
}

// blankToNil treats missing and whitespace-only values as unknown.
func blankToNil(value *string) *string {
	if value == nil {
		return nil
	}
	trimmed := strings.TrimSpace(*value)
	if trimmed == "" {
		return nil
	}
	return &trimmed
}
