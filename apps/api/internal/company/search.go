package company

import (
	"strings"
	"unicode/utf8"
)

// Search input limits, aligned with the web front.
const (
	MaxQueryLength = 80
	MaxSearchWords = 10
)

var likeEscaper = strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`)

// SearchWords splits a free-text query into words that must all match, escaped for SQL LIKE.
// Accent and case folding happen in PostgreSQL (normalize_text) so both sides use the same rules.
// Escaping before that normalization is safe: normalize_text never alters \, % or _.
func SearchWords(query string) []string {
	words := strings.Fields(truncateRunes(query, MaxQueryLength))
	if len(words) > MaxSearchWords {
		words = words[:MaxSearchWords]
	}
	escaped := make([]string, len(words))
	for i, word := range words {
		escaped[i] = likeEscaper.Replace(word)
	}
	return escaped
}

func truncateRunes(value string, limit int) string {
	if utf8.RuneCountInString(value) <= limit {
		return value
	}
	return string([]rune(value)[:limit])
}
