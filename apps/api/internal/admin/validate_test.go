package admin

import (
	"strings"
	"testing"
)

func validCompany() CompanyInput {
	return CompanyInput{
		Name: "  Cabinet Ndiaye & Associés ", Sector: "finance-comptabilite", City: " Dakar ",
		CompanyType: "Cabinet d'expertise comptable", Website: "https://ndiaye.sn", Email: "contact@ndiaye.sn",
		Phone: "+221 33 824 73 73", Size: "pme", SocialLinks: map[string]string{"LinkedIn": " https://linkedin.com/company/ndiaye "},
	}
}

func TestValidateCompanyTrimsAValidListing(t *testing.T) {
	got, problems := validateCompany(validCompany())

	if len(problems) != 0 {
		t.Fatalf("problems = %v, want none", problems)
	}
	if got.Name != "Cabinet Ndiaye & Associés" || got.City != "Dakar" || got.SocialLinks["linkedin"] != "https://linkedin.com/company/ndiaye" {
		t.Errorf("normalized = %+v", got)
	}
}

func TestValidateCompanyNamesEveryInvalidField(t *testing.T) {
	input := CompanyInput{
		Name: " ", Sector: "", City: "", Website: "ftp://ndiaye.sn", Email: "pas-un-email", Phone: "appelez-nous",
		Size: "enorme", Description: strings.Repeat("a", maxDescriptionLength+1),
		SocialLinks: map[string]string{"myspace": "https://myspace.com/x", "facebook": "javascript:alert(1)"},
	}

	_, problems := validateCompany(input)

	for _, field := range []string{"name", "sector", "city", "website", "email", "phone", "size", "description", "socialLinks.myspace", "socialLinks.facebook"} {
		if problems[field] == "" {
			t.Errorf("no message for %q (got %v)", field, problems)
		}
	}
}

func TestValidateCompanyAcceptsEmptyOptionalFields(t *testing.T) {
	_, problems := validateCompany(CompanyInput{Name: "Sall BTP", Sector: "btp-ingenierie", City: "Thiès"})

	if len(problems) != 0 {
		t.Errorf("problems = %v, want none", problems)
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
