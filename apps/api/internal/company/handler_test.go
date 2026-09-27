package company

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
)

// fakeRepository records the last calls and returns canned results.
type fakeRepository struct {
	page       Page
	company    Company
	slugs      []string
	sectors    []SectorCount
	cities     []CityCount
	err        error
	gotFilters Filters
	gotPage    PageRequest
	gotSlug    string
}

func (f *fakeRepository) Search(_ context.Context, filters Filters, page PageRequest) (Page, error) {
	f.gotFilters, f.gotPage = filters, page
	return f.page, f.err
}

func (f *fakeRepository) FindBySlug(_ context.Context, slug string) (Company, error) {
	f.gotSlug = slug
	return f.company, f.err
}

func (f *fakeRepository) Slugs(context.Context) ([]string, error) { return f.slugs, f.err }

func (f *fakeRepository) SectorCounts(context.Context) ([]SectorCount, error) {
	return f.sectors, f.err
}

func (f *fakeRepository) CityCounts(context.Context) ([]CityCount, error) { return f.cities, f.err }

type envelope struct {
	Success bool            `json:"success"`
	Data    json.RawMessage `json:"data"`
	Error   *struct {
		Code    string `json:"code"`
		Message string `json:"message"`
	} `json:"error"`
	Meta *struct {
		Total  int `json:"total"`
		Offset int `json:"offset"`
		Limit  int `json:"limit"`
	} `json:"meta"`
}

func serve(t *testing.T, repo Repository, target string) (int, envelope) {
	t.Helper()
	gin.SetMode(gin.TestMode)
	router := gin.New()
	NewHandler(repo).Register(router.Group("/v1"))

	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, target, nil))

	var body envelope
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode %s: %v (body %q)", target, err, rec.Body.String())
	}
	return rec.Code, body
}

func TestSearchPassesFiltersAndReturnsPageMeta(t *testing.T) {
	repo := &fakeRepository{page: Page{Items: []Company{{Slug: "a", Name: "A"}}, Total: 31}}

	status, body := serve(t, repo, "/v1/companies?q=h%C3%B4tel+spa&sector=sante&city=+Thi%C3%A8s+&offset=12&limit=24")

	if status != http.StatusOK || !body.Success {
		t.Fatalf("status %d, body %+v", status, body)
	}
	wantFilters := Filters{Query: "hôtel spa", Sector: "sante", City: "Thiès"}
	if repo.gotFilters != wantFilters {
		t.Errorf("filters = %+v, want %+v", repo.gotFilters, wantFilters)
	}
	if repo.gotPage != (PageRequest{Offset: 12, Limit: 24}) {
		t.Errorf("page = %+v", repo.gotPage)
	}
	if body.Meta == nil || body.Meta.Total != 31 || body.Meta.Offset != 12 || body.Meta.Limit != 24 {
		t.Errorf("meta = %+v", body.Meta)
	}
	var items []Company
	if err := json.Unmarshal(body.Data, &items); err != nil || len(items) != 1 || items[0].Slug != "a" {
		t.Errorf("data = %s", body.Data)
	}
}

func TestSearchDefaultsPagination(t *testing.T) {
	repo := &fakeRepository{page: Page{Items: []Company{}}}

	serve(t, repo, "/v1/companies")

	if repo.gotPage != (PageRequest{Offset: 0, Limit: DefaultPageLimit}) {
		t.Errorf("page = %+v, want offset 0 limit %d", repo.gotPage, DefaultPageLimit)
	}
}

func TestSearchRejectsInvalidParameters(t *testing.T) {
	targets := []string{
		"/v1/companies?limit=0",
		"/v1/companies?limit=101",
		"/v1/companies?limit=abc",
		"/v1/companies?offset=-1",
		"/v1/companies?offset=10001",
		"/v1/companies?sector=Sant%C3%A9",
	}
	for _, target := range targets {
		t.Run(target, func(t *testing.T) {
			status, body := serve(t, &fakeRepository{}, target)

			if status != http.StatusBadRequest || body.Success || body.Error == nil || body.Error.Code != "bad_request" {
				t.Fatalf("status %d, body %+v", status, body)
			}
		})
	}
}

func TestGetReturnsCompany(t *testing.T) {
	repo := &fakeRepository{company: Company{Slug: "auchan-sacre-coeur", Name: "Auchan"}}

	status, body := serve(t, repo, "/v1/companies/auchan-sacre-coeur")

	if status != http.StatusOK || repo.gotSlug != "auchan-sacre-coeur" {
		t.Fatalf("status %d, slug %q", status, repo.gotSlug)
	}
	var company Company
	if err := json.Unmarshal(body.Data, &company); err != nil || company.Name != "Auchan" {
		t.Errorf("data = %s", body.Data)
	}
}

func TestGetAnswers404ForUnknownOrInvalidSlugs(t *testing.T) {
	for _, target := range []string{"/v1/companies/unknown", "/v1/companies/Not_A_Slug"} {
		t.Run(target, func(t *testing.T) {
			status, body := serve(t, &fakeRepository{err: ErrNotFound}, target)

			if status != http.StatusNotFound || body.Error == nil || body.Error.Code != "not_found" {
				t.Fatalf("status %d, body %+v", status, body)
			}
		})
	}
}

func TestListEndpointsReturnData(t *testing.T) {
	repo := &fakeRepository{
		slugs:   []string{"a", "b"},
		sectors: []SectorCount{{Slug: "sante", Label: "Santé", Count: 3}},
		cities:  []CityCount{{City: "Dakar", Count: 9}},
	}
	tests := map[string]string{
		"/v1/company-slugs": `["a","b"]`,
		"/v1/sectors":       `[{"slug":"sante","label":"Santé","count":3}]`,
		"/v1/cities":        `[{"city":"Dakar","count":9}]`,
	}
	for target, want := range tests {
		t.Run(target, func(t *testing.T) {
			status, body := serve(t, repo, target)

			if status != http.StatusOK || string(body.Data) != want {
				t.Fatalf("status %d, data %s, want %s", status, body.Data, want)
			}
		})
	}
}

func TestRepositoryFailuresBecome500WithoutLeakingDetails(t *testing.T) {
	repo := &fakeRepository{err: errors.New("connection refused to 10.0.0.5")}
	targets := []string{"/v1/companies", "/v1/companies/a", "/v1/company-slugs", "/v1/sectors", "/v1/cities"}

	for _, target := range targets {
		t.Run(target, func(t *testing.T) {
			status, body := serve(t, repo, target)

			if status != http.StatusInternalServerError || body.Error == nil || body.Error.Code != "internal_error" {
				t.Fatalf("status %d, body %+v", status, body)
			}
			if strings.Contains(body.Error.Message, "10.0.0.5") {
				t.Errorf("message leaks the cause: %q", body.Error.Message)
			}
		})
	}
}
