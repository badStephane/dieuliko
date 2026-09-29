package admin

import (
	"context"
	"flag"
	"fmt"
	"os"
	"testing"

	"github.com/google/uuid"
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

// resetDB empties the tables the back-office reads, so each test counts only what it seeds.
func resetDB(t *testing.T) {
	t.Helper()
	if testPool == nil {
		t.Skip("integration test: needs Docker (run without -short)")
	}
	if _, err := testPool.Exec(context.Background(), "TRUNCATE users, companies, admin_audit CASCADE"); err != nil {
		t.Fatalf("truncate: %v", err)
	}
}

func exec(t *testing.T, sql string, args ...any) {
	t.Helper()
	if _, err := testPool.Exec(context.Background(), sql, args...); err != nil {
		t.Fatalf("%s: %v", sql, err)
	}
}

func newUser(t *testing.T, role, firstName string) uuid.UUID {
	t.Helper()
	row, err := dbgen.New(testPool).CreateUser(context.Background(), dbgen.CreateUserParams{
		Email: uuid.NewString() + "@example.sn", PasswordHash: "$argon2id$v=19$m=65536,t=1,p=4$c2FsdA$aGFzaA",
		Role: role, FirstName: firstName, LastName: "Diop",
	})
	if err != nil {
		t.Fatalf("create user: %v", err)
	}
	return row.ID
}

func seedCompany(t *testing.T, slug, name string) uuid.UUID {
	t.Helper()
	var id uuid.UUID
	err := testPool.QueryRow(context.Background(), `
		INSERT INTO companies (slug, name, sector, city, source) VALUES ($1, $2, 'finance-comptabilite', 'Dakar', 'test')
		RETURNING id`, slug, name).Scan(&id)
	if err != nil {
		t.Fatalf("seed company: %v", err)
	}
	return id
}

// sendApplication inserts a sent application with a minimal snapshot.
func sendApplication(t *testing.T, userID, companyID uuid.UUID) {
	t.Helper()
	exec(t, `INSERT INTO applications (user_id, company_id, first_name, last_name, email, profile, letter, cv_object_key, cv_file_name, cv_size_bytes)
		VALUES ($1, $2, 'Awa', 'Diop', 'awa@example.sn', '{}', 'Madame, Monsieur,', $3, 'cv.pdf', 10)`,
		userID, companyID, "applications/"+uuid.NewString()+".pdf")
}

func TestStatsCountsCandidatesTheirWorkAndCompanies(t *testing.T) {
	resetDB(t)
	ctx := context.Background()
	awa := newUser(t, "candidate", "Awa")
	moussa := newUser(t, "candidate", "Moussa")
	newUser(t, "admin", "Admin") // admins are not candidates
	exec(t, "UPDATE users SET email_verified_at = now() WHERE id = $1", awa)
	exec(t, "UPDATE users SET suspended_at = now(), created_at = now() - interval '40 days' WHERE id = $1", moussa)
	exec(t, "INSERT INTO candidate_profiles (user_id, headline) VALUES ($1, 'Comptable'), ($2, '')", awa, moussa)
	exec(t, "INSERT INTO candidate_cvs (user_id, object_key, file_name, size_bytes) VALUES ($1, 'cvs/a.pdf', 'cv.pdf', 10)", awa)
	ndiaye := seedCompany(t, "cabinet-ndiaye", "Cabinet Ndiaye")
	sall := seedCompany(t, "sall-btp", "Sall BTP")
	seedCompany(t, "masquee", "Masquée")
	exec(t, "UPDATE companies SET hidden_at = now() WHERE slug = 'masquee'")
	exec(t, "UPDATE companies SET verified = true WHERE slug = 'sall-btp'")
	exec(t, "INSERT INTO cover_letters (user_id, company_id, content) VALUES ($1, $2, 'Lettre'), ($1, $3, 'Lettre')", awa, ndiaye, sall)
	sendApplication(t, awa, ndiaye)
	sendApplication(t, moussa, ndiaye)
	sendApplication(t, awa, sall)
	// A company account asking for a listing: counted in the claims queue, never as a candidate.
	exec(t, "INSERT INTO company_claims (user_id, company_id, job_title) VALUES ($1, $2, 'DRH')", newUser(t, "company", "Rh"), sall)
	exec(t, `UPDATE applications SET status = 'withdrawn', withdrawn_at = now(), first_name = NULL, last_name = NULL, email = NULL,
		profile = NULL, letter = NULL, cv_object_key = NULL, cv_file_name = NULL, cv_size_bytes = NULL WHERE user_id = $1`, moussa)

	stats, err := NewStatsService(testPool).Get(ctx)
	if err != nil {
		t.Fatalf("stats: %v", err)
	}

	wantCandidates := CandidateStats{Total: 2, Last7Days: 1, Last30Days: 1, VerifiedEmails: 1, Suspended: 1, WithProfile: 1, WithCV: 1}
	if stats.Candidates != wantCandidates {
		t.Errorf("candidates = %+v, want %+v", stats.Candidates, wantCandidates)
	}
	if stats.Letters != 2 || stats.Applications != (ApplicationStats{Sent: 2, Withdrawn: 1}) {
		t.Errorf("letters = %d, applications = %+v", stats.Letters, stats.Applications)
	}
	if stats.Companies != (CompanyStats{Visible: 2, Hidden: 1, Verified: 1, PendingClaims: 1}) {
		t.Errorf("companies = %+v", stats.Companies)
	}
	want := []TopCompany{{Slug: "cabinet-ndiaye", Name: "Cabinet Ndiaye", City: "Dakar", Applications: 2}, {Slug: "sall-btp", Name: "Sall BTP", City: "Dakar", Applications: 1}}
	if len(stats.TopCompanies) != 2 || stats.TopCompanies[0] != want[0] || stats.TopCompanies[1] != want[1] {
		t.Errorf("top companies = %+v, want %+v", stats.TopCompanies, want)
	}
}

func TestStatsGiveTrendsQualityGapsDailyActivityAndRecentEvents(t *testing.T) {
	resetDB(t)
	ctx := context.Background()
	awa := newUser(t, "candidate", "Awa")
	old := newUser(t, "candidate", "Old")
	exec(t, "UPDATE users SET created_at = now() - interval '10 days' WHERE id = $1", old)
	bare := seedCompany(t, "atelier-sow", "Atelier Sow")
	full := seedCompany(t, "cabinet-ndiaye", "Cabinet Ndiaye")
	exec(t, `UPDATE companies SET description = 'Audit', email = 'contact@ndiaye.sn', verified = true,
		logo_key = 'logos/0b0b0b0b-0b0b-0b0b-0b0b-0b0b0b0b0b0b.png' WHERE id = $1`, full)
	sendApplication(t, awa, bare)
	sendApplication(t, old, full)
	exec(t, "UPDATE applications SET created_at = now() - interval '9 days' WHERE user_id = $1", old)
	exec(t, "INSERT INTO cover_letters (user_id, company_id, content) VALUES ($1, $2, 'Lettre')", awa, bare)

	stats, err := NewStatsService(testPool).Get(ctx)
	if err != nil {
		t.Fatalf("stats: %v", err)
	}

	wantTrends := Trends{
		Signups:      Trend{Last7Days: 1, Previous7Days: 1},
		Applications: Trend{Last7Days: 1, Previous7Days: 1},
		Letters:      Trend{Last7Days: 1, Previous7Days: 0},
	}
	if stats.Trends != wantTrends {
		t.Errorf("trends = %+v, want %+v", stats.Trends, wantTrends)
	}
	if stats.Quality != (QualityStats{NoLogo: 1, NoDescription: 1, NoContact: 1, Unverified: 1}) {
		t.Errorf("quality = %+v", stats.Quality)
	}
	if len(stats.Daily) != 30 {
		t.Fatalf("daily has %d days, want 30", len(stats.Daily))
	}
	today := stats.Daily[29]
	if today.Signups != 1 || today.Applications != 1 || stats.Daily[0].Day >= today.Day {
		t.Errorf("daily = first %+v, today %+v", stats.Daily[0], today)
	}
	if len(stats.RecentCandidates) != 2 || stats.RecentCandidates[0].FirstName != "Awa" {
		t.Errorf("recent candidates = %+v", stats.RecentCandidates)
	}
	if len(stats.RecentApplications) != 2 || stats.RecentApplications[0].Slug != "atelier-sow" {
		t.Errorf("recent applications = %+v", stats.RecentApplications)
	}
}
