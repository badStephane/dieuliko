package admin

import (
	"context"
	"errors"
	"log/slog"
	"slices"
	"testing"

	"github.com/google/uuid"

	"github.com/badStephane/dieuliko/apps/api/internal/company"
)

// audit returns the actions and changed fields recorded for a target, oldest first.
func audit(t *testing.T, targetID string) ([]string, [][]string) {
	t.Helper()
	rows, err := testPool.Query(context.Background(),
		"SELECT action, changed_fields FROM admin_audit WHERE target_id = $1 ORDER BY id", targetID)
	if err != nil {
		t.Fatalf("read audit: %v", err)
	}
	defer rows.Close()
	var actions []string
	var fields [][]string
	for rows.Next() {
		var action string
		var changed []string
		if err := rows.Scan(&action, &changed); err != nil {
			t.Fatalf("scan audit: %v", err)
		}
		actions, fields = append(actions, action), append(fields, changed)
	}
	return actions, fields
}

func newCompanyFixture(t *testing.T) (*CompanyService, uuid.UUID) {
	t.Helper()
	resetDB(t)
	return NewCompanyService(testPool, &memStore{objects: map[string][]byte{}}, slog.New(slog.DiscardHandler)), newUser(t, "admin", "Admin")
}

func TestCreateCompanyGeneratesAUniqueSlugAndIsAudited(t *testing.T) {
	service, adminID := newCompanyFixture(t)
	ctx := context.Background()

	first, err := service.Create(ctx, adminID, validCompany())
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	second, err := service.Create(ctx, adminID, validCompany())
	if err != nil {
		t.Fatalf("create again: %v", err)
	}

	if first.Slug != "cabinet-ndiaye-associes" || second.Slug != "cabinet-ndiaye-associes-2" {
		t.Errorf("slugs = %q, %q", first.Slug, second.Slug)
	}
	if first.Name != "Cabinet Ndiaye & Associés" || first.Source != "admin" || first.CuratedAt == nil || first.HiddenAt != nil {
		t.Errorf("created = %+v", first)
	}
	if actions, _ := audit(t, first.Slug); !slices.Equal(actions, []string{"company.create"}) {
		t.Errorf("audit = %v", actions)
	}
}

func TestCreateCompanyRejectsAnUnknownSector(t *testing.T) {
	service, adminID := newCompanyFixture(t)
	input := validCompany()
	input.Sector = "secteur-inconnu"

	_, err := service.Create(context.Background(), adminID, input)

	var validation *ValidationError
	if !errors.As(err, &validation) || validation.Fields["sector"] == "" {
		t.Fatalf("err = %v, want a sector error", err)
	}
}

func TestUpdateCompanyKeepsTheSlugAndRecordsTheChangedFields(t *testing.T) {
	service, adminID := newCompanyFixture(t)
	ctx := context.Background()
	created, err := service.Create(ctx, adminID, validCompany())
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	input := validCompany()
	input.Name = "Cabinet Ndiaye"
	input.Website = "https://cabinet-ndiaye.sn"

	updated, err := service.Update(ctx, adminID, created.Slug, input)
	if err != nil {
		t.Fatalf("update: %v", err)
	}

	if updated.Slug != created.Slug || updated.Name != "Cabinet Ndiaye" || updated.Website != "https://cabinet-ndiaye.sn" {
		t.Errorf("updated = %+v", updated)
	}
	actions, fields := audit(t, created.Slug)
	if !slices.Equal(actions, []string{"company.create", "company.update"}) || !slices.Equal(fields[1], []string{"name", "website"}) {
		t.Errorf("audit = %v %v", actions, fields)
	}
	if _, err := service.Update(ctx, adminID, "inconnue", input); !errors.Is(err, company.ErrNotFound) {
		t.Errorf("update unknown = %v, want company.ErrNotFound", err)
	}
}

func TestHideAndVerifyACompany(t *testing.T) {
	service, adminID := newCompanyFixture(t)
	ctx := context.Background()
	created, err := service.Create(ctx, adminID, validCompany())
	if err != nil {
		t.Fatalf("create: %v", err)
	}

	hidden, err := service.SetHidden(ctx, adminID, created.Slug, true)
	if err != nil || hidden.HiddenAt == nil {
		t.Fatalf("hide = %+v, %v", hidden, err)
	}
	page, err := service.Search(ctx, CompanyFilters{Status: StatusHidden}, 0, 20)
	if err != nil || page.Total != 1 || page.Items[0].Slug != created.Slug {
		t.Errorf("hidden search = %+v, %v", page, err)
	}
	if page, _ := service.Search(ctx, CompanyFilters{Status: StatusVisible}, 0, 20); page.Total != 0 {
		t.Errorf("visible search total = %d, want 0", page.Total)
	}
	shown, err := service.SetHidden(ctx, adminID, created.Slug, false)
	if err != nil || shown.HiddenAt != nil {
		t.Errorf("unhide = %+v, %v", shown, err)
	}
	verified, err := service.SetVerified(ctx, adminID, created.Slug, true)
	if err != nil || !verified.Verified {
		t.Errorf("verify = %+v, %v", verified, err)
	}

	actions, _ := audit(t, created.Slug)
	if !slices.Equal(actions, []string{"company.create", "company.hide", "company.unhide", "company.verify"}) {
		t.Errorf("audit = %v", actions)
	}
	if _, err := service.SetHidden(ctx, adminID, "inconnue", true); !errors.Is(err, company.ErrNotFound) {
		t.Errorf("hide unknown = %v, want company.ErrNotFound", err)
	}
}

func TestSearchCompaniesByWords(t *testing.T) {
	service, adminID := newCompanyFixture(t)
	ctx := context.Background()
	if _, err := service.Create(ctx, adminID, validCompany()); err != nil {
		t.Fatalf("create: %v", err)
	}
	if _, err := service.Create(ctx, adminID, CompanyInput{Name: "Sall BTP", Sector: "btp-ingenierie", City: "Thiès"}); err != nil {
		t.Fatalf("create: %v", err)
	}

	page, err := service.Search(ctx, CompanyFilters{Query: "ndiaye associes"}, 0, 20)

	if err != nil || page.Total != 1 || page.Items[0].Name != "Cabinet Ndiaye & Associés" {
		t.Errorf("search = %+v, %v", page, err)
	}
}
