package admin

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"slices"
	"strings"
	"sync"
	"testing"

	"github.com/google/uuid"

	"github.com/badStephane/dieuliko/apps/api/internal/mail"
	"github.com/badStephane/dieuliko/apps/api/internal/storage"
)

// memStore is an in-memory storage.Store.
type memStore struct {
	mu      sync.Mutex
	objects map[string][]byte
}

func (m *memStore) Put(_ context.Context, key string, body io.Reader, _ int64, _ string) error {
	content, err := io.ReadAll(body)
	if err != nil {
		return err
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	m.objects[key] = content
	return nil
}

func (m *memStore) Get(_ context.Context, key string) (io.ReadCloser, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	content, ok := m.objects[key]
	if !ok {
		return nil, storage.ErrNotFound
	}
	return io.NopCloser(bytes.NewReader(content)), nil
}

func (m *memStore) Delete(_ context.Context, key string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.objects, key)
	return nil
}

// recordingMailer keeps every message it is asked to send.
type recordingMailer struct {
	mu   sync.Mutex
	sent []mail.Message
}

func (m *recordingMailer) Send(_ context.Context, msg mail.Message) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.sent = append(m.sent, msg)
	return nil
}

func (m *recordingMailer) subjects() []string {
	m.mu.Lock()
	defer m.mu.Unlock()
	subjects := make([]string, 0, len(m.sent))
	for _, msg := range m.sent {
		subjects = append(subjects, msg.Subject)
	}
	return subjects
}

type accountFixture struct {
	service *AccountService
	store   *memStore
	mailer  *recordingMailer
	adminID uuid.UUID
}

func newAccountFixture(t *testing.T) accountFixture {
	t.Helper()
	resetDB(t)
	f := accountFixture{store: &memStore{objects: map[string][]byte{}}, mailer: &recordingMailer{}}
	f.service = NewAccountService(testPool, f.store, f.mailer, slog.New(slog.DiscardHandler), "https://dieuliko.test/contact")
	f.adminID = newUser(t, "admin", "Admin")
	return f
}

func emailOf(t *testing.T, id uuid.UUID) string {
	t.Helper()
	var email string
	if err := testPool.QueryRow(context.Background(), "SELECT email::text FROM users WHERE id = $1", id).Scan(&email); err != nil {
		t.Fatalf("read email: %v", err)
	}
	return email
}

func TestSearchCandidatesByWordsAndStatus(t *testing.T) {
	f := newAccountFixture(t)
	ctx := context.Background()
	awa := newUser(t, "candidate", "Awa")
	moussa := newUser(t, "candidate", "Moussa")
	exec(t, "UPDATE users SET suspended_at = now() WHERE id = $1", moussa)

	all, err := f.service.Search(ctx, CandidateFilters{}, 0, 20)
	if err != nil || all.Total != 2 {
		t.Fatalf("all = %+v, %v; want the 2 candidates and not the admin", all, err)
	}
	byName, _ := f.service.Search(ctx, CandidateFilters{Query: "awa"}, 0, 20)
	if byName.Total != 1 || byName.Items[0].ID != awa {
		t.Errorf("by name = %+v", byName)
	}
	suspended, _ := f.service.Search(ctx, CandidateFilters{Status: CandidateSuspended}, 0, 20)
	if suspended.Total != 1 || suspended.Items[0].ID != moussa || suspended.Items[0].SuspendedAt == nil {
		t.Errorf("suspended = %+v", suspended)
	}
}

func TestSearchCandidatesByJourneyStepAndName(t *testing.T) {
	f := newAccountFixture(t)
	ctx := context.Background()
	awa := newUser(t, "candidate", "Awa")
	moussa := newUser(t, "candidate", "Moussa")
	exec(t, "UPDATE users SET email_verified_at = now(), last_name = 'Ba', created_at = now() - interval '1 day' WHERE id = $1", awa)
	exec(t, "INSERT INTO candidate_profiles (user_id, headline) VALUES ($1, 'Comptable')", awa)
	exec(t, "INSERT INTO candidate_cvs (user_id, object_key, file_name, size_bytes) VALUES ($1, 'cvs/awa.pdf', 'cv.pdf', 10)", awa)
	sendApplication(t, awa, seedCompany(t, "cabinet-ndiaye", "Cabinet Ndiaye"))

	ids := func(filters CandidateFilters) []uuid.UUID {
		t.Helper()
		page, err := f.service.Search(ctx, filters, 0, 20)
		if err != nil {
			t.Fatalf("search %+v: %v", filters, err)
		}
		found := []uuid.UUID{}
		for _, item := range page.Items {
			found = append(found, item.ID)
		}
		return found
	}

	for progress, want := range map[string]uuid.UUID{ProgressUnverified: moussa, ProgressNoProfile: moussa, ProgressNoCV: moussa, ProgressApplied: awa} {
		if got := ids(CandidateFilters{Progress: progress, Sort: SortNewest}); len(got) != 1 || got[0] != want {
			t.Errorf("%s: %v, want only %s", progress, got, want)
		}
	}
	if got := ids(CandidateFilters{Sort: SortNewest}); got[0] != moussa {
		t.Errorf("newest first: %v", got)
	}
	if got := ids(CandidateFilters{Sort: SortName}); got[0] != awa {
		t.Errorf("by name (Ba before Diop): %v", got)
	}
	page, _ := f.service.Search(ctx, CandidateFilters{Progress: ProgressApplied}, 0, 20)
	if item := page.Items[0]; !item.HasProfile || !item.HasCV || item.ApplicationsSent != 1 || !item.EmailVerified {
		t.Errorf("facts = %+v", item)
	}
}

func TestCandidateDetailCountsWithoutRevealingContent(t *testing.T) {
	f := newAccountFixture(t)
	awa := newUser(t, "candidate", "Awa")
	exec(t, "INSERT INTO candidate_profiles (user_id, headline) VALUES ($1, 'Comptable')", awa)
	exec(t, "INSERT INTO candidate_cvs (user_id, object_key, file_name, size_bytes) VALUES ($1, 'cvs/awa.pdf', 'cv.pdf', 10)", awa)
	company := seedCompany(t, "cabinet-ndiaye", "Cabinet Ndiaye")
	exec(t, "INSERT INTO cover_letters (user_id, company_id, content) VALUES ($1, $2, 'Lettre secrète')", awa, company)
	sendApplication(t, awa, company)

	detail, err := f.service.Get(context.Background(), awa)
	if err != nil {
		t.Fatalf("get: %v", err)
	}

	if !detail.HasProfile || !detail.HasCV || detail.Letters != 1 || detail.ApplicationsSent != 1 || detail.FirstName != "Awa" {
		t.Errorf("detail = %+v", detail)
	}
	encoded, _ := json.Marshal(detail)
	for _, secret := range []string{"Comptable", "Lettre secrète", "cv.pdf", "cvs/awa.pdf"} {
		if strings.Contains(string(encoded), secret) {
			t.Errorf("detail reveals %q: %s", secret, encoded)
		}
	}
	if _, err := f.service.Get(context.Background(), f.adminID); !errors.Is(err, ErrCandidateNotFound) {
		t.Errorf("get an admin = %v, want ErrCandidateNotFound", err)
	}
}

func TestSuspendRevokesSessionsAndTellsTheCandidateOnce(t *testing.T) {
	f := newAccountFixture(t)
	ctx := context.Background()
	awa := newUser(t, "candidate", "Awa")
	exec(t, "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, now() + interval '1 day')", bytes.Repeat([]byte{1}, 32), awa)

	suspended, err := f.service.SetSuspended(ctx, f.adminID, awa, true)
	if err != nil || suspended.SuspendedAt == nil {
		t.Fatalf("suspend = %+v, %v", suspended, err)
	}
	if _, err := f.service.SetSuspended(ctx, f.adminID, awa, true); err != nil {
		t.Fatalf("suspend again: %v", err)
	}
	var sessions int
	if err := testPool.QueryRow(ctx, "SELECT count(*) FROM sessions WHERE user_id = $1", awa).Scan(&sessions); err != nil || sessions != 0 {
		t.Errorf("sessions = %d, %v; want them revoked", sessions, err)
	}
	restored, err := f.service.SetSuspended(ctx, f.adminID, awa, false)
	if err != nil || restored.SuspendedAt != nil {
		t.Errorf("unsuspend = %+v, %v", restored, err)
	}

	if subjects := f.mailer.subjects(); len(subjects) != 2 || !strings.Contains(subjects[0], "suspendu") || !strings.Contains(subjects[1], "réactivé") {
		t.Errorf("emails = %v, want one suspension and one reactivation", subjects)
	}
	if actions, _ := audit(t, awa.String()); !slices.Equal(actions, []string{"user.suspend", "user.unsuspend"}) {
		t.Errorf("audit = %v, want only the actual changes", actions)
	}
	if _, err := f.service.SetSuspended(ctx, f.adminID, f.adminID, true); !errors.Is(err, ErrCandidateNotFound) {
		t.Errorf("suspend an admin = %v, want ErrCandidateNotFound", err)
	}
}

func TestDeleteErasesTheAccountAndItsFiles(t *testing.T) {
	f := newAccountFixture(t)
	ctx := context.Background()
	awa := newUser(t, "candidate", "Awa")
	email := emailOf(t, awa)
	exec(t, "INSERT INTO candidate_cvs (user_id, object_key, file_name, size_bytes) VALUES ($1, 'cvs/awa.pdf', 'cv.pdf', 10)", awa)
	company := seedCompany(t, "cabinet-ndiaye", "Cabinet Ndiaye")
	sendApplication(t, awa, company)
	var copyKey string
	if err := testPool.QueryRow(ctx, "SELECT cv_object_key FROM applications WHERE user_id = $1", awa).Scan(&copyKey); err != nil {
		t.Fatalf("read copy key: %v", err)
	}
	f.store.objects["cvs/awa.pdf"], f.store.objects[copyKey], f.store.objects["cvs/autre.pdf"] = []byte("a"), []byte("b"), []byte("c")

	err := f.service.Delete(ctx, f.adminID, awa, "pas-le-bon@example.sn")
	var validation *ValidationError
	if !errors.As(err, &validation) || validation.Fields["confirmEmail"] == "" {
		t.Fatalf("delete with the wrong email = %v, want a confirmEmail error", err)
	}

	if err := f.service.Delete(ctx, f.adminID, awa, "  "+strings.ToUpper(email)+" "); err != nil {
		t.Fatalf("delete: %v", err)
	}

	if _, err := f.service.Get(ctx, awa); !errors.Is(err, ErrCandidateNotFound) {
		t.Errorf("get after delete = %v, want ErrCandidateNotFound", err)
	}
	if _, kept := f.store.objects["cvs/autre.pdf"]; !kept || len(f.store.objects) != 1 {
		t.Errorf("stored files = %v, want only another candidate's file left", f.store.objects)
	}
	if subjects := f.mailer.subjects(); len(subjects) != 1 || !strings.Contains(subjects[0], "supprimé") || f.mailer.sent[0].To != email {
		t.Errorf("emails = %v, want one deletion notice to %s", subjects, email)
	}
	if actions, _ := audit(t, awa.String()); !slices.Equal(actions, []string{"user.delete"}) {
		t.Errorf("audit = %v", actions)
	}
}
