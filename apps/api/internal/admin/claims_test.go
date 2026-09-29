package admin

import (
	"context"
	"errors"
	"log/slog"
	"slices"
	"strings"
	"testing"

	"github.com/google/uuid"
)

type claimFixture struct {
	service *ClaimService
	mailer  *recordingMailer
	adminID uuid.UUID
}

func newClaimFixture(t *testing.T) claimFixture {
	t.Helper()
	resetDB(t)
	f := claimFixture{mailer: &recordingMailer{}}
	f.service = NewClaimService(testPool, f.mailer, slog.New(slog.DiscardHandler), ClaimLinks{
		Contact: "https://dieuliko.test/contact", Space: "https://dieuliko.test/espace-entreprise",
	})
	f.adminID = newUser(t, "admin", "Admin")
	return f
}

// openClaim records a pending request of a new company account on the listing.
func openClaim(t *testing.T, companyID uuid.UUID, firstName string) (uuid.UUID, uuid.UUID) {
	t.Helper()
	userID := newUser(t, "company", firstName)
	var id uuid.UUID
	err := testPool.QueryRow(context.Background(),
		`INSERT INTO company_claims (user_id, company_id, job_title) VALUES ($1, $2, 'DRH') RETURNING id`, userID, companyID).Scan(&id)
	if err != nil {
		t.Fatalf("open claim: %v", err)
	}
	return id, userID
}

func claimStatus(t *testing.T, id uuid.UUID) (status, reason string) {
	t.Helper()
	var decision *string
	if err := testPool.QueryRow(context.Background(), "SELECT status, decision_reason FROM company_claims WHERE id = $1", id).Scan(&status, &decision); err != nil {
		t.Fatalf("read claim: %v", err)
	}
	if decision != nil {
		reason = *decision
	}
	return status, reason
}

func recipients(m *recordingMailer) []string {
	m.mu.Lock()
	defer m.mu.Unlock()
	to := make([]string, 0, len(m.sent))
	for _, msg := range m.sent {
		to = append(to, msg.To)
	}
	return to
}

func TestApproveMakesTheRequesterManagerAndVerifiesTheListing(t *testing.T) {
	f := newClaimFixture(t)
	companyID := seedCompany(t, "sonatel", "Sonatel")
	exec(t, "UPDATE companies SET email = 'contact@sonatel.sn' WHERE id = $1", companyID)
	claimID, userID := openClaim(t, companyID, "Awa")

	detail, err := f.service.Approve(context.Background(), f.adminID, claimID)

	if err != nil || detail.Status != "approved" {
		t.Fatalf("Approve = %+v, %v", detail, err)
	}
	var verified, curated bool
	if err := testPool.QueryRow(context.Background(), "SELECT verified, curated_at IS NOT NULL FROM companies WHERE id = $1", companyID).Scan(&verified, &curated); err != nil || !verified || !curated {
		t.Errorf("listing verified %v, curated %v, err %v", verified, curated, err)
	}
	if got := recipients(f.mailer); len(got) != 1 || got[0] != emailOf(t, userID) {
		t.Errorf("emails sent to %v, want the requester only (never the listing's address)", got)
	}
	if subjects := f.mailer.subjects(); !strings.Contains(subjects[0], "acceptée") {
		t.Errorf("subject = %q", subjects[0])
	}
	var action string
	if err := testPool.QueryRow(context.Background(), "SELECT action FROM admin_audit WHERE target_type = 'claim' AND target_id = $1", claimID.String()).Scan(&action); err != nil || action != "claim.approve" {
		t.Errorf("audit = %q, %v", action, err)
	}
}

func TestApproveRejectsTheOtherPendingRequestsOnTheListing(t *testing.T) {
	f := newClaimFixture(t)
	companyID := seedCompany(t, "sonatel", "Sonatel")
	chosen, _ := openClaim(t, companyID, "Awa")
	other, otherUser := openClaim(t, companyID, "Moussa")

	if _, err := f.service.Approve(context.Background(), f.adminID, chosen); err != nil {
		t.Fatalf("Approve: %v", err)
	}

	status, reason := claimStatus(t, other)
	if status != "rejected" || reason == "" {
		t.Errorf("other claim = %s (%q), want rejected with a reason", status, reason)
	}
	if got := recipients(f.mailer); len(got) != 2 || !slices.Contains(got, emailOf(t, otherUser)) {
		t.Errorf("emails sent to %v, want both requesters", got)
	}
}

func TestOnlyAPendingRequestCanBeApprovedOrRejected(t *testing.T) {
	f := newClaimFixture(t)
	claimID, _ := openClaim(t, seedCompany(t, "sonatel", "Sonatel"), "Awa")
	if _, err := f.service.Reject(context.Background(), f.adminID, claimID, "Fonction non vérifiable."); err != nil {
		t.Fatalf("Reject: %v", err)
	}

	_, approveErr := f.service.Approve(context.Background(), f.adminID, claimID)
	_, rejectErr := f.service.Reject(context.Background(), f.adminID, claimID, "Encore.")

	if !errors.Is(approveErr, ErrClaimNotPending) || !errors.Is(rejectErr, ErrClaimNotPending) {
		t.Errorf("approve err = %v, reject err = %v; want ErrClaimNotPending", approveErr, rejectErr)
	}
	if _, err := f.service.Approve(context.Background(), f.adminID, uuid.New()); !errors.Is(err, ErrClaimNotFound) {
		t.Errorf("unknown claim: err = %v, want ErrClaimNotFound", err)
	}
}

func TestApproveIsRefusedWhenTheListingAlreadyHasAManager(t *testing.T) {
	f := newClaimFixture(t)
	companyID := seedCompany(t, "sonatel", "Sonatel")
	late, _ := openClaim(t, companyID, "Moussa")
	manager := newUser(t, "company", "Awa")
	exec(t, `INSERT INTO company_claims (user_id, company_id, job_title, status, reviewed_at) VALUES ($1, $2, 'DG', 'approved', now())`, manager, companyID)

	_, err := f.service.Approve(context.Background(), f.adminID, late)

	if !errors.Is(err, ErrListingManaged) {
		t.Errorf("err = %v, want ErrListingManaged", err)
	}
}

func TestRejectNeedsAReasonAndTellsTheRequesterWhy(t *testing.T) {
	f := newClaimFixture(t)
	claimID, userID := openClaim(t, seedCompany(t, "sonatel", "Sonatel"), "Awa")

	_, err := f.service.Reject(context.Background(), f.adminID, claimID, "  ")
	var validation *ValidationError
	if !errors.As(err, &validation) || validation.Fields["reason"] == "" {
		t.Fatalf("empty reason: err = %v, want a reason error", err)
	}

	if _, err := f.service.Reject(context.Background(), f.adminID, claimID, "Nous n’avons pas pu vérifier votre fonction."); err != nil {
		t.Fatalf("Reject: %v", err)
	}
	status, reason := claimStatus(t, claimID)
	if status != "rejected" || reason != "Nous n’avons pas pu vérifier votre fonction." {
		t.Errorf("claim = %s (%q)", status, reason)
	}
	f.mailer.mu.Lock()
	defer f.mailer.mu.Unlock()
	if len(f.mailer.sent) != 1 || f.mailer.sent[0].To != emailOf(t, userID) || !strings.Contains(f.mailer.sent[0].Text, "pas pu vérifier votre fonction") {
		t.Errorf("sent = %+v", f.mailer.sent)
	}
}

func TestRevokeEndsAnApprovedClaimOnly(t *testing.T) {
	f := newClaimFixture(t)
	claimID, _ := openClaim(t, seedCompany(t, "sonatel", "Sonatel"), "Awa")

	if _, err := f.service.Revoke(context.Background(), f.adminID, claimID, "Départ de l’entreprise."); !errors.Is(err, ErrClaimNotApproved) {
		t.Errorf("revoking a pending claim: err = %v, want ErrClaimNotApproved", err)
	}
	if _, err := f.service.Approve(context.Background(), f.adminID, claimID); err != nil {
		t.Fatalf("Approve: %v", err)
	}

	detail, err := f.service.Revoke(context.Background(), f.adminID, claimID, "Départ de l’entreprise.")

	if err != nil || detail.Status != "revoked" {
		t.Errorf("Revoke = %+v, %v", detail, err)
	}
}

func TestListShowsTheQueueOldestFirst(t *testing.T) {
	f := newClaimFixture(t)
	first, _ := openClaim(t, seedCompany(t, "sonatel", "Sonatel"), "Awa")
	second, _ := openClaim(t, seedCompany(t, "wave", "Wave"), "Moussa")
	exec(t, "UPDATE company_claims SET created_at = now() - interval '1 day' WHERE id = $1", first)

	page, err := f.service.List(context.Background(), "pending", 0, 20)

	if err != nil || page.Total != 2 || len(page.Items) != 2 || page.Items[0].ID != first || page.Items[1].ID != second {
		t.Fatalf("page = %+v, %v", page, err)
	}
	if page.Items[0].Company.Name != "Sonatel" || page.Items[0].Requester.FirstName != "Awa" {
		t.Errorf("first item = %+v", page.Items[0])
	}
}

func TestGetShowsTheRequestTheListingAndTheOtherRequests(t *testing.T) {
	f := newClaimFixture(t)
	companyID := seedCompany(t, "sonatel", "Sonatel")
	exec(t, "UPDATE companies SET website = 'https://www.sonatel.sn' WHERE id = $1", companyID)
	claimID, userID := openClaim(t, companyID, "Awa")
	exec(t, "UPDATE users SET email = 'awa@sonatel.sn' WHERE id = $1", userID)
	openClaim(t, companyID, "Moussa")

	detail, err := f.service.Get(context.Background(), claimID)

	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if !detail.EmailDomainMatches || detail.Company.Website != "https://www.sonatel.sn" || len(detail.OtherClaims) != 1 {
		t.Errorf("detail = %+v", detail)
	}
}

func TestTheAuditNamesTheListingOfAClaim(t *testing.T) {
	f := newClaimFixture(t)
	claimID, _ := openClaim(t, seedCompany(t, "sonatel", "Sonatel"), "Awa")
	if _, err := f.service.Approve(context.Background(), f.adminID, claimID); err != nil {
		t.Fatalf("Approve: %v", err)
	}

	page, err := NewAuditService(testPool).List(context.Background(), AuditFilters{TargetType: "claim"}, 0, 10)

	if err != nil || len(page.Items) != 1 || page.Items[0].TargetLabel != "Sonatel" {
		t.Errorf("audit = %+v, %v", page, err)
	}
}

func TestEmailDomainMatchesTheWebsite(t *testing.T) {
	tests := []struct {
		email, website string
		want           bool
	}{
		{"awa@sonatel.sn", "https://www.sonatel.sn", true},
		{"awa@rh.sonatel.sn", "https://sonatel.sn/fr", true},
		{"awa@gmail.com", "https://www.sonatel.sn", false},
		{"awa@notsonatel.sn", "https://sonatel.sn", false},
		{"awa@sonatel.sn", "", false},
	}
	for _, tt := range tests {
		if got := emailDomainMatches(tt.email, tt.website); got != tt.want {
			t.Errorf("emailDomainMatches(%q, %q) = %v, want %v", tt.email, tt.website, got, tt.want)
		}
	}
}
