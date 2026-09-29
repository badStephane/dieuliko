package candidate

import (
	"reflect"
	"strings"
	"testing"
	"time"
)

// validationNow is the "current month" of validation tests: September 2026.
var validationNow = time.Date(2026, 9, 28, 10, 0, 0, 0, time.UTC)

func ptr[T any](v T) *T { return &v }

func validInput() ProfileInput {
	return ProfileInput{
		Headline:       "Comptable junior",
		Summary:        "Rigoureuse et organisée.",
		Phone:          "77 123 45 67",
		City:           "Dakar",
		DesiredSectors: []string{"finance-comptabilite"},
		Skills:         []string{"Excel", "Sage"},
		Languages:      []Language{{Language: "Français", Level: LevelFluent}},
		Experiences: []Experience{{
			Title: "Assistante comptable", Organization: "Cabinet Ndiaye", City: "Dakar",
			StartMonth: "2024-01", EndMonth: ptr("2025-06"), Description: "Saisie et rapprochements.",
		}},
		Educations: []Education{{
			Degree: "Licence", School: "UCAD", Field: "Gestion", StartMonth: "2020-10", EndMonth: ptr("2023-07"),
		}},
	}
}

func TestValidateProfileNormalizesInput(t *testing.T) {
	input := validInput()
	input.Headline = "  Comptable   junior "
	input.Summary = "  Ligne 1\r\nLigne 2  "
	input.City = " Saint-Louis  "
	input.Skills = []string{" Excel ", "excel", "", "Sage"}
	input.DesiredSectors = []string{"finance-comptabilite", "finance-comptabilite"}

	got, err := validateProfile(input, validationNow)

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got.Headline != "Comptable junior" || got.City != "Saint-Louis" {
		t.Errorf("single-line fields not collapsed: %q, %q", got.Headline, got.City)
	}
	if got.Summary != "Ligne 1\nLigne 2" {
		t.Errorf("summary = %q", got.Summary)
	}
	if !reflect.DeepEqual(got.Skills, []string{"Excel", "Sage"}) {
		t.Errorf("skills = %q, want duplicates and blanks dropped", got.Skills)
	}
	if !reflect.DeepEqual(got.DesiredSectors, []string{"finance-comptabilite"}) {
		t.Errorf("sectors = %q, want duplicates dropped", got.DesiredSectors)
	}
}

func TestValidateProfileTurnsMissingListsIntoEmptyOnes(t *testing.T) {
	got, err := validateProfile(ProfileInput{}, validationNow)

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got.Skills == nil || got.DesiredSectors == nil || got.Languages == nil || got.Experiences == nil || got.Educations == nil {
		t.Errorf("lists must never be nil: %+v", got)
	}
}

func TestNormalizePhone(t *testing.T) {
	tests := []struct {
		raw  string
		want string
		ok   bool
	}{
		{"", "", true},
		{"77 123 45 67", "+221771234567", true},
		{"33-823-45-67", "+221338234567", true},
		{"+221 77 123 45 67", "+221771234567", true},
		{"00221771234567", "+221771234567", true},
		{"+33 6 12 34 56 78", "+33612345678", true},
		{"(+221) 70.123.45.67", "+221701234567", true},
		{"12345", "", false},
		{"+221 12 345 67 89", "", false},
		{"+221 77 123 45", "", false},
		{"77 123 45 67 ext", "", false},
		{"+0 123 456 789", "", false},
	}
	for _, tt := range tests {
		got, ok := NormalizePhone(tt.raw)
		if got != tt.want || ok != tt.ok {
			t.Errorf("NormalizePhone(%q) = %q, %v; want %q, %v", tt.raw, got, ok, tt.want, tt.ok)
		}
	}
}

func TestValidateProfileReportsInvalidFields(t *testing.T) {
	tests := []struct {
		name   string
		mutate func(*ProfileInput)
		field  string
	}{
		{"headline too long", func(p *ProfileInput) { p.Headline = strings.Repeat("a", 101) }, "headline"},
		{"control character", func(p *ProfileInput) { p.City = "Dakar\x00" }, "city"},
		{"summary too long", func(p *ProfileInput) { p.Summary = strings.Repeat("é", 2001) }, "summary"},
		{"invalid phone", func(p *ProfileInput) { p.Phone = "12" }, "phone"},
		{"too many sectors", func(p *ProfileInput) {
			p.DesiredSectors = []string{"a", "b", "c", "d", "e", "f"}
		}, "desiredSectors"},
		{"malformed sector", func(p *ProfileInput) { p.DesiredSectors = []string{"Banque Finance"} }, "desiredSectors"},
		{"too many skills", func(p *ProfileInput) {
			p.Skills = make([]string, 31)
			for i := range p.Skills {
				p.Skills[i] = strings.Repeat("s", i+1)
			}
		}, "skills"},
		{"skill too long", func(p *ProfileInput) { p.Skills = []string{strings.Repeat("s", 51)} }, "skills"},
		{"unknown language level", func(p *ProfileInput) { p.Languages[0].Level = "bilingue" }, "languages.0.level"},
		{"missing language", func(p *ProfileInput) { p.Languages[0].Language = " " }, "languages.0.language"},
		{"duplicate language", func(p *ProfileInput) {
			p.Languages = append(p.Languages, Language{Language: "français", Level: LevelNative})
		}, "languages.1.language"},
		{"missing job title", func(p *ProfileInput) { p.Experiences[0].Title = "" }, "experiences.0.title"},
		{"missing organization", func(p *ProfileInput) { p.Experiences[0].Organization = "" }, "experiences.0.organization"},
		{"malformed start month", func(p *ProfileInput) { p.Experiences[0].StartMonth = "2024-13" }, "experiences.0.startMonth"},
		{"missing start month", func(p *ProfileInput) { p.Experiences[0].StartMonth = "" }, "experiences.0.startMonth"},
		{"start month in the future", func(p *ProfileInput) {
			p.Experiences[0].StartMonth = "2026-10"
			p.Experiences[0].EndMonth = nil
		}, "experiences.0.startMonth"},
		{"start month too old", func(p *ProfileInput) { p.Experiences[0].StartMonth = "1949-12" }, "experiences.0.startMonth"},
		{"end before start", func(p *ProfileInput) { p.Experiences[0].EndMonth = ptr("2023-12") }, "experiences.0.endMonth"},
		{"description too long", func(p *ProfileInput) {
			p.Experiences[0].Description = strings.Repeat("d", 2001)
		}, "experiences.0.description"},
		{"too many experiences", func(p *ProfileInput) {
			p.Experiences = make([]Experience, 21)
			for i := range p.Experiences {
				p.Experiences[i] = validInput().Experiences[0]
			}
		}, "experiences"},
		{"missing school", func(p *ProfileInput) { p.Educations[0].School = "" }, "educations.0.school"},
		{"malformed education end", func(p *ProfileInput) { p.Educations[0].EndMonth = ptr("juillet") }, "educations.0.endMonth"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			input := validInput()
			tt.mutate(&input)

			_, err := validateProfile(input, validationNow)

			validation, ok := err.(*ValidationError)
			if !ok {
				t.Fatalf("err = %v, want a ValidationError", err)
			}
			if validation.Fields[tt.field] == "" {
				t.Errorf("fields = %v, want an error on %q", validation.Fields, tt.field)
			}
		})
	}
}

func TestValidateProfileAcceptsOngoingPositionsAndTheCurrentMonth(t *testing.T) {
	input := validInput()
	input.Experiences[0].StartMonth = "2026-09"
	input.Experiences[0].EndMonth = nil
	input.Educations[0].EndMonth = ptr("2026-09")

	if _, err := validateProfile(input, validationNow); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestValidateProfileBoundsMonthsInUTC(t *testing.T) {
	// 1 October 01:00 in Paris is still 30 September in UTC: October has not started.
	paris := time.FixedZone("CEST", 2*60*60)
	now := time.Date(2026, 10, 1, 1, 0, 0, 0, paris)
	input := validInput()
	input.Experiences[0].StartMonth = "2026-10"
	input.Experiences[0].EndMonth = nil

	_, err := validateProfile(input, now)

	validation, ok := err.(*ValidationError)
	if !ok || validation.Fields["experiences.0.startMonth"] == "" {
		t.Fatalf("err = %v, want October rejected as future", err)
	}
}

func TestParseMonth(t *testing.T) {
	got, ok := parseMonth("2024-03")

	if !ok || !got.Equal(time.Date(2024, 3, 1, 0, 0, 0, 0, time.UTC)) {
		t.Errorf("parseMonth = %v, %v", got, ok)
	}
	if formatMonth(got) != "2024-03" {
		t.Errorf("formatMonth = %q", formatMonth(got))
	}
	for _, raw := range []string{"2024-3", "2024-03-01", "03/2024", ""} {
		if _, ok := parseMonth(raw); ok {
			t.Errorf("parseMonth(%q) accepted", raw)
		}
	}
}
