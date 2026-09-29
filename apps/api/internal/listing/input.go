// Package listing holds what the back-office and the company space share about editing a directory listing: its
// fields and their validation, the fields an edit changed, and the logo files.
package listing

import (
	"fmt"
	"maps"
	"net/url"
	"regexp"
	"slices"
	"strings"
	"unicode/utf8"
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
	// MaxSectorLength bounds a sector slug.
	MaxSectorLength = 80
)

var (
	companySizes   = []string{"startup", "pme", "grande_entreprise"}
	socialNetworks = []string{"facebook", "instagram", "linkedin", "tiktok", "x", "youtube"}
	emailPattern   = regexp.MustCompile(`^[^\s@]+@[^\s@]+\.[^\s@]+$`)
	phonePattern   = regexp.MustCompile(`^\+?[0-9 ().-]{6,30}$`)
)

// Input is a listing as it is edited, in the back-office or by its company; empty optional fields are stored as NULL.
type Input struct {
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

// Validate returns the trimmed listing and a French message per invalid field ("socialLinks.<network>" for links).
// Whether the sector exists is checked against the database by the caller.
func Validate(input Input) (Input, map[string]string) {
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
	clean := Input{
		Name:        text("name", input.Name, maxNameLength, true),
		Sector:      text("sector", input.Sector, MaxSectorLength, true),
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

// ChangedFields lists the JSON names of the fields that differ, in form order.
func ChangedFields(before, after Input) []string {
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
