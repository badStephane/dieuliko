package company

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"

	"github.com/badStephane/dieuliko/apps/api/internal/database/dbgen"
)

// PostgresRepository is the Repository backed by the sqlc queries.
type PostgresRepository struct {
	queries *dbgen.Queries
}

// NewPostgresRepository wraps a sqlc Queries (built on a pool or a transaction).
func NewPostgresRepository(queries *dbgen.Queries) *PostgresRepository {
	return &PostgresRepository{queries: queries}
}

// Search returns one page of companies matching the filters, most reviewed first.
func (r *PostgresRepository) Search(ctx context.Context, filters Filters, page PageRequest) (Page, error) {
	words := SearchWords(filters.Query)
	sector := optional(filters.Sector)
	city := optional(filters.City)

	rows, err := r.queries.SearchCompanies(ctx, dbgen.SearchCompaniesParams{
		Sector:    sector,
		City:      city,
		Words:     words,
		RowOffset: int32(page.Offset),
		RowLimit:  int32(page.Limit),
	})
	if err != nil {
		return Page{}, fmt.Errorf("search companies: %w", err)
	}
	total, err := r.queries.CountCompanies(ctx, dbgen.CountCompaniesParams{Sector: sector, City: city, Words: words})
	if err != nil {
		return Page{}, fmt.Errorf("count companies: %w", err)
	}

	items := make([]Company, 0, len(rows))
	for _, row := range rows {
		company, err := fromRow(dbgen.GetCompanyBySlugRow(row))
		if err != nil {
			return Page{}, err
		}
		items = append(items, company)
	}
	return Page{Items: items, Total: int(total)}, nil
}

// FindBySlug returns ErrNotFound when no company has this slug.
func (r *PostgresRepository) FindBySlug(ctx context.Context, slug string) (Company, error) {
	row, err := r.queries.GetCompanyBySlug(ctx, slug)
	if errors.Is(err, pgx.ErrNoRows) {
		return Company{}, ErrNotFound
	}
	if err != nil {
		return Company{}, fmt.Errorf("get company %q: %w", slug, err)
	}
	return fromRow(row)
}

// Slugs lists every company slug (used to prebuild profile pages).
func (r *PostgresRepository) Slugs(ctx context.Context) ([]string, error) {
	slugs, err := r.queries.ListCompanySlugs(ctx)
	if err != nil {
		return nil, fmt.Errorf("list company slugs: %w", err)
	}
	return slugs, nil
}

// SectorCounts lists every sector of the taxonomy, including empty ones.
func (r *PostgresRepository) SectorCounts(ctx context.Context) ([]SectorCount, error) {
	rows, err := r.queries.ListSectorCounts(ctx)
	if err != nil {
		return nil, fmt.Errorf("list sector counts: %w", err)
	}
	counts := make([]SectorCount, len(rows))
	for i, row := range rows {
		counts[i] = SectorCount{Slug: row.Slug, Label: row.Label, Count: int(row.CompanyCount)}
	}
	return counts, nil
}

// CityCounts lists cities by number of companies.
func (r *PostgresRepository) CityCounts(ctx context.Context) ([]CityCount, error) {
	rows, err := r.queries.ListCityCounts(ctx)
	if err != nil {
		return nil, fmt.Errorf("list city counts: %w", err)
	}
	counts := make([]CityCount, len(rows))
	for i, row := range rows {
		counts[i] = CityCount{City: row.City, Count: int(row.CompanyCount)}
	}
	return counts, nil
}

func fromRow(row dbgen.GetCompanyBySlugRow) (Company, error) {
	socialLinks := map[string]string{}
	if err := json.Unmarshal(row.SocialLinks, &socialLinks); err != nil {
		return Company{}, fmt.Errorf("company %q: decode social_links: %w", row.Slug, err)
	}
	return Company{
		Slug:               row.Slug,
		Name:               row.Name,
		Sector:             row.Sector,
		CompanyType:        row.CompanyType,
		Description:        row.Description,
		Website:            row.Website,
		Email:              row.Email,
		Phone:              row.Phone,
		City:               row.City,
		Address:            row.Address,
		Size:               row.Size,
		LogoURL:            row.LogoUrl,
		SocialLinks:        socialLinks,
		AcceptsSpontaneous: row.AcceptsSpontaneous,
		Verified:           row.Verified,
		Rating:             row.Rating,
		RatingCount:        int(row.RatingCount),
	}, nil
}

func optional(value string) *string {
	if value == "" {
		return nil
	}
	return &value
}
