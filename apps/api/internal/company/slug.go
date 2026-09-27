package company

import (
	"regexp"
	"strings"
	"unicode"

	"golang.org/x/text/runes"
	"golang.org/x/text/transform"
	"golang.org/x/text/unicode/norm"
)

var (
	slugPattern = regexp.MustCompile(`^[a-z0-9-]+$`)
	ligatures   = strings.NewReplacer("œ", "oe", "æ", "ae")
)

// NormalizeSlug lowercases a slug and strips accents and ligatures ("sacré-cœur" → "sacre-coeur"),
// exactly like the web front does, so URLs stay identical after the move to the API.
func NormalizeSlug(value string) string {
	lowered := ligatures.Replace(strings.ToLower(value))
	stripped, _, err := transform.String(transform.Chain(norm.NFD, runes.Remove(runes.In(unicode.Mn))), lowered)
	if err != nil {
		// Only possible on invalid UTF-8; the result then fails IsValidSlug.
		return lowered
	}
	return stripped
}

// IsValidSlug reports whether a slug is kebab-case ASCII.
func IsValidSlug(slug string) bool {
	return slugPattern.MatchString(slug)
}
