package listing

import (
	"strings"
	"testing"
)

func validListing() Input {
	return Input{
		Name: "  Cabinet Ndiaye & Associés ", Sector: "finance-comptabilite", City: " Dakar ",
		CompanyType: "Cabinet d'expertise comptable", Website: "https://ndiaye.sn", Email: "contact@ndiaye.sn",
		Phone: "+221 33 824 73 73", Size: "pme", SocialLinks: map[string]string{"LinkedIn": " https://linkedin.com/company/ndiaye "},
	}
}

func TestValidateCompanyTrimsAValidListing(t *testing.T) {
	got, problems := Validate(validListing())

	if len(problems) != 0 {
		t.Fatalf("problems = %v, want none", problems)
	}
	if got.Name != "Cabinet Ndiaye & Associés" || got.City != "Dakar" || got.SocialLinks["linkedin"] != "https://linkedin.com/company/ndiaye" {
		t.Errorf("normalized = %+v", got)
	}
}

func TestValidateCompanyNamesEveryInvalidField(t *testing.T) {
	input := Input{
		Name: " ", Sector: "", City: "", Website: "ftp://ndiaye.sn", Email: "pas-un-email", Phone: "appelez-nous",
		Size: "enorme", Description: strings.Repeat("a", maxDescriptionLength+1),
		SocialLinks: map[string]string{"myspace": "https://myspace.com/x", "facebook": "javascript:alert(1)"},
	}

	_, problems := Validate(input)

	for _, field := range []string{"name", "sector", "city", "website", "email", "phone", "size", "description", "socialLinks.myspace", "socialLinks.facebook"} {
		if problems[field] == "" {
			t.Errorf("no message for %q (got %v)", field, problems)
		}
	}
}

func TestValidateCompanyAcceptsEmptyOptionalFields(t *testing.T) {
	_, problems := Validate(Input{Name: "Sall BTP", Sector: "btp-ingenierie", City: "Thiès"})

	if len(problems) != 0 {
		t.Errorf("problems = %v, want none", problems)
	}
}

func TestChangedFieldsNamesWhatDiffers(t *testing.T) {
	before := Input{Name: "Sonatel", City: "Dakar", SocialLinks: map[string]string{}}
	after := Input{Name: "Sonatel", City: "Thiès", Description: "Opérateur", SocialLinks: map[string]string{"x": "https://x.com/sonatel"}}

	got := ChangedFields(before, after)

	if strings.Join(got, ",") != "city,description,socialLinks" {
		t.Errorf("changed = %v", got)
	}
	if len(ChangedFields(before, before)) != 0 {
		t.Error("no change must list nothing")
	}
}
