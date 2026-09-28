package admin

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"github.com/badStephane/dieuliko/apps/api/internal/auth"
	"github.com/badStephane/dieuliko/apps/api/internal/company"
)

const (
	adminToken     = "admin-session"
	candidateToken = "candidate-session"
)

var adminID = uuid.MustParse("00000000-0000-0000-0000-0000000000ad")

// sessions authenticates one admin and one candidate token; other auth.Accounts methods are never called here.
type sessions struct{ auth.Accounts }

func (sessions) Authenticate(_ context.Context, token string) (auth.User, error) {
	switch token {
	case adminToken:
		return auth.User{ID: adminID, Role: auth.RoleAdmin, FirstName: "Admin", LastName: "Dieuliko"}, nil
	case candidateToken:
		return auth.User{ID: uuid.New(), Role: auth.RoleCandidate, FirstName: "Awa", LastName: "Diop"}, nil
	default:
		return auth.User{}, auth.ErrUnauthenticated
	}
}

type fakeStats struct{ stats Stats }

func (f fakeStats) Get(context.Context) (Stats, error) { return f.stats, nil }

// newRouter mounts the back-office with the given services; unset ones are never reached by the test.
func newRouter(services Services) *gin.Engine {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	NewHandler(services, NewLimiter(time.Minute)).Register(router.Group("/v1"), auth.RequireUser(sessions{}))
	return router
}

func send(router *gin.Engine, method, path, token, body string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	return rec
}

func TestTheBackOfficeIsForAdminsOnly(t *testing.T) {
	router := newRouter(Services{Stats: fakeStats{}})
	tests := []struct {
		name   string
		token  string
		status int
	}{
		{"no session", "", http.StatusUnauthorized},
		{"candidate", candidateToken, http.StatusForbidden},
		{"admin", adminToken, http.StatusOK},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if rec := send(router, http.MethodGet, "/v1/admin/stats", tt.token, ""); rec.Code != tt.status {
				t.Errorf("status = %d, want %d (body %s)", rec.Code, tt.status, rec.Body.String())
			}
		})
	}
}

func TestStatsAreServedToAdmins(t *testing.T) {
	router := newRouter(Services{Stats: fakeStats{stats: Stats{Letters: 7, TopCompanies: []TopCompany{}}}})

	rec := send(router, http.MethodGet, "/v1/admin/stats", adminToken, "")

	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), `"letters":7`) {
		t.Errorf("status %d body %s", rec.Code, rec.Body.String())
	}
}

// fakeCompanies records calls; err applies to every call.
type fakeCompanies struct {
	err        error
	gotAdmin   uuid.UUID
	gotSlug    string
	gotInput   CompanyInput
	gotFilters CompanyFilters
	gotPage    [2]int
	gotFlag    *bool
}

var testCompany = AdminCompany{CompanyInput: CompanyInput{Name: "Cabinet Ndiaye", Sector: "finance-comptabilite", City: "Dakar"}, Slug: "cabinet-ndiaye"}

func (f *fakeCompanies) Search(_ context.Context, filters CompanyFilters, offset, limit int) (CompanyPage, error) {
	f.gotFilters, f.gotPage = filters, [2]int{offset, limit}
	return CompanyPage{Items: []CompanySummary{{Slug: "cabinet-ndiaye"}}, Total: 1}, f.err
}

func (f *fakeCompanies) Get(_ context.Context, slug string) (AdminCompany, error) {
	f.gotSlug = slug
	return testCompany, f.err
}

func (f *fakeCompanies) Create(_ context.Context, adminID uuid.UUID, input CompanyInput) (AdminCompany, error) {
	f.gotAdmin, f.gotInput = adminID, input
	return testCompany, f.err
}

func (f *fakeCompanies) Update(_ context.Context, adminID uuid.UUID, slug string, input CompanyInput) (AdminCompany, error) {
	f.gotAdmin, f.gotSlug, f.gotInput = adminID, slug, input
	return testCompany, f.err
}

func (f *fakeCompanies) SetHidden(_ context.Context, adminID uuid.UUID, slug string, hidden bool) (AdminCompany, error) {
	f.gotAdmin, f.gotSlug, f.gotFlag = adminID, slug, &hidden
	return testCompany, f.err
}

func (f *fakeCompanies) SetVerified(_ context.Context, adminID uuid.UUID, slug string, verified bool) (AdminCompany, error) {
	f.gotAdmin, f.gotSlug, f.gotFlag = adminID, slug, &verified
	return testCompany, f.err
}

func TestListCompaniesReadsFiltersAndPage(t *testing.T) {
	companies := &fakeCompanies{}
	router := newRouter(Services{Companies: companies})

	rec := send(router, http.MethodGet, "/v1/admin/companies?q=ndiaye&status=hidden&offset=20&limit=10", adminToken, "")

	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), `"total":1`) {
		t.Fatalf("status %d body %s", rec.Code, rec.Body.String())
	}
	if companies.gotFilters != (CompanyFilters{Query: "ndiaye", Status: StatusHidden}) || companies.gotPage != [2]int{20, 10} {
		t.Errorf("filters %+v page %v", companies.gotFilters, companies.gotPage)
	}
	for _, query := range []string{"limit=500", "offset=-1", "status=perdue"} {
		if rec := send(router, http.MethodGet, "/v1/admin/companies?"+query, adminToken, ""); rec.Code != http.StatusBadRequest {
			t.Errorf("%s: status %d, want 400", query, rec.Code)
		}
	}
}

func TestCreateCompanyAsTheSignedInAdmin(t *testing.T) {
	companies := &fakeCompanies{}

	rec := send(newRouter(Services{Companies: companies}), http.MethodPost, "/v1/admin/companies", adminToken,
		`{"name":"Cabinet Ndiaye","sector":"finance-comptabilite","city":"Dakar"}`)

	if rec.Code != http.StatusCreated || companies.gotAdmin != adminID || companies.gotInput.Name != "Cabinet Ndiaye" {
		t.Errorf("status %d, admin %s, input %+v", rec.Code, companies.gotAdmin, companies.gotInput)
	}
}

func TestCompanyErrorsAreMapped(t *testing.T) {
	tests := []struct {
		name   string
		err    error
		status int
		code   string
	}{
		{"validation", &ValidationError{Fields: map[string]string{"name": "Ce champ est obligatoire."}}, http.StatusUnprocessableEntity, "validation_failed"},
		{"unknown", company.ErrNotFound, http.StatusNotFound, "not_found"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rec := send(newRouter(Services{Companies: &fakeCompanies{err: tt.err}}), http.MethodPut, "/v1/admin/companies/cabinet-ndiaye", adminToken, `{"name":"x"}`)

			if rec.Code != tt.status || !strings.Contains(rec.Body.String(), `"code":"`+tt.code+`"`) {
				t.Errorf("status %d body %s", rec.Code, rec.Body.String())
			}
		})
	}
}

func TestHideAndVerifyRoutes(t *testing.T) {
	companies := &fakeCompanies{}
	router := newRouter(Services{Companies: companies})

	if rec := send(router, http.MethodPut, "/v1/admin/companies/cabinet-ndiaye/visibility", adminToken, `{"hidden":true}`); rec.Code != http.StatusOK || companies.gotFlag == nil || !*companies.gotFlag {
		t.Errorf("hide: status %d flag %v", rec.Code, companies.gotFlag)
	}
	if rec := send(router, http.MethodPut, "/v1/admin/companies/cabinet-ndiaye/verification", adminToken, `{"verified":false}`); rec.Code != http.StatusOK || *companies.gotFlag {
		t.Errorf("unverify: status %d flag %v", rec.Code, *companies.gotFlag)
	}
	if rec := send(router, http.MethodPut, "/v1/admin/companies/cabinet-ndiaye/visibility", adminToken, `{}`); rec.Code != http.StatusUnprocessableEntity {
		t.Errorf("missing flag: status %d, want 422", rec.Code)
	}
}
