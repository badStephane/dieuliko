package candidate

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"os"
	"reflect"
	"strings"
	"testing"
	"time"

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

func requireDB(t *testing.T) {
	t.Helper()
	if testPool == nil {
		t.Skip("integration test: needs Docker (run without -short)")
	}
}

// newCandidate inserts a user to attach a profile or a CV to.
func newCandidate(t *testing.T) uuid.UUID {
	t.Helper()
	row, err := dbgen.New(testPool).CreateUser(context.Background(), dbgen.CreateUserParams{
		Email:        uuid.NewString() + "@example.sn",
		PasswordHash: "$argon2id$v=19$m=65536,t=1,p=4$c2FsdA$aGFzaA",
		Role:         "candidate",
		FirstName:    "Awa",
		LastName:     "Diop",
	})
	if err != nil {
		t.Fatalf("create user: %v", err)
	}
	return row.ID
}

func newProfileService() *ProfileService {
	service := NewProfileService(testPool)
	service.now = func() time.Time { return validationNow }
	return service
}

func TestGetProfileOfANewCandidateIsEmpty(t *testing.T) {
	requireDB(t)
	userID := newCandidate(t)

	got, err := newProfileService().Get(context.Background(), userID)

	if err != nil {
		t.Fatalf("get: %v", err)
	}
	if !reflect.DeepEqual(got, emptyProfile()) {
		t.Errorf("got %+v, want the empty profile", got)
	}
}

func TestSaveProfileRoundTrips(t *testing.T) {
	requireDB(t)
	ctx := context.Background()
	service := newProfileService()
	userID := newCandidate(t)
	input := validInput()
	input.DesiredSectors = []string{"informatique", "finance-comptabilite"}
	input.Experiences = append(input.Experiences, Experience{
		Title: "Stagiaire", Organization: "Sonatel", StartMonth: "2026-03",
	})

	saved, err := service.Save(ctx, userID, input)
	if err != nil {
		t.Fatalf("save: %v", err)
	}
	got, err := service.Get(ctx, userID)
	if err != nil {
		t.Fatalf("get: %v", err)
	}

	if got.UpdatedAt == nil || !got.UpdatedAt.Equal(*saved.UpdatedAt) {
		t.Errorf("updatedAt = %v, want %v", got.UpdatedAt, saved.UpdatedAt)
	}
	if got.Phone != "+221771234567" {
		t.Errorf("phone = %q, want it normalized", got.Phone)
	}
	if !reflect.DeepEqual(got.ProfileInput, saved.ProfileInput) {
		t.Errorf("read back\n%+v\nwant\n%+v", got.ProfileInput, saved.ProfileInput)
	}
	if got.Experiences[1].EndMonth != nil {
		t.Errorf("ongoing experience has end month %q", *got.Experiences[1].EndMonth)
	}
}

func TestSaveProfileReplacesEveryList(t *testing.T) {
	requireDB(t)
	ctx := context.Background()
	service := newProfileService()
	userID := newCandidate(t)
	if _, err := service.Save(ctx, userID, validInput()); err != nil {
		t.Fatalf("first save: %v", err)
	}

	_, err := service.Save(ctx, userID, ProfileInput{Headline: "Développeuse web"})
	if err != nil {
		t.Fatalf("second save: %v", err)
	}
	got, err := service.Get(ctx, userID)
	if err != nil {
		t.Fatalf("get: %v", err)
	}

	if got.Headline != "Développeuse web" || got.Phone != "" {
		t.Errorf("fields not replaced: %+v", got)
	}
	if len(got.DesiredSectors)+len(got.Skills)+len(got.Languages)+len(got.Experiences)+len(got.Educations) != 0 {
		t.Errorf("lists not emptied: %+v", got)
	}
}

func TestSaveProfileRejectsUnknownSectorsWithoutSavingAnything(t *testing.T) {
	requireDB(t)
	ctx := context.Background()
	service := newProfileService()
	userID := newCandidate(t)
	input := validInput()
	input.DesiredSectors = []string{"informatique", "astronautique"}

	_, err := service.Save(ctx, userID, input)

	var validation *ValidationError
	if !errors.As(err, &validation) || validation.Fields["desiredSectors"] == "" {
		t.Fatalf("err = %v, want a validation error on desiredSectors", err)
	}
	got, err := service.Get(ctx, userID)
	if err != nil || got.UpdatedAt != nil {
		t.Errorf("profile was saved: %+v, %v", got, err)
	}
}

func TestSaveProfileValidatesBeforeWriting(t *testing.T) {
	requireDB(t)
	ctx := context.Background()
	service := newProfileService()
	userID := newCandidate(t)
	input := validInput()
	input.Phone = "12"

	_, err := service.Save(ctx, userID, input)

	var validation *ValidationError
	if !errors.As(err, &validation) || validation.Fields["phone"] == "" {
		t.Fatalf("err = %v, want a validation error on phone", err)
	}
}

func TestDatabaseRejectsSkillsLongerThanTheLimit(t *testing.T) {
	requireDB(t)
	userID := newCandidate(t)
	// Straight to SQL, bypassing validateProfile: the CHECK constraint is the last line of defense.
	_, err := dbgen.New(testPool).UpsertProfile(context.Background(), dbgen.UpsertProfileParams{
		UserID: userID, Skills: []string{"Excel", strings.Repeat("s", MaxSkillLength+1)},
	})

	if err == nil {
		t.Fatalf("a %d-character skill was stored", MaxSkillLength+1)
	}
}
