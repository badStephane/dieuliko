package company

import "testing"

func TestNormalizeSlug(t *testing.T) {
	tests := []struct {
		in, want string
	}{
		{"and-vision-agency", "and-vision-agency"},
		{"hôtel-la-teranga-sénégal", "hotel-la-teranga-senegal"},
		{"clinique-sacré-cœur", "clinique-sacre-coeur"},
		{"ÆTHER-Lab", "aether-lab"},
		{"Thiès", "thies"},
	}
	for _, tt := range tests {
		if got := NormalizeSlug(tt.in); got != tt.want {
			t.Errorf("NormalizeSlug(%q) = %q, want %q", tt.in, got, tt.want)
		}
	}
}

func TestIsValidSlug(t *testing.T) {
	valid := []string{"sante", "btp-ingenierie", "auchan-sacre-coeur-2"}
	invalid := []string{"", "Sante", "hôtel", "a b", "a_b", "../etc"}

	for _, slug := range valid {
		if !IsValidSlug(slug) {
			t.Errorf("IsValidSlug(%q) = false, want true", slug)
		}
	}
	for _, slug := range invalid {
		if IsValidSlug(slug) {
			t.Errorf("IsValidSlug(%q) = true, want false", slug)
		}
	}
}
