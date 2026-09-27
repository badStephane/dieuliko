// Package company is the company directory: domain types, PostgreSQL storage, HTTP handlers
// and the import of the scraped company base.
package company

import (
	"context"
	"errors"
)

// ErrNotFound is returned when no company has the requested slug.
var ErrNotFound = errors.New("company not found")

// Company is a public directory listing. JSON field names match the web front's `Company` type.
type Company struct {
	Slug        string            `json:"slug"`
	Name        string            `json:"name"`
	Sector      string            `json:"sector"`
	CompanyType *string           `json:"companyType"`
	Description *string           `json:"description"`
	Website     *string           `json:"website"`
	Email       *string           `json:"email"`
	Phone       *string           `json:"phone"`
	City        string            `json:"city"`
	Address     *string           `json:"address"`
	Size        *string           `json:"size"`
	LogoURL     *string           `json:"logoUrl"`
	SocialLinks map[string]string `json:"socialLinks"`
	// AcceptsSpontaneous is nil while the company has not said yet (unclaimed listing).
	AcceptsSpontaneous *bool    `json:"acceptsSpontaneous"`
	Verified           bool     `json:"verified"`
	Rating             *float64 `json:"rating"`
	RatingCount        int      `json:"ratingCount"`
}

// Filters narrows a directory search. Empty fields do not filter.
type Filters struct {
	Query  string
	Sector string
	City   string
}

// PageRequest selects a window of results.
type PageRequest struct {
	Offset int
	Limit  int
}

// Page is one window of search results plus the total number of matches.
type Page struct {
	Items []Company
	Total int
}

// SectorCount is a sector of the taxonomy with its number of companies.
type SectorCount struct {
	Slug  string `json:"slug"`
	Label string `json:"label"`
	Count int    `json:"count"`
}

// CityCount is a city (most frequent spelling) with its number of companies.
type CityCount struct {
	City  string `json:"city"`
	Count int    `json:"count"`
}

// Repository is read access to the directory; handlers depend on it rather than on PostgreSQL.
type Repository interface {
	Search(ctx context.Context, filters Filters, page PageRequest) (Page, error)
	FindBySlug(ctx context.Context, slug string) (Company, error)
	Slugs(ctx context.Context) ([]string, error)
	SectorCounts(ctx context.Context) ([]SectorCount, error)
	CityCounts(ctx context.Context) ([]CityCount, error)
}
