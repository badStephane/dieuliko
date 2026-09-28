package application

import (
	"bytes"
	"context"
	"errors"
	"flag"
	"fmt"
	"io"
	"log/slog"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/badStephane/dieuliko/apps/api/internal/assistant"
	"github.com/badStephane/dieuliko/apps/api/internal/candidate"
	"github.com/badStephane/dieuliko/apps/api/internal/company"
	"github.com/badStephane/dieuliko/apps/api/internal/database/dbgen"
	"github.com/badStephane/dieuliko/apps/api/internal/storage"
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

const companySlug = "cabinet-ndiaye"

// seedCompany inserts a test company once (the directory is read-only elsewhere).
func seedCompany(t *testing.T, slug string) {
	t.Helper()
	_, err := testPool.Exec(context.Background(), `
		INSERT INTO companies (slug, name, sector, city, source)
		VALUES ($1, 'Cabinet Ndiaye & Associés', 'finance-comptabilite', 'Dakar', 'test')
		ON CONFLICT (slug) DO NOTHING`, slug)
	if err != nil {
		t.Fatalf("seed company: %v", err)
	}
}

func newApplicant(t *testing.T) Applicant {
	t.Helper()
	email := uuid.NewString() + "@example.sn"
	row, err := dbgen.New(testPool).CreateUser(context.Background(), dbgen.CreateUserParams{
		Email: email, PasswordHash: "$argon2id$v=19$m=65536,t=1,p=4$c2FsdA$aGFzaA",
		Role: "candidate", FirstName: "Awa", LastName: "Diop",
	})
	if err != nil {
		t.Fatalf("create user: %v", err)
	}
	return Applicant{ID: row.ID, FirstName: "Awa", LastName: "Diop", Email: email, EmailVerified: true}
}

var filledProfile = candidate.Profile{ProfileInput: candidate.ProfileInput{
	Headline: "Comptable junior",
	City:     "Dakar",
	Skills:   []string{"Excel", "Sage"},
}}

const (
	letterText = "Madame, Monsieur,\n\nJe souhaite rejoindre votre cabinet.\n\nAwa Diop"
	cvContent  = "%PDF-1.7 mon cv"
)

type fakeProfiles struct{ profile candidate.Profile }

func (f *fakeProfiles) Get(context.Context, uuid.UUID) (candidate.Profile, error) {
	return f.profile, nil
}

type fakeCVs struct {
	content string // empty: no CV
}

func (f *fakeCVs) Open(context.Context, uuid.UUID) (candidate.CV, io.ReadCloser, error) {
	if f.content == "" {
		return candidate.CV{}, nil, candidate.ErrNoCV
	}
	cv := candidate.CV{FileName: "cv-awa.pdf", SizeBytes: len(f.content), UploadedAt: time.Now()}
	return cv, io.NopCloser(strings.NewReader(f.content)), nil
}

type fakeLetters struct{ content string } // empty: no letter

func (f *fakeLetters) Get(_ context.Context, _ uuid.UUID, slug string) (assistant.Letter, error) {
	if f.content == "" {
		return assistant.Letter{}, assistant.ErrNoLetter
	}
	return assistant.Letter{CompanySlug: slug, Content: f.content}, nil
}

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

func (m *memStore) keys() []string {
	m.mu.Lock()
	defer m.mu.Unlock()
	keys := make([]string, 0, len(m.objects))
	for key := range m.objects {
		keys = append(keys, key)
	}
	return keys
}

type fixture struct {
	service  *Service
	store    *memStore
	profiles *fakeProfiles
	cvs      *fakeCVs
	letters  *fakeLetters
}

// newFixture builds a service whose candidate has everything an application needs.
func newFixture() fixture {
	f := fixture{
		store:    &memStore{objects: map[string][]byte{}},
		profiles: &fakeProfiles{profile: filledProfile},
		cvs:      &fakeCVs{content: cvContent},
		letters:  &fakeLetters{content: letterText},
	}
	f.service = NewService(testPool, f.store, f.profiles, f.cvs, f.letters, slog.New(slog.DiscardHandler))
	return f
}

func TestApplyKeepsAFrozenSnapshotOfWhatWasSent(t *testing.T) {
	requireDB(t)
	seedCompany(t, companySlug)
	ctx := context.Background()
	f := newFixture()
	applicant := newApplicant(t)

	sent, err := f.service.Apply(ctx, applicant, companySlug)
	if err != nil {
		t.Fatalf("apply: %v", err)
	}
	// The candidate edits everything afterwards: the application must not change.
	f.profiles.profile = candidate.Profile{ProfileInput: candidate.ProfileInput{Headline: "Autre titre"}}
	f.letters.content = "Une autre lettre."
	f.cvs.content = "%PDF-1.7 un autre cv"

	got, err := f.service.Get(ctx, applicant.ID, sent.ID)
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	if got.Status != StatusSent || got.CompanySlug != companySlug || got.CompanyName != "Cabinet Ndiaye & Associés" || got.WithdrawnAt != nil {
		t.Errorf("application = %+v", got.Application)
	}
	snapshot := got.Snapshot
	if snapshot == nil {
		t.Fatal("snapshot is missing")
	}
	if snapshot.FirstName != "Awa" || snapshot.Email != applicant.Email || snapshot.Letter != letterText ||
		snapshot.Profile.Headline != "Comptable junior" || snapshot.CVFileName != "cv-awa.pdf" || snapshot.CVSizeBytes != len(cvContent) {
		t.Errorf("snapshot = %+v", snapshot)
	}
	keys := f.store.keys()
	if len(keys) != 1 || !strings.HasPrefix(keys[0], "applications/"+applicant.ID.String()+"/") {
		t.Fatalf("stored files = %v, want one CV copy", keys)
	}
	if copied := string(f.store.objects[keys[0]]); copied != cvContent {
		t.Errorf("CV copy = %q, want the CV as sent", copied)
	}
}

func TestApplyNamesEveryMissingPiece(t *testing.T) {
	requireDB(t)
	seedCompany(t, companySlug)
	f := newFixture()
	f.profiles.profile = candidate.Profile{}
	f.cvs.content = ""
	f.letters.content = ""

	_, err := f.service.Apply(context.Background(), newApplicant(t), companySlug)

	var validation *ValidationError
	if !errors.As(err, &validation) {
		t.Fatalf("err = %v, want a validation error", err)
	}
	for _, field := range []string{"profile", "cv", "letter"} {
		if validation.Fields[field] == "" {
			t.Errorf("no message for %q in %v", field, validation.Fields)
		}
	}
	if keys := f.store.keys(); len(keys) != 0 {
		t.Errorf("stored files = %v, want none", keys)
	}
}

func TestApplyRefusesBeforeCopyingAnything(t *testing.T) {
	requireDB(t)
	seedCompany(t, companySlug)
	unverified := newApplicant(t)
	unverified.EmailVerified = false
	tests := []struct {
		name      string
		applicant Applicant
		slug      string
		want      error
	}{
		{"unverified email", unverified, companySlug, ErrEmailUnverified},
		{"unknown company", newApplicant(t), "entreprise-inconnue", company.ErrNotFound},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			f := newFixture()

			_, err := f.service.Apply(context.Background(), tt.applicant, tt.slug)

			if !errors.Is(err, tt.want) {
				t.Errorf("err = %v, want %v", err, tt.want)
			}
			if keys := f.store.keys(); len(keys) != 0 {
				t.Errorf("stored files = %v, want none", keys)
			}
		})
	}
}

func TestApplyTwiceToTheSameCompanyIsRefusedAndLeavesNoOrphanFile(t *testing.T) {
	requireDB(t)
	seedCompany(t, companySlug)
	ctx := context.Background()
	f := newFixture()
	applicant := newApplicant(t)
	if _, err := f.service.Apply(ctx, applicant, companySlug); err != nil {
		t.Fatalf("first apply: %v", err)
	}

	_, err := f.service.Apply(ctx, applicant, companySlug)

	if !errors.Is(err, ErrAlreadyApplied) {
		t.Fatalf("err = %v, want ErrAlreadyApplied", err)
	}
	if keys := f.store.keys(); len(keys) != 1 {
		t.Errorf("stored files = %v, want only the first copy", keys)
	}
}

func TestWithdrawErasesTheSnapshotAndAllowsApplyingAgain(t *testing.T) {
	requireDB(t)
	seedCompany(t, companySlug)
	ctx := context.Background()
	f := newFixture()
	applicant := newApplicant(t)
	sent, err := f.service.Apply(ctx, applicant, companySlug)
	if err != nil {
		t.Fatalf("apply: %v", err)
	}

	if err := f.service.Withdraw(ctx, applicant.ID, sent.ID); err != nil {
		t.Fatalf("withdraw: %v", err)
	}
	if err := f.service.Withdraw(ctx, applicant.ID, sent.ID); err != nil {
		t.Errorf("second withdraw: %v, want no error", err)
	}

	got, err := f.service.Get(ctx, applicant.ID, sent.ID)
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	if got.Status != StatusWithdrawn || got.WithdrawnAt == nil || got.Snapshot != nil {
		t.Errorf("withdrawn application = %+v, snapshot %+v", got.Application, got.Snapshot)
	}
	if keys := f.store.keys(); len(keys) != 0 {
		t.Errorf("stored files = %v, want the CV copy erased", keys)
	}
	if _, err := f.service.Apply(ctx, applicant, companySlug); err != nil {
		t.Errorf("apply again: %v", err)
	}
	list, err := f.service.List(ctx, applicant.ID)
	if err != nil || len(list) != 2 || list[0].Status != StatusSent || list[1].Status != StatusWithdrawn {
		t.Errorf("list = %+v, %v; want the new application first, then the withdrawn one", list, err)
	}
}

func TestApplyStopsAtTheDailyLimit(t *testing.T) {
	requireDB(t)
	ctx := context.Background()
	f := newFixture()
	applicant := newApplicant(t)
	for i := range MaxPerDay {
		slug := fmt.Sprintf("entreprise-limite-%d", i)
		seedCompany(t, slug)
		if _, err := f.service.Apply(ctx, applicant, slug); err != nil {
			t.Fatalf("apply %d: %v", i, err)
		}
	}
	seedCompany(t, "entreprise-limite-derniere")

	_, err := f.service.Apply(ctx, applicant, "entreprise-limite-derniere")

	if !errors.Is(err, ErrDailyLimit) {
		t.Fatalf("err = %v, want ErrDailyLimit", err)
	}
	if keys := f.store.keys(); len(keys) != MaxPerDay {
		t.Errorf("%d stored files, want %d (the refused copy removed)", len(keys), MaxPerDay)
	}
}

func TestAnotherCandidatesApplicationIsNotFound(t *testing.T) {
	requireDB(t)
	seedCompany(t, companySlug)
	ctx := context.Background()
	f := newFixture()
	sent, err := f.service.Apply(ctx, newApplicant(t), companySlug)
	if err != nil {
		t.Fatalf("apply: %v", err)
	}
	stranger := newApplicant(t)

	if _, err := f.service.Get(ctx, stranger.ID, sent.ID); !errors.Is(err, ErrNotFound) {
		t.Errorf("get = %v, want ErrNotFound", err)
	}
	if err := f.service.Withdraw(ctx, stranger.ID, sent.ID); !errors.Is(err, ErrNotFound) {
		t.Errorf("withdraw = %v, want ErrNotFound", err)
	}
	if keys := f.store.keys(); len(keys) != 1 {
		t.Errorf("stored files = %v, want the CV copy kept", keys)
	}
}

// fullProfile fills every list to its limit with accented text, the largest profile the candidate module accepts.
func fullProfile() candidate.Profile {
	text := func(n int) string { return strings.Repeat("é", n) }
	end := "2025-06"
	input := candidate.ProfileInput{
		Headline: text(candidate.MaxHeadlineLength), Summary: text(candidate.MaxSummaryLength), City: text(candidate.MaxCityLength),
	}
	for range candidate.MaxSkills {
		input.Skills = append(input.Skills, text(candidate.MaxSkillLength))
	}
	for range candidate.MaxExperiences {
		input.Experiences = append(input.Experiences, candidate.Experience{
			Title: text(candidate.MaxLabelLength), Organization: text(candidate.MaxLabelLength), City: text(candidate.MaxCityLength),
			StartMonth: "2024-01", EndMonth: &end, Description: text(candidate.MaxDescriptionLength),
		})
	}
	for range candidate.MaxEducations {
		input.Educations = append(input.Educations, candidate.Education{
			Degree: text(candidate.MaxLabelLength), School: text(candidate.MaxLabelLength), Field: text(candidate.MaxLabelLength),
			StartMonth: "2020-10", EndMonth: &end, Description: text(candidate.MaxDescriptionLength),
		})
	}
	return candidate.Profile{ProfileInput: input}
}

func TestApplyAcceptsTheLargestProfileTheCandidateCanSave(t *testing.T) {
	requireDB(t)
	seedCompany(t, companySlug)
	f := newFixture()
	f.profiles.profile = fullProfile()

	if _, err := f.service.Apply(context.Background(), newApplicant(t), companySlug); err != nil {
		t.Fatalf("apply with a full profile: %v", err)
	}
}

func TestAHiddenCompanyTakesNoNewApplicationButKeepsTheSentOnes(t *testing.T) {
	requireDB(t)
	ctx := context.Background()
	const slug = "entreprise-masquee"
	seedCompany(t, slug)
	f := newFixture()
	applicant := newApplicant(t)
	sent, err := f.service.Apply(ctx, applicant, slug)
	if err != nil {
		t.Fatalf("apply: %v", err)
	}
	if _, err := testPool.Exec(ctx, "UPDATE companies SET hidden_at = now() WHERE slug = $1", slug); err != nil {
		t.Fatalf("hide: %v", err)
	}

	if _, err := f.service.Apply(ctx, newApplicant(t), slug); !errors.Is(err, company.ErrNotFound) {
		t.Errorf("apply to a hidden company = %v, want company.ErrNotFound", err)
	}
	if got, err := f.service.Get(ctx, applicant.ID, sent.ID); err != nil || got.Snapshot == nil {
		t.Errorf("sent application = %+v, %v; want it still readable", got, err)
	}
}
