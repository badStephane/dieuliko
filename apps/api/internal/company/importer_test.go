package company

import (
	"encoding/json"
	"strings"
	"testing"
)

// scrapedJSON builds a scraped-file record; overrides replace or add fields.
func scrapedJSON(overrides map[string]any) map[string]any {
	record := map[string]any{
		"name":                "And Vision Agency",
		"slug":                "and-vision-agency",
		"sector":              "informatique",
		"company_type":        "agence digitale / ESN",
		"description":         nil,
		"website":             "https://andvisionagency.com/",
		"email":               "contact@andvisionagency.com",
		"phone":               "+221 77 751 55 63",
		"city":                "Dakar",
		"address":             "115 Av. Blaise Diagne, Dakar, Senegal",
		"size":                "pme",
		"logo_url":            nil,
		"social_links":        map[string]string{},
		"accepts_spontaneous": nil,
		"verified":            false,
		"source":              "scraped_google_places",
		"place_id":            "ChIJkckHeRpzwQ4RmAv_1Q-pEOM",
		"rating":              5.0,
		"rating_count":        41,
		"notes":               "",
	}
	for key, value := range overrides {
		record[key] = value
	}
	return record
}

func encode(t *testing.T, records ...map[string]any) *strings.Reader {
	t.Helper()
	data, err := json.Marshal(records)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	return strings.NewReader(string(data))
}

func TestParseScrapedMapsRecords(t *testing.T) {
	params, err := ParseScraped(encode(t, scrapedJSON(map[string]any{"slug": "clinique-sacré-cœur", "company_type": "  "})))
	if err != nil {
		t.Fatalf("ParseScraped: %v", err)
	}
	if len(params) != 1 {
		t.Fatalf("got %d records, want 1", len(params))
	}

	p := params[0]
	if p.Slug != "clinique-sacre-coeur" {
		t.Errorf("Slug = %q, want accents stripped", p.Slug)
	}
	if p.CompanyType != nil {
		t.Errorf("CompanyType = %q, want nil for blank text", *p.CompanyType)
	}
	if p.Notes != nil {
		t.Errorf("Notes = %q, want nil for empty string", *p.Notes)
	}
	if p.Rating == nil || *p.Rating != 5 || p.RatingCount != 41 {
		t.Errorf("rating = %v/%d, want 5/41", p.Rating, p.RatingCount)
	}
	if string(p.SocialLinks) != "{}" {
		t.Errorf("SocialLinks = %s, want {}", p.SocialLinks)
	}
}

func TestParseScrapedDefaultsMissingOptionalValues(t *testing.T) {
	params, err := ParseScraped(encode(t, scrapedJSON(map[string]any{"rating_count": nil, "social_links": nil, "size": nil})))
	if err != nil {
		t.Fatalf("ParseScraped: %v", err)
	}

	if params[0].RatingCount != 0 || string(params[0].SocialLinks) != "{}" || params[0].Size != nil {
		t.Errorf("got rating_count=%d social_links=%s size=%v", params[0].RatingCount, params[0].SocialLinks, params[0].Size)
	}
}

func TestParseScrapedReportsEveryInvalidRecord(t *testing.T) {
	_, err := ParseScraped(encode(t,
		scrapedJSON(map[string]any{"name": " ", "slug": "bad slug!"}),
		scrapedJSON(map[string]any{"slug": "ok-slug", "size": "huge", "rating": 7.5, "rating_count": -1}),
		scrapedJSON(map[string]any{"slug": "x", "sector": "", "city": "", "source": ""}),
	))
	if err == nil {
		t.Fatal("ParseScraped succeeded, want an error")
	}

	for _, want := range []string{
		"record 0", "name is required", "must be kebab-case",
		"record 1", `size "huge"`, "rating 7.5", "rating_count -1",
		"record 2", "sector is required", "city is required", "source is required",
	} {
		if !strings.Contains(err.Error(), want) {
			t.Errorf("error does not mention %q:\n%v", want, err)
		}
	}
}

func TestParseScrapedRejectsSlugsThatCollideAfterNormalization(t *testing.T) {
	_, err := ParseScraped(encode(t,
		scrapedJSON(map[string]any{"slug": "la-parenthèse", "place_id": "a"}),
		scrapedJSON(map[string]any{"slug": "la-parenthese", "place_id": "b"}),
	))

	if err == nil || !strings.Contains(err.Error(), `duplicate slug "la-parenthese"`) {
		t.Fatalf("err = %v, want a duplicate slug error", err)
	}
}

func TestParseScrapedRejectsMalformedJSON(t *testing.T) {
	tests := map[string]string{
		"not an array":  `{"name": "x"}`,
		"unknown field": `[{"name": "x", "unexpected": true}]`,
		"wrong type":    `[{"name": 42}]`,
	}
	for name, input := range tests {
		t.Run(name, func(t *testing.T) {
			if _, err := ParseScraped(strings.NewReader(input)); err == nil {
				t.Fatal("ParseScraped succeeded, want an error")
			}
		})
	}
}
