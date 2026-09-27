package company

import (
	"slices"
	"strings"
	"testing"
)

func TestSearchWords(t *testing.T) {
	tests := []struct {
		name  string
		query string
		want  []string
	}{
		{"empty query matches everything", "   ", []string{}},
		{"splits on any whitespace", " hôtel\tThiès \n spa ", []string{"hôtel", "Thiès", "spa"}},
		{"escapes LIKE metacharacters", `100% a_b c\d`, []string{`100\%`, `a\_b`, `c\\d`}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := SearchWords(tt.query); !slices.Equal(got, tt.want) {
				t.Errorf("SearchWords(%q) = %q, want %q", tt.query, got, tt.want)
			}
		})
	}
}

func TestSearchWordsCapsQueryLengthInRunes(t *testing.T) {
	query := strings.Repeat("é", MaxQueryLength+20)

	words := SearchWords(query)

	if len(words) != 1 || len([]rune(words[0])) != MaxQueryLength {
		t.Fatalf("got %q; want 1 word of %d runes", words, MaxQueryLength)
	}
}

func TestSearchWordsCapsWordCount(t *testing.T) {
	query := strings.Repeat("a ", MaxSearchWords+5)

	if got := SearchWords(query); len(got) != MaxSearchWords {
		t.Fatalf("got %d words, want %d", len(got), MaxSearchWords)
	}
}
