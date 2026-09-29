package admin

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"slices"
	"strings"
	"testing"

	"github.com/badStephane/dieuliko/apps/api/internal/company"
)

func TestDeleteCompanyRemovesTheListingItsLettersAndItsLogo(t *testing.T) {
	resetDB(t)
	store := &memStore{objects: map[string][]byte{}}
	service := NewCompanyService(testPool, store, slog.New(slog.DiscardHandler))
	adminID := newUser(t, "admin", "Admin")
	candidateID := newUser(t, "candidate", "Awa")
	ctx := context.Background()
	listing, err := service.Create(ctx, adminID, validCompany())
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	if _, err := service.SetLogo(ctx, adminID, listing.Slug, pngLogo(t)); err != nil {
		t.Fatalf("logo: %v", err)
	}
	exec(t, `INSERT INTO cover_letters (user_id, company_id, content) SELECT $1, id, 'Madame, Monsieur' FROM companies WHERE slug = $2`, candidateID, listing.Slug)

	counted, err := service.Get(ctx, listing.Slug)
	if err != nil || counted.Letters != 1 || counted.Applications != 0 {
		t.Fatalf("counts = %d letters, %d applications (%v)", counted.Letters, counted.Applications, err)
	}

	err = service.Delete(ctx, adminID, listing.Slug, "  cabinet ndiaye & associés ")
	if err != nil {
		t.Fatalf("delete: %v", err)
	}

	if _, err := service.Get(ctx, listing.Slug); !errors.Is(err, company.ErrNotFound) {
		t.Errorf("get after delete: %v", err)
	}
	if len(store.objects) != 0 {
		t.Errorf("logo left behind: %d files", len(store.objects))
	}
	if actions, _ := audit(t, listing.Slug); actions[len(actions)-1] != "company.delete" {
		t.Errorf("audit = %v", actions)
	}
}

func TestDeleteCompanyIsRefusedWithAWrongNameOrApplications(t *testing.T) {
	resetDB(t)
	service := NewCompanyService(testPool, &memStore{objects: map[string][]byte{}}, slog.New(slog.DiscardHandler))
	adminID := newUser(t, "admin", "Admin")
	candidateID := newUser(t, "candidate", "Awa")
	ctx := context.Background()
	listing, err := service.Create(ctx, adminID, validCompany())
	if err != nil {
		t.Fatalf("create: %v", err)
	}

	var invalid *ValidationError
	if err := service.Delete(ctx, adminID, listing.Slug, "Autre"); !errors.As(err, &invalid) || invalid.Fields["confirmName"] == "" {
		t.Errorf("wrong name: %v", err)
	}
	if err := service.Delete(ctx, adminID, "inconnue", "x"); !errors.Is(err, company.ErrNotFound) {
		t.Errorf("unknown: %v", err)
	}

	exec(t, `INSERT INTO applications (user_id, company_id, status, withdrawn_at) SELECT $1, id, 'withdrawn', now() FROM companies WHERE slug = $2`, candidateID, listing.Slug)
	if err := service.Delete(ctx, adminID, listing.Slug, listing.Name); !errors.Is(err, ErrCompanyHasApplications) {
		t.Errorf("with applications: %v", err)
	}
	if _, err := service.Get(ctx, listing.Slug); err != nil {
		t.Errorf("listing gone after a refused deletion: %v", err)
	}
}

func TestDeleteCompanyIsRefusedWhileACompanyManagesIt(t *testing.T) {
	resetDB(t)
	service := NewCompanyService(testPool, &memStore{objects: map[string][]byte{}}, slog.New(slog.DiscardHandler))
	adminID := newUser(t, "admin", "Admin")
	ctx := context.Background()
	listing, err := service.Create(ctx, adminID, validCompany())
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	exec(t, `INSERT INTO company_claims (user_id, company_id, job_title, status, reviewed_at)
		SELECT $1, id, 'DRH', 'approved', now() FROM companies WHERE slug = $2`, newUser(t, "company", "Awa"), listing.Slug)

	if err := service.Delete(ctx, adminID, listing.Slug, listing.Name); !errors.Is(err, ErrCompanyIsClaimed) {
		t.Errorf("claimed listing: err = %v, want ErrCompanyIsClaimed", err)
	}
}

func TestAuditListsActionsNewestFirstWithLiveLabels(t *testing.T) {
	resetDB(t)
	companies := NewCompanyService(testPool, &memStore{objects: map[string][]byte{}}, slog.New(slog.DiscardHandler))
	adminID := newUser(t, "admin", "Admin")
	ctx := context.Background()
	listing, err := companies.Create(ctx, adminID, validCompany())
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	if _, err := companies.SetVerified(ctx, adminID, listing.Slug, true); err != nil {
		t.Fatalf("verify: %v", err)
	}
	service := NewAuditService(testPool)

	page, err := service.List(ctx, AuditFilters{TargetType: "company"}, 0, 10)
	if err != nil {
		t.Fatalf("list: %v", err)
	}

	if page.Total != 2 || len(page.Items) != 2 {
		t.Fatalf("page = %+v", page)
	}
	first := page.Items[0]
	if first.Action != "company.verify" || first.TargetLabel != listing.Name || !strings.HasPrefix(first.AdminName, "Admin") {
		t.Errorf("first = %+v", first)
	}
	if empty, _ := service.List(ctx, AuditFilters{TargetType: "user"}, 0, 10); empty.Total != 0 || empty.Items == nil {
		t.Errorf("users = %+v", empty)
	}
}

func TestDeletionAndAuditRoutes(t *testing.T) {
	companies := &fakeCompanies{}
	router := newRouter(Services{Companies: companies, Audit: fakeAudit{}})

	rec := send(router, http.MethodPost, "/v1/admin/companies/cabinet-ndiaye/deletion", adminToken, `{"confirmName":"Cabinet Ndiaye"}`)
	if rec.Code != http.StatusOK || companies.gotConfirm != "Cabinet Ndiaye" {
		t.Errorf("delete: status %d confirm %q", rec.Code, companies.gotConfirm)
	}

	blocked := &fakeCompanies{err: ErrCompanyHasApplications}
	rec = send(newRouter(Services{Companies: blocked}), http.MethodPost, "/v1/admin/companies/cabinet-ndiaye/deletion", adminToken, `{"confirmName":"x"}`)
	if rec.Code != http.StatusConflict || !strings.Contains(rec.Body.String(), CodeHasApplications) {
		t.Errorf("blocked: status %d body %s", rec.Code, rec.Body.String())
	}

	rec = send(router, http.MethodGet, "/v1/admin/audit?type=company&limit=5", adminToken, "")
	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), `"company.hide"`) {
		t.Errorf("audit: status %d body %s", rec.Code, rec.Body.String())
	}
	if rec := send(router, http.MethodGet, "/v1/admin/audit?type=robot", adminToken, ""); rec.Code != http.StatusBadRequest {
		t.Errorf("bad type: status %d", rec.Code)
	}
}

type fakeAudit struct{}

func (fakeAudit) List(_ context.Context, filters AuditFilters, _, _ int) (AuditPage, error) {
	items := []AuditEntry{{ID: 1, Action: "company.hide", TargetType: filters.TargetType, TargetID: "cabinet-ndiaye", ChangedFields: []string{}}}
	return AuditPage{Items: slices.Clip(items), Total: 1}, nil
}
