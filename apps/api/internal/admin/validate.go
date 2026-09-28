package admin

import (
	"fmt"
	"maps"
	"net/url"
	"regexp"
	"slices"
	"strings"
	"unicode/utf8"

	"github.com/badStephane/dieuliko/apps/api/internal/company"
)

// Listing limits: generous next to the scraped data (longest name 87, address 98 characters).
const (
	maxNameLength        = 150
	maxCityLength        = 60
	maxCompanyTypeLength = 100
	maxDescriptionLength = 2000
	maxURLLength         = 300
	maxEmailLength       = 254
	maxAddressLength     = 300
	maxSlugLength        = 80
	fallbackSlug         = "entreprise"
)

var (
	companySizes   = []string{"startup", "pme", "grande_entreprise"}
	socialNetworks = []string{"facebook", "instagram", "linkedin", "tiktok", "x", "youtube"}
	emailPattern   = regexp.MustCompile(`^[^\s@]+@[^\s@]+\.[^\s@]+$`)
	phonePattern   = regexp.MustCompile(`^\+?[0-9 ().-]{6,30}$`)
	nonSlugRuns    = regexp.MustCompile(`[^a-z0-9]+`)
)

// CompanyInput is a listing as the back-office edits it; empty optional fields are stored as NULL.
type CompanyInput struct {
	Name        string            `json:"name"`
	Sector      string            `json:"sector"`
	City        string            `json:"city"`
	CompanyType string            `json:"companyType"`
	Description string            `json:"description"`
	Website     string            `json:"website"`
	Email       string            `json:"email"`
	Phone       string            `json:"phone"`
	Address     string            `json:"address"`
	Size        string            `json:"size"`
	SocialLinks map[string]string `json:"socialLinks"`
}

// validateCompany returns the trimmed listing and a French message per invalid field ("socialLinks.<network>" for
// links). Whether the sector exists is checked against the database by the caller.
func validateCompany(input CompanyInput) (CompanyInput, map[string]string) {
	problems := map[string]string{}
	text := func(field, value string, maxLength int, required bool) string {
		value = strings.TrimSpace(value)
		switch {
		case required && value == "":
			problems[field] = "Ce champ est obligatoire."
		case utf8.RuneCountInString(value) > maxLength:
			problems[field] = fmt.Sprintf("%d caractères maximum.", maxLength)
		}
		return value
	}
	clean := CompanyInput{
		Name:        text("name", input.Name, maxNameLength, true),
		Sector:      text("sector", input.Sector, maxSlugLength, true),
		City:        text("city", input.City, maxCityLength, true),
		CompanyType: text("companyType", input.CompanyType, maxCompanyTypeLength, false),
		Description: text("description", input.Description, maxDescriptionLength, false),
		Website:     text("website", input.Website, maxURLLength, false),
		Email:       text("email", input.Email, maxEmailLength, false),
		Phone:       strings.TrimSpace(input.Phone),
		Address:     text("address", input.Address, maxAddressLength, false),
		Size:        strings.TrimSpace(input.Size),
		SocialLinks: map[string]string{},
	}
	if clean.Website != "" && problems["website"] == "" && !isWebURL(clean.Website) {
		problems["website"] = "Adresse web invalide (elle doit commencer par https:// ou http://)."
	}
	if clean.Email != "" && problems["email"] == "" && !emailPattern.MatchString(clean.Email) {
		problems["email"] = "Adresse email invalide."
	}
	if clean.Phone != "" && !phonePattern.MatchString(clean.Phone) {
		problems["phone"] = "Numéro invalide : chiffres, espaces et + uniquement."
	}
	if clean.Size != "" && !slices.Contains(companySizes, clean.Size) {
		problems["size"] = "Taille inconnue."
	}
	for _, network := range slices.Sorted(maps.Keys(input.SocialLinks)) {
		key := strings.ToLower(strings.TrimSpace(network))
		link := strings.TrimSpace(input.SocialLinks[network])
		switch {
		case !slices.Contains(socialNetworks, key):
			problems["socialLinks."+network] = "Réseau non pris en charge."
		case link == "":
			continue // an emptied link is removed
		case utf8.RuneCountInString(link) > maxURLLength || !isWebURL(link):
			problems["socialLinks."+key] = "Lien invalide (il doit commencer par https:// ou http://)."
		default:
			clean.SocialLinks[key] = link
		}
	}
	return clean, problems
}

// isWebURL accepts absolute http(s) URLs with a host, and nothing else (no javascript:, no relative paths).
func isWebURL(value string) bool {
	parsed, err := url.Parse(value)
	return err == nil && (parsed.Scheme == "https" || parsed.Scheme == "http") && parsed.Host != ""
}

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
