package assistant

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"os"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/badStephane/dieuliko/apps/api/internal/ai"
	"github.com/badStephane/dieuliko/apps/api/internal/candidate"
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

const companySlug = "cabinet-ndiaye-dakar"

func requireDB(t *testing.T) {
	t.Helper()
	if testPool == nil {
		t.Skip("integration test: needs Docker (run without -short)")
	}
}

// seedCompany inserts the test company once (the directory is read-only elsewhere).
func seedCompany(t *testing.T) {
	t.Helper()
	_, err := testPool.Exec(context.Background(), `
		INSERT INTO companies (slug, name, sector, company_type, city, source)
		VALUES ($1, 'Cabinet Ndiaye & Associés', 'finance-comptabilite', 'Cabinet d''expertise comptable', 'Dakar', 'test')
		ON CONFLICT (slug) DO NOTHING`, companySlug)
	if err != nil {
		t.Fatalf("seed company: %v", err)
	}
}

func newAuthor(t *testing.T) Author {
	t.Helper()
	row, err := dbgen.New(testPool).CreateUser(context.Background(), dbgen.CreateUserParams{
		Email: uuid.NewString() + "@example.sn", PasswordHash: "$argon2id$v=19$m=65536,t=1,p=4$c2FsdA$aGFzaA",
		Role: "candidate", FirstName: "Awa", LastName: "Diop",
	})
	if err != nil {
		t.Fatalf("create user: %v", err)
	}
	return Author{ID: row.ID, FirstName: "Awa", LastName: "Diop"}
}

func newLetterService(writer ai.Writer, profile candidate.Profile) *LetterService {
	return NewLetterService(testPool, writer, fakeProfiles{profile: profile}, company.NewPostgresRepository(dbgen.New(testPool)))
}

const draft = "Madame, Monsieur,\n\nJe souhaite rejoindre votre cabinet.\n\nAwa Diop"

func TestGenerateDraftsAndSavesALetterForTheCompany(t *testing.T) {
	requireDB(t)
	seedCompany(t)
	ctx := context.Background()
	writer := &fakeWriter{answer: draft}
	service := newLetterService(writer, filledProfile)
	author := newAuthor(t)

	letter, err := service.Generate(ctx, author, companySlug)
	if err != nil {
		t.Fatalf("generate: %v", err)
	}

	if letter.Content != draft || letter.CompanyName != "Cabinet Ndiaye & Associés" || letter.CompanyCity != "Dakar" {
		t.Errorf("letter = %+v", letter)
	}
	prompt := allText(writer.got)
	for _, want := range []string{
		"Cabinet Ndiaye & Associés", "Finance & comptabilité", "Cabinet d'expertise comptable", "Awa Diop", "Assistante comptable", "Madame, Monsieur",
		// Guards seen missing in a real draft: no invented tasks, no flattering claims about the company.
		"missions", "réputation",
	} {
		if !strings.Contains(prompt, want) {
			t.Errorf("prompt does not mention %q", want)
		}
	}
	// Letters reason more carefully (the rules against invented facts were not always kept at "low"); reasoning
	// tokens count in the completion budget, which must leave room for a full letter.
	if writer.got.ReasoningEffort != ai.ReasoningMedium || writer.got.MaxTokens < 2000 {
		t.Errorf("reasoning %q with %d tokens, want medium with room for the letter", writer.got.ReasoningEffort, writer.got.MaxTokens)
	}
	saved, err := service.Get(ctx, author.ID, companySlug)
	if err != nil || saved.Content != draft {
		t.Errorf("saved letter = %+v, %v", saved, err)
	}
}

func TestGenerateRefusesWithoutCallingTheModel(t *testing.T) {
	requireDB(t)
	seedCompany(t)
	tests := []struct {
		name    string
		slug    string
		profile candidate.Profile
		check   func(error) bool
	}{
		{"unknown company", "entreprise-inconnue", filledProfile, func(err error) bool { return errors.Is(err, company.ErrNotFound) }},
		{"empty profile", companySlug, candidate.Profile{}, func(err error) bool {
			var validation *ValidationError
			return errors.As(err, &validation) && validation.Fields["profile"] != ""
		}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			writer := &fakeWriter{answer: draft}

			_, err := newLetterService(writer, tt.profile).Generate(context.Background(), newAuthor(t), tt.slug)

			if !tt.check(err) || writer.calls != 0 {
				t.Errorf("err = %v, calls = %d", err, writer.calls)
			}
		})
	}
}

func TestGenerateSavesNothingWhenTheModelFails(t *testing.T) {
	requireDB(t)
	seedCompany(t)
	ctx := context.Background()
	service := newLetterService(&fakeWriter{err: ai.ErrBusy}, filledProfile)
	author := newAuthor(t)

	_, err := service.Generate(ctx, author, companySlug)

	if !errors.Is(err, ai.ErrBusy) {
		t.Fatalf("err = %v, want ErrBusy", err)
	}
	if _, err := service.Get(ctx, author.ID, companySlug); !errors.Is(err, ErrNoLetter) {
		t.Errorf("get after failure: err = %v, want ErrNoLetter", err)
	}
}

func TestSaveReplacesTheLetterContent(t *testing.T) {
	requireDB(t)
	seedCompany(t)
	ctx := context.Background()
	service := newLetterService(&fakeWriter{answer: draft}, filledProfile)
	author := newAuthor(t)
	if _, err := service.Generate(ctx, author, companySlug); err != nil {
		t.Fatalf("generate: %v", err)
	}

	saved, err := service.Save(ctx, author.ID, companySlug, "  Madame, Monsieur,\r\n\r\nMa lettre relue.  ")

	if err != nil || saved.Content != "Madame, Monsieur,\n\nMa lettre relue." {
		t.Fatalf("saved = %+v, %v", saved, err)
	}
	letters, err := service.List(ctx, author.ID)
	if err != nil || len(letters) != 1 || letters[0].Content != saved.Content {
		t.Errorf("list = %+v, %v", letters, err)
	}
}

func TestSaveValidatesTheContent(t *testing.T) {
	requireDB(t)
	seedCompany(t)
	tests := map[string]string{
		"empty":    "   ",
		"too long": strings.Repeat("a", MaxLetterLength+1),
		"control":  "Madame\x00",
	}
	for name, content := range tests {
		t.Run(name, func(t *testing.T) {
			_, err := newLetterService(&fakeWriter{}, filledProfile).Save(context.Background(), newAuthor(t).ID, companySlug, content)

			var validation *ValidationError
			if !errors.As(err, &validation) || validation.Fields["content"] == "" {
				t.Errorf("err = %v, want a validation error on content", err)
			}
		})
	}
}

func TestLettersArePrivateAndDeletable(t *testing.T) {
	requireDB(t)
	seedCompany(t)
	ctx := context.Background()
	service := newLetterService(&fakeWriter{answer: draft}, filledProfile)
	owner, other := newAuthor(t), newAuthor(t)
	if _, err := service.Generate(ctx, owner, companySlug); err != nil {
		t.Fatalf("generate: %v", err)
	}

	if _, err := service.Get(ctx, other.ID, companySlug); !errors.Is(err, ErrNoLetter) {
		t.Errorf("another candidate reads the letter: err = %v", err)
	}
	if letters, _ := service.List(ctx, other.ID); len(letters) != 0 {
		t.Errorf("another candidate lists %d letters", len(letters))
	}
	if err := service.Delete(ctx, owner.ID, companySlug); err != nil {
		t.Fatalf("delete: %v", err)
	}
	if _, err := service.Get(ctx, owner.ID, companySlug); !errors.Is(err, ErrNoLetter) {
		t.Errorf("get after delete: err = %v", err)
	}
	if err := service.Delete(ctx, owner.ID, companySlug); err != nil {
		t.Errorf("deleting twice: %v", err)
	}
}

func TestListIsEmptyNotNil(t *testing.T) {
	requireDB(t)

	letters, err := newLetterService(&fakeWriter{}, filledProfile).List(context.Background(), newAuthor(t).ID)

	if err != nil || letters == nil || len(letters) != 0 {
		t.Errorf("letters = %#v, %v", letters, err)
	}
}

func TestAHiddenCompanyTakesNoNewLetterButKeepsTheSavedOnes(t *testing.T) {
	requireDB(t)
	seedCompany(t)
	ctx := context.Background()
	service := newLetterService(&fakeWriter{answer: draft}, filledProfile)
	author := newAuthor(t)
	if _, err := service.Save(ctx, author.ID, companySlug, draft); err != nil {
		t.Fatalf("save: %v", err)
	}
	if _, err := testPool.Exec(ctx, "UPDATE companies SET hidden_at = now() WHERE slug = $1", companySlug); err != nil {
		t.Fatalf("hide: %v", err)
	}
	t.Cleanup(func() {
		_, _ = testPool.Exec(context.Background(), "UPDATE companies SET hidden_at = NULL WHERE slug = $1", companySlug)
	})

	if _, err := service.Save(ctx, newAuthor(t).ID, companySlug, draft); !errors.Is(err, company.ErrNotFound) {
		t.Errorf("save for a hidden company = %v, want company.ErrNotFound", err)
	}
	if letter, err := service.Get(ctx, author.ID, companySlug); err != nil || letter.Content != draft {
		t.Errorf("saved letter = %+v, %v; want it still readable", letter, err)
	}
}
