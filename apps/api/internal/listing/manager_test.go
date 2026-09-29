package listing

import (
	"bytes"
	"context"
	"errors"
	"flag"
	"fmt"
	"image"
	"image/png"
	"io"
	"log/slog"
	"os"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

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

// memStore keeps logo files in memory.
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

func (m *memStore) count() int {
	m.mu.Lock()
	defer m.mu.Unlock()
	return len(m.objects)
}

type fixture struct {
	manager *Manager
	store   *memStore
	member  Member
}

// newFixture seeds a listing managed by a new company account.
func newFixture(t *testing.T) fixture {
	t.Helper()
	if testPool == nil {
		t.Skip("integration test: needs Docker (run without -short)")
	}
	ctx := context.Background()
	user, err := dbgen.New(testPool).CreateUser(ctx, dbgen.CreateUserParams{
		Email: uuid.NewString() + "@sonatel.sn", PasswordHash: "$argon2id$v=19$m=65536,t=1,p=4$c2FsdA$aGFzaA",
		Role: "company", FirstName: "Awa", LastName: "Diop",
	})
	if err != nil {
		t.Fatalf("create user: %v", err)
	}
	slug := "entreprise-" + uuid.NewString()[:8]
	var companyID uuid.UUID
	err = testPool.QueryRow(ctx, `
		INSERT INTO companies (slug, name, sector, city, source, description) VALUES ($1, 'Sonatel', 'telecoms-energie', 'Dakar', 'test', 'Opérateur')
		RETURNING id`, slug).Scan(&companyID)
	if err != nil {
		t.Fatalf("seed company: %v", err)
	}
	if _, err := testPool.Exec(ctx, `INSERT INTO company_claims (user_id, company_id, job_title, status, reviewed_at) VALUES ($1, $2, 'DRH', 'approved', now())`, user.ID, companyID); err != nil {
		t.Fatalf("approve: %v", err)
	}
	store := &memStore{objects: map[string][]byte{}}
	return fixture{
		manager: NewManager(testPool, NewLogos(testPool, store, slog.New(slog.DiscardHandler))),
		store:   store,
		member:  Member{UserID: user.ID, CompanyID: companyID, Slug: slug},
	}
}

func activity(t *testing.T, companyID uuid.UUID) []string {
	t.Helper()
	rows, err := testPool.Query(context.Background(), "SELECT action || ':' || array_to_string(changed_fields, ',') FROM company_activity WHERE company_id = $1 ORDER BY id", companyID)
	if err != nil {
		t.Fatalf("read activity: %v", err)
	}
	defer rows.Close()
	var entries []string
	for rows.Next() {
		var entry string
		if err := rows.Scan(&entry); err != nil {
			t.Fatalf("scan: %v", err)
		}
		entries = append(entries, entry)
	}
	return entries
}

func TestUpdateChangesTheEditableFieldsOnlyAndRecordsThem(t *testing.T) {
	f := newFixture(t)
	ctx := context.Background()
	current, err := f.manager.Get(ctx, f.member.CompanyID)
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	input := UpdateInput{Input: current.Input, ExpectedUpdatedAt: current.UpdatedAt}
	input.Name, input.City, input.Sector = "Autre nom", "Thiès", "sante"
	input.Description, input.Website = "Premier opérateur du Sénégal.", "https://sonatel.sn"

	updated, err := f.manager.Update(ctx, f.member, input)

	if err != nil {
		t.Fatalf("Update: %v", err)
	}
	if updated.Name != "Sonatel" || updated.City != "Dakar" || updated.Sector != "telecoms-energie" {
		t.Errorf("locked fields changed: %+v", updated.Input)
	}
	if updated.Description != "Premier opérateur du Sénégal." || updated.Website != "https://sonatel.sn" {
		t.Errorf("editable fields not saved: %+v", updated.Input)
	}
	if got := activity(t, f.member.CompanyID); len(got) != 1 || got[0] != "listing.update:description,website" {
		t.Errorf("activity = %v", got)
	}
}

func TestUpdateRefusesAListingChangedSinceItWasRead(t *testing.T) {
	f := newFixture(t)
	current, _ := f.manager.Get(context.Background(), f.member.CompanyID)
	input := UpdateInput{Input: current.Input, ExpectedUpdatedAt: current.UpdatedAt.Add(-time.Minute)}
	input.Description = "Autre"

	_, err := f.manager.Update(context.Background(), f.member, input)

	if !errors.Is(err, ErrStale) {
		t.Errorf("err = %v, want ErrStale", err)
	}
}

func TestUpdateReportsInvalidFieldsAndRecordsNothingWithoutChange(t *testing.T) {
	f := newFixture(t)
	ctx := context.Background()
	current, _ := f.manager.Get(ctx, f.member.CompanyID)
	invalid := UpdateInput{Input: current.Input, ExpectedUpdatedAt: current.UpdatedAt}
	invalid.Website = "javascript:alert(1)"

	_, err := f.manager.Update(ctx, f.member, invalid)
	var validation *ValidationError
	if !errors.As(err, &validation) || validation.Fields["website"] == "" {
		t.Errorf("err = %v, want a website error", err)
	}

	if _, err := f.manager.Update(ctx, f.member, UpdateInput{Input: current.Input, ExpectedUpdatedAt: current.UpdatedAt}); err != nil {
		t.Fatalf("unchanged update: %v", err)
	}
	if got := activity(t, f.member.CompanyID); len(got) != 0 {
		t.Errorf("activity = %v, want none", got)
	}
}

func TestLogoChangesAreRecorded(t *testing.T) {
	f := newFixture(t)
	ctx := context.Background()
	var img bytes.Buffer
	if err := png.Encode(&img, image.NewRGBA(image.Rect(0, 0, 8, 8))); err != nil {
		t.Fatalf("encode: %v", err)
	}

	withLogo, err := f.manager.SetLogo(ctx, f.member, img.Bytes())
	if err != nil || withLogo.LogoVersion == nil || f.store.count() != 1 {
		t.Fatalf("SetLogo = %+v, %v (%d files)", withLogo, err, f.store.count())
	}
	withoutLogo, err := f.manager.RemoveLogo(ctx, f.member)
	if err != nil || withoutLogo.LogoVersion != nil || f.store.count() != 0 {
		t.Fatalf("RemoveLogo = %+v, %v (%d files)", withoutLogo, err, f.store.count())
	}

	if got := activity(t, f.member.CompanyID); len(got) != 2 || got[0] != "listing.logo_set:" || got[1] != "listing.logo_remove:" {
		t.Errorf("activity = %v", got)
	}
}
