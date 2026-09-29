package admin

import (
	"regexp"
	"strings"

	"github.com/badStephane/dieuliko/apps/api/internal/company"
	"github.com/badStephane/dieuliko/apps/api/internal/listing"
)

// CompanyInput is a listing as the back-office edits it (see package listing).
type CompanyInput = listing.Input

const (
	maxSlugLength = 80
	fallbackSlug  = "entreprise"
)

var nonSlugRuns = regexp.MustCompile(`[^a-z0-9]+`)

// slugify turns a company name into a URL slug ("Cabinet Ndiaye & Associés" → "cabinet-ndiaye-associes").
func slugify(name string) string {
	slug := strings.Trim(nonSlugRuns.ReplaceAllString(company.NormalizeSlug(strings.TrimSpace(name)), "-"), "-")
	if len(slug) > maxSlugLength {
		slug = strings.TrimRight(slug[:maxSlugLength], "-")
	}
	if slug == "" {
		return fallbackSlug
	}
	return slug
}
