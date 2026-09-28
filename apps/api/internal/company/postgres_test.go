package company

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"os"
	"slices"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/badStephane/dieuliko/apps/api/internal/database/dbgen"
	"github.com/badStephane/dieuliko/apps/api/internal/testutil"
)

// testPool is nil in -short mode: integration tests then skip.
var testPool *pgxpool.Pool

func TestMain(m *testing.M) {
	flag.Parse()
	if testing.Short() {
		os.Exit(m.Run())
	}

	ctx := context.Background()
	pg, err := testutil.StartPostgres(ctx)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	testPool = pg.Pool
	code := m.Run()
	if err := pg.Stop(ctx); err != nil {
		fmt.Fprintln(os.Stderr, err)
	}
	os.Exit(code)
}

// seed empties the companies table and imports the given records.
func seed(t *testing.T, records ...map[string]any) *PostgresRepository {
	t.Helper()
	if testPool == nil {
		t.Skip("integration test (needs Docker); run without -short")
	}
	ctx := context.Background()
	// CASCADE also empties tables pointing at companies (cover letters), which only exist in other tests.
	if _, err := testPool.Exec(ctx, "TRUNCATE companies CASCADE"); err != nil {
		t.Fatalf("truncate: %v", err)
	}
	params, err := ParseScraped(encode(t, records...))
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if err := ImportScraped(ctx, testPool, params); err != nil {
		t.Fatalf("import: %v", err)
	}
	return NewPostgresRepository(dbgen.New(testPool))
}

// record is a minimal valid scraped company; place_id derives from the slug to stay unique.
func record(slug string, overrides map[string]any) map[string]any {
	base := map[string]any{"slug": slug, "name": slug, "place_id": "place-" + slug, "rating_count": 0}
	for key, value := range overrides {
		base[key] = value
	}
	return scrapedJSON(base)
}

func slugsOf(companies []Company) []string {
	slugs := make([]string, len(companies))
	for i, company := range companies {
		slugs[i] = company.Slug
	}
	return slugs
}

func search(t *testing.T, repo *PostgresRepository, filters Filters) []string {
	t.Helper()
	page, err := repo.Search(context.Background(), filters, PageRequest{Offset: 0, Limit: MaxPageLimit})
	if err != nil {
		t.Fatalf("Search(%+v): %v", filters, err)
	}
	if page.Total != len(page.Items) {
		t.Fatalf("Search(%+v): total %d but %d items", filters, page.Total, len(page.Items))
	}
	return slugsOf(page.Items)
}

func TestSearchOrdersByNotorietyThenName(t *testing.T) {
	repo := seed(t,
		record("b-small", map[string]any{"name": "B", "rating_count": 3}),
		record("big", map[string]any{"name": "Z", "rating_count": 900}),
		record("a-small", map[string]any{"name": "A", "rating_count": 3}),
	)

	got := search(t, repo, Filters{})

	if want := []string{"big", "a-small", "b-small"}; !slices.Equal(got, want) {
		t.Fatalf("order = %v, want %v", got, want)
	}
}

func TestSearchMatchesEveryWordIgnoringAccentsAndCase(t *testing.T) {
	repo := seed(t,
		record("teranga", map[string]any{"name": "Hôtel Téranga", "city": "Thiès", "address": nil}),
		record("sacre-coeur", map[string]any{"name": "Clinique", "address": "Sacré-Cœur 3, Dakar", "sector": "sante", "company_type": nil}),
		record("other", map[string]any{"name": "Boulangerie", "city": "Dakar", "address": nil}),
	)

	tests := []struct {
		query string
		want  []string
	}{
		{"HOTEL thies", []string{"teranga"}},
		{"hôtel dakar", []string{}},
		{"coeur", []string{"sacre-coeur"}},
		{"cœur", []string{"sacre-coeur"}},
		{"santé", []string{"sacre-coeur"}}, // the sector label is searchable
		{"digital", []string{"other", "teranga"}},
	}
	for _, tt := range tests {
		t.Run(tt.query, func(t *testing.T) {
			got := search(t, repo, Filters{Query: tt.query})
			slices.Sort(got)
			if !slices.Equal(got, tt.want) {
				t.Errorf("Search(%q) = %v, want %v", tt.query, got, tt.want)
			}
		})
	}
}

func TestSearchTreatsLikeMetacharactersLiterally(t *testing.T) {
	repo := seed(t,
		record("percent", map[string]any{"name": "Promo 100% local"}),
		record("plain", map[string]any{"name": "Promo 1000 local"}),
	)

	if got := search(t, repo, Filters{Query: "100%"}); !slices.Equal(got, []string{"percent"}) {
		t.Errorf("Search(100%%) = %v", got)
	}
	if got := search(t, repo, Filters{Query: "_"}); len(got) != 0 {
		t.Errorf("Search(_) = %v, want no match", got)
	}
}

func TestSearchFiltersBySectorAndCity(t *testing.T) {
	repo := seed(t,
		record("thies-sante", map[string]any{"sector": "sante", "city": "Thiès"}),
		record("thies-it", map[string]any{"sector": "informatique", "city": "Thies"}),
		record("dakar-sante", map[string]any{"sector": "sante", "city": "Dakar"}),
	)

	got := search(t, repo, Filters{Sector: "sante", City: "THIES"})

	if !slices.Equal(got, []string{"thies-sante"}) {
		t.Fatalf("got %v", got)
	}
}

func TestSearchPaginatesAndCountsAllMatches(t *testing.T) {
	var records []map[string]any
	for i := range 5 {
		records = append(records, record(fmt.Sprintf("c%d", i), map[string]any{"rating_count": 10 - i}))
	}
	repo := seed(t, records...)

	page, err := repo.Search(context.Background(), Filters{}, PageRequest{Offset: 2, Limit: 2})
	if err != nil {
		t.Fatalf("Search: %v", err)
	}

	if page.Total != 5 || !slices.Equal(slugsOf(page.Items), []string{"c2", "c3"}) {
		t.Fatalf("page = %v (total %d)", slugsOf(page.Items), page.Total)
	}
}

func TestFindBySlug(t *testing.T) {
	repo := seed(t, record("and-vision", map[string]any{
		"name": "And Vision Agency", "rating": 4.5, "rating_count": 41,
		"social_links": map[string]string{"linkedin": "https://linkedin.com/company/x"},
	}))
	ctx := context.Background()

	company, err := repo.FindBySlug(ctx, "and-vision")
	if err != nil {
		t.Fatalf("FindBySlug: %v", err)
	}
	if company.Name != "And Vision Agency" || company.Rating == nil || *company.Rating != 4.5 || company.RatingCount != 41 ||
		company.SocialLinks["linkedin"] != "https://linkedin.com/company/x" || company.AcceptsSpontaneous != nil {
		t.Errorf("company = %+v", company)
	}

	if _, err := repo.FindBySlug(ctx, "missing"); !errors.Is(err, ErrNotFound) {
		t.Errorf("FindBySlug(missing) err = %v, want ErrNotFound", err)
	}
}

func TestSlugs(t *testing.T) {
	repo := seed(t, record("b", nil), record("a", nil))

	slugs, err := repo.Slugs(context.Background())

	if err != nil || !slices.Equal(slugs, []string{"a", "b"}) {
		t.Fatalf("Slugs = %v, %v", slugs, err)
	}
}

func TestSectorCountsIncludesEmptySectors(t *testing.T) {
	repo := seed(t, record("a", map[string]any{"sector": "sante"}), record("b", map[string]any{"sector": "sante"}))

	counts, err := repo.SectorCounts(context.Background())
	if err != nil {
		t.Fatalf("SectorCounts: %v", err)
	}

	if len(counts) != 17 {
		t.Fatalf("got %d sectors, want the 17 of the taxonomy", len(counts))
	}
	if counts[0] != (SectorCount{Slug: "sante", Label: "Santé", Count: 2}) {
		t.Errorf("first = %+v", counts[0])
	}
	if counts[1].Count != 0 {
		t.Errorf("second = %+v, want an empty sector", counts[1])
	}
}

func TestCityCountsMergesSpellingVariants(t *testing.T) {
	repo := seed(t,
		record("a", map[string]any{"city": "Mbodiène"}),
		record("b", map[string]any{"city": "Mbodiene"}),
		record("c", map[string]any{"city": "Mbodiène"}),
		record("d", map[string]any{"city": "Dakar"}),
	)

	counts, err := repo.CityCounts(context.Background())
	if err != nil {
		t.Fatalf("CityCounts: %v", err)
	}

	want := []CityCount{{City: "Mbodiène", Count: 3}, {City: "Dakar", Count: 1}}
	if !slices.Equal(counts, want) {
		t.Fatalf("CityCounts = %+v, want %+v", counts, want)
	}
}

func TestCityCountsBreaksSpellingTiesInFrenchOrder(t *testing.T) {
	repo := seed(t,
		record("a", map[string]any{"city": "Mbodiène"}),
		record("b", map[string]any{"city": "Mbodiene"}),
		record("c", map[string]any{"city": "Mbodiène"}),
		record("d", map[string]any{"city": "Mbodiene"}),
	)

	for range 5 {
		counts, err := repo.CityCounts(context.Background())
		if err != nil {
			t.Fatalf("CityCounts: %v", err)
		}
		if want := []CityCount{{City: "Mbodiene", Count: 4}}; !slices.Equal(counts, want) {
			t.Fatalf("CityCounts = %+v, want %+v", counts, want)
		}
	}
}

func TestImportIsIdempotentAndUpdatesScrapedListings(t *testing.T) {
	repo := seed(t, record("a", map[string]any{"name": "Old name"}))
	params, err := ParseScraped(encode(t, record("a", map[string]any{"name": "New name"})))
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	ctx := context.Background()

	for range 2 {
		if err := ImportScraped(ctx, testPool, params); err != nil {
			t.Fatalf("import: %v", err)
		}
	}

	company, err := repo.FindBySlug(ctx, "a")
	if err != nil || company.Name != "New name" {
		t.Fatalf("company = %+v, err %v", company, err)
	}
	if slugs, _ := repo.Slugs(ctx); len(slugs) != 1 {
		t.Errorf("got %d companies after two imports, want 1", len(slugs))
	}
}

func TestImportNeverOverwritesVerifiedCompanies(t *testing.T) {
	repo := seed(t, record("claimed", map[string]any{"name": "Claimed name", "verified": true}))
	params, err := ParseScraped(encode(t, record("claimed", map[string]any{"name": "Scraped name"})))
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	ctx := context.Background()

	if err := ImportScraped(ctx, testPool, params); err != nil {
		t.Fatalf("import: %v", err)
	}

	company, err := repo.FindBySlug(ctx, "claimed")
	if err != nil || company.Name != "Claimed name" {
		t.Fatalf("company = %+v, err %v", company, err)
	}
}

func TestImportRollsBackEverythingOnError(t *testing.T) {
	repo := seed(t)
	params, err := ParseScraped(encode(t,
		record("valid", nil),
		record("unknown-sector", map[string]any{"sector": "astrologie"}),
	))
	if err != nil {
		t.Fatalf("parse: %v", err)
	}

	err = ImportScraped(context.Background(), testPool, params)

	if err == nil || !strings.Contains(err.Error(), "unknown-sector") {
		t.Fatalf("err = %v, want a failure naming the bad record", err)
	}
	if slugs, _ := repo.Slugs(context.Background()); len(slugs) != 0 {
		t.Errorf("slugs = %v, want nothing imported", slugs)
	}
}

// hide takes a listing out of the public directory, as the back-office does.
func hide(t *testing.T, slug string) {
	t.Helper()
	if _, err := testPool.Exec(context.Background(), "UPDATE companies SET hidden_at = now() WHERE slug = $1", slug); err != nil {
		t.Fatalf("hide %s: %v", slug, err)
	}
}

func TestHiddenCompaniesLeaveThePublicDirectory(t *testing.T) {
	repo := seed(t,
		record("visible", map[string]any{"sector": "sante", "city": "Dakar"}),
		record("masquee", map[string]any{"sector": "sante", "city": "Thiès"}),
	)
	hide(t, "masquee")
	ctx := context.Background()

	if got := search(t, repo, Filters{}); !slices.Equal(got, []string{"visible"}) {
		t.Errorf("search = %v, want only the visible company", got)
	}
	if _, err := repo.FindBySlug(ctx, "masquee"); !errors.Is(err, ErrNotFound) {
		t.Errorf("FindBySlug(hidden) err = %v, want ErrNotFound", err)
	}
	if slugs, err := repo.Slugs(ctx); err != nil || !slices.Equal(slugs, []string{"visible"}) {
		t.Errorf("Slugs = %v, %v", slugs, err)
	}
	sectors, err := repo.SectorCounts(ctx)
	if err != nil || sectors[0] != (SectorCount{Slug: "sante", Label: "Santé", Count: 1}) {
		t.Errorf("first sector = %+v, %v; want the hidden company uncounted", sectors[0], err)
	}
	cities, err := repo.CityCounts(ctx)
	if err != nil || len(cities) != 1 || cities[0].City != "Dakar" {
		t.Errorf("cities = %+v, %v; want only Dakar", cities, err)
	}
}

func TestImportNeverOverwritesCompaniesEditedInTheBackOffice(t *testing.T) {
	repo := seed(t, record("corrigee", map[string]any{"name": "Nom scrapé"}))
	ctx := context.Background()
	if _, err := testPool.Exec(ctx, "UPDATE companies SET name = 'Nom corrigé', curated_at = now() WHERE slug = 'corrigee'"); err != nil {
		t.Fatalf("curate: %v", err)
	}
	params, err := ParseScraped(encode(t, record("corrigee", map[string]any{"name": "Nom scrapé"})))
	if err != nil {
		t.Fatalf("parse: %v", err)
	}

	if err := ImportScraped(ctx, testPool, params); err != nil {
		t.Fatalf("import: %v", err)
	}

	company, err := repo.FindBySlug(ctx, "corrigee")
	if err != nil || company.Name != "Nom corrigé" {
		t.Fatalf("company = %+v, err %v; want the back-office edit kept", company, err)
	}
}
