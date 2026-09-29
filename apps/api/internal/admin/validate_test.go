package admin

import "testing"

func validCompany() CompanyInput {
	return CompanyInput{
		Name: "  Cabinet Ndiaye & Associés ", Sector: "finance-comptabilite", City: " Dakar ",
		CompanyType: "Cabinet d'expertise comptable", Website: "https://ndiaye.sn", Email: "contact@ndiaye.sn",
		Phone: "+221 33 824 73 73", Size: "pme", SocialLinks: map[string]string{"LinkedIn": " https://linkedin.com/company/ndiaye "},
	}
}

func TestSlugify(t *testing.T) {
	tests := map[string]string{
		"Cabinet Ndiaye & Associés": "cabinet-ndiaye-associes",
		"  Sacré-Cœur  ":            "sacre-coeur",
		"!!!":                       "entreprise",
	}
	for name, want := range tests {
		if got := slugify(name); got != want {
			t.Errorf("slugify(%q) = %q, want %q", name, got, want)
		}
	}
}
