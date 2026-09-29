package claim

import (
	"strings"
	"testing"
)

func TestValidateRequestTrimsAndNormalizes(t *testing.T) {
	got, err := validateRequest(RequestInput{CompanySlug: " sonatel ", JobTitle: "  DRH ", Phone: "", Message: " Bonjour \r\n"})

	if err != nil {
		t.Fatalf("validateRequest: %v", err)
	}
	want := RequestInput{CompanySlug: "sonatel", JobTitle: "DRH", Phone: "", Message: "Bonjour"}
	if got != want {
		t.Errorf("got %+v, want %+v", got, want)
	}
}

func TestValidateRequestNamesEveryInvalidField(t *testing.T) {
	_, err := validateRequest(RequestInput{
		CompanySlug: "", JobTitle: strings.Repeat("a", maxJobTitleLength+1), Phone: "12", Message: strings.Repeat("é", maxMessageLength+1),
	})

	validation, ok := err.(*ValidationError)
	if !ok {
		t.Fatalf("err = %v, want a ValidationError", err)
	}
	for _, field := range []string{"companySlug", "jobTitle", "phone", "message"} {
		if validation.Fields[field] == "" {
			t.Errorf("no message for %q in %v", field, validation.Fields)
		}
	}
}

func TestValidateRequestNeedsAJobTitleWithoutMarkup(t *testing.T) {
	for _, title := range []string{"  ", "<b>DRH</b>", "DRH\x00", "DRH\xff"} {
		if _, err := validateRequest(RequestInput{CompanySlug: "sonatel", JobTitle: title}); err == nil {
			t.Errorf("job title %q accepted", title)
		}
	}
}
