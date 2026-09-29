package claim

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"os"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/badStephane/dieuliko/apps/api/internal/company"
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

func requireDB(t *testing.T) {
	t.Helper()
	if testPool == nil {
		t.Skip("integration test: needs Docker (run without -short)")
	}
}

// seedCompany inserts a listing under a fresh slug and returns the slug and id.
func seedCompany(t *testing.T, hidden bool) (string, uuid.UUID) {
	t.Helper()
	slug := "entreprise-" + uuid.NewString()[:8]
	var id uuid.UUID
	err := testPool.QueryRow(context.Background(), `
		INSERT INTO companies (slug, name, sector, city, source, hidden_at)
		VALUES ($1, 'Sonatel', 'telecoms-energie', 'Dakar', 'test', CASE WHEN $2 THEN now() END)
		RETURNING id`, slug, hidden).Scan(&id)
	if err != nil {
		t.Fatalf("seed company: %v", err)
	}
	return slug, id
}

func newRequester(t *testing.T) Requester {
	t.Helper()
	row, err := dbgen.New(testPool).CreateUser(context.Background(), dbgen.CreateUserParams{
		Email: uuid.NewString() + "@sonatel.sn", PasswordHash: "$argon2id$v=19$m=65536,t=1,p=4$c2FsdA$aGFzaA",
		Role: "company", FirstName: "Awa", LastName: "Diop",
	})
	if err != nil {
		t.Fatalf("create user: %v", err)
	}
	return Requester{ID: row.ID, EmailVerified: true}
}

func validRequest(slug string) RequestInput {
	return RequestInput{CompanySlug: slug, JobTitle: " Responsable RH ", Phone: "77 123 45 67", Message: "Je gère les recrutements."}
}

func TestRequestOpensAPendingClaimOnTheListing(t *testing.T) {
	requireDB(t)
	slug, _ := seedCompany(t, false)
	requester := newRequester(t)
	service := NewService(testPool)

	created, err := service.Request(context.Background(), requester, validRequest(slug))

	if err != nil {
		t.Fatalf("Request: %v", err)
	}
	if created.Status != StatusPending || created.JobTitle != "Responsable RH" || created.Phone != "+221771234567" || created.Company.Slug != slug {
		t.Errorf("claim = %+v", created)
	}
	current, err := service.Current(context.Background(), requester.ID)
	if err != nil || current == nil || current.ID != created.ID {
		t.Errorf("Current = %+v, %v", current, err)
	}
}

func TestCurrentIsNilWithoutARequest(t *testing.T) {
	requireDB(t)

	current, err := NewService(testPool).Current(context.Background(), newRequester(t).ID)

	if err != nil || current != nil {
		t.Errorf("Current = %+v, %v; want nil", current, err)
	}
}

func TestRequestIsRefusedBeforeWritingAnything(t *testing.T) {
	requireDB(t)
	visible, _ := seedCompany(t, false)
	hidden, _ := seedCompany(t, true)
	unverified := newRequester(t)
	unverified.EmailVerified = false
	tests := []struct {
		name      string
		requester Requester
		slug      string
		want      error
	}{
		{"unverified email", unverified, visible, ErrEmailUnverified},
		{"unknown listing", newRequester(t), "entreprise-inconnue", company.ErrNotFound},
		{"hidden listing", newRequester(t), hidden, company.ErrNotFound},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			service := NewService(testPool)

			_, err := service.Request(context.Background(), tt.requester, validRequest(tt.slug))

			if !errors.Is(err, tt.want) {
				t.Errorf("err = %v, want %v", err, tt.want)
			}
			if current, _ := service.Current(context.Background(), tt.requester.ID); current != nil {
				t.Errorf("a claim was created: %+v", current)
			}
		})
	}
}

func TestAnAccountHasOneOpenRequestAtATime(t *testing.T) {
	requireDB(t)
	first, _ := seedCompany(t, false)
	second, _ := seedCompany(t, false)
	requester := newRequester(t)
	service := NewService(testPool)
	if _, err := service.Request(context.Background(), requester, validRequest(first)); err != nil {
		t.Fatalf("first request: %v", err)
	}

	_, err := service.Request(context.Background(), requester, validRequest(second))

	if !errors.Is(err, ErrClaimOpen) {
		t.Errorf("err = %v, want ErrClaimOpen", err)
	}
}

func TestAManagedListingCannotBeRequested(t *testing.T) {
	requireDB(t)
	slug, companyID := seedCompany(t, false)
	approve(t, newRequester(t).ID, companyID)

	_, err := NewService(testPool).Request(context.Background(), newRequester(t), validRequest(slug))

	if !errors.Is(err, ErrCompanyClaimed) {
		t.Errorf("err = %v, want ErrCompanyClaimed", err)
	}
}

func TestAListingHasOneManagerInTheDatabase(t *testing.T) {
	requireDB(t)
	_, companyID := seedCompany(t, false)
	approve(t, newRequester(t).ID, companyID)

	_, err := testPool.Exec(context.Background(), `
		INSERT INTO company_claims (user_id, company_id, job_title, status, reviewed_at) VALUES ($1, $2, 'DG', 'approved', now())`,
		newRequester(t).ID, companyID)

	if err == nil {
		t.Error("a second approved claim on the same listing was accepted")
	}
}

func TestCancelWithdrawsThePendingRequest(t *testing.T) {
	requireDB(t)
	first, _ := seedCompany(t, false)
	second, _ := seedCompany(t, false)
	requester := newRequester(t)
	service := NewService(testPool)
	if _, err := service.Request(context.Background(), requester, validRequest(first)); err != nil {
		t.Fatalf("request: %v", err)
	}

	if err := service.Cancel(context.Background(), requester.ID); err != nil {
		t.Fatalf("Cancel: %v", err)
	}

	current, _ := service.Current(context.Background(), requester.ID)
	if current == nil || current.Status != StatusCancelled {
		t.Errorf("current = %+v, want a cancelled claim", current)
	}
	if _, err := service.Request(context.Background(), requester, validRequest(second)); err != nil {
		t.Errorf("a new request after cancelling: %v", err)
	}
	if err := NewService(testPool).Cancel(context.Background(), newRequester(t).ID); !errors.Is(err, ErrNoPendingClaim) {
		t.Errorf("cancel without a request: err = %v, want ErrNoPendingClaim", err)
	}
}

// approve records an approved claim directly, as the back-office review will.
func approve(t *testing.T, userID, companyID uuid.UUID) {
	t.Helper()
	_, err := testPool.Exec(context.Background(), `
		INSERT INTO company_claims (user_id, company_id, job_title, status, reviewed_at) VALUES ($1, $2, 'DG', 'approved', now())`,
		userID, companyID)
	if err != nil {
		t.Fatalf("approve: %v", err)
	}
}
