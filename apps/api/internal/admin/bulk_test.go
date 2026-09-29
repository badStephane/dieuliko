package admin

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"slices"
	"strings"
	"testing"
)

func TestBulkHidesSeveralListingsAndAuditsEachOne(t *testing.T) {
	resetDB(t)
	service := NewCompanyService(testPool, &memStore{objects: map[string][]byte{}}, slog.New(slog.DiscardHandler))
	adminID := newUser(t, "admin", "Admin")
	ctx := context.Background()
	first, err := service.Create(ctx, adminID, validCompany())
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	second, err := service.Create(ctx, adminID, validCompany())
	if err != nil {
		t.Fatalf("create: %v", err)
	}

	result, err := service.Bulk(ctx, adminID, BulkHide, []string{first.Slug, second.Slug, second.Slug, "inconnue"})
	if err != nil {
		t.Fatalf("bulk: %v", err)
	}

	if result.Updated != 2 {
		t.Errorf("updated = %d, want 2 (duplicates and unknown slugs skipped)", result.Updated)
	}
	for _, slug := range []string{first.Slug, second.Slug} {
		listing, err := service.Get(ctx, slug)
		if err != nil || listing.HiddenAt == nil {
			t.Errorf("%s: hidden = %v, err %v", slug, listing.HiddenAt, err)
		}
		if actions, _ := audit(t, slug); !slices.Equal(actions, []string{"company.create", "company.hide"}) {
			t.Errorf("%s: audit = %v", slug, actions)
		}
	}

	if _, err := service.Bulk(ctx, adminID, BulkVerify, []string{first.Slug}); err != nil {
		t.Fatalf("verify: %v", err)
	}
	if listing, _ := service.Get(ctx, first.Slug); !listing.Verified {
		t.Error("bulk verify did not verify")
	}
}

func TestBulkRejectsBadRequests(t *testing.T) {
	service := NewCompanyService(nil, nil, slog.New(slog.DiscardHandler))
	many := make([]string, MaxBulkSlugs+1)
	for i := range many {
		many[i] = "fiche"
	}
	tests := []struct {
		name   string
		action string
		slugs  []string
		field  string
	}{
		{"unknown action", "delete", []string{"fiche"}, "action"},
		{"no listing", BulkHide, nil, "slugs"},
		{"too many", BulkHide, many, "slugs"},
		{"bad slug", BulkHide, []string{"../x"}, "slugs"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := service.Bulk(context.Background(), adminID, tt.action, tt.slugs)
			var invalid *ValidationError
			if !errors.As(err, &invalid) || invalid.Fields[tt.field] == "" {
				t.Errorf("err = %v, want a validation error on %s", err, tt.field)
			}
		})
	}
}

func TestBulkRoute(t *testing.T) {
	companies := &fakeCompanies{}
	router := newRouter(Services{Companies: companies})

	rec := send(router, http.MethodPost, "/v1/admin/companies/bulk", adminToken, `{"action":"verify","slugs":["a","b"]}`)

	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), `"updated":2`) {
		t.Errorf("status %d body %s", rec.Code, rec.Body.String())
	}
	if companies.gotBulkAction != BulkVerify || !slices.Equal(companies.gotSlugs, []string{"a", "b"}) {
		t.Errorf("action %q slugs %v", companies.gotBulkAction, companies.gotSlugs)
	}
}

func TestSearchFiltersByQualityGapAndSortsByUpdate(t *testing.T) {
	resetDB(t)
	service := NewCompanyService(testPool, &memStore{objects: map[string][]byte{}}, slog.New(slog.DiscardHandler))
	adminID := newUser(t, "admin", "Admin")
	ctx := context.Background()
	full := validCompany()
	full.Description = "Expertise comptable et audit."
	complete, err := service.Create(ctx, adminID, full)
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	if _, err := service.SetLogo(ctx, adminID, complete.Slug, pngLogo(t)); err != nil {
		t.Fatalf("logo: %v", err)
	}
	bare := CompanyInput{Name: "Atelier Sow", Sector: "finance-comptabilite", City: "Thiès"}
	sparse, err := service.Create(ctx, adminID, bare)
	if err != nil {
		t.Fatalf("create sparse: %v", err)
	}

	slugsFor := func(filters CompanyFilters) []string {
		t.Helper()
		page, err := service.Search(ctx, filters, 0, 20)
		if err != nil {
			t.Fatalf("search %+v: %v", filters, err)
		}
		slugs := []string{}
		for _, item := range page.Items {
			slugs = append(slugs, item.Slug)
		}
		return slugs
	}

	for _, quality := range []string{QualityNoLogo, QualityNoDescription, QualityNoContact} {
		if got := slugsFor(CompanyFilters{Quality: quality, Sort: SortName}); !slices.Equal(got, []string{sparse.Slug}) {
			t.Errorf("%s: %v, want only %s", quality, got, sparse.Slug)
		}
	}
	if got := slugsFor(CompanyFilters{Quality: QualityUnverified, Sort: SortName}); len(got) != 2 {
		t.Errorf("unverified: %v", got)
	}
	if got := slugsFor(CompanyFilters{Sort: SortUpdated}); !slices.Equal(got, []string{sparse.Slug, complete.Slug}) {
		t.Errorf("by update: %v", got)
	}
	page, _ := service.Search(ctx, CompanyFilters{Sort: SortName}, 0, 20)
	if page.Items[0].Slug != sparse.Slug || page.Items[1].LogoVersion == nil {
		t.Errorf("by name: %+v", page.Items)
	}
}
