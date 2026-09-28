package assistant

import (
	"context"
	"errors"
	"strings"
	"testing"
	"unicode/utf8"

	"github.com/google/uuid"

	"github.com/badStephane/dieuliko/apps/api/internal/ai"
	"github.com/badStephane/dieuliko/apps/api/internal/candidate"
)

// fakeWriter records the request and answers with a canned text or error.
type fakeWriter struct {
	answer string
	err    error
	got    ai.Request
	calls  int
}

func (f *fakeWriter) Write(_ context.Context, req ai.Request) (string, error) {
	f.got, f.calls = req, f.calls+1
	return f.answer, f.err
}

type fakeProfiles struct {
	profile candidate.Profile
	err     error
}

func (f fakeProfiles) Get(context.Context, uuid.UUID) (candidate.Profile, error) {
	return f.profile, f.err
}

func ptr[T any](v T) *T { return &v }

var filledProfile = candidate.Profile{ProfileInput: candidate.ProfileInput{
	Headline: "Comptable junior",
	City:     "Dakar",
	Skills:   []string{"Excel", "Sage"},
	Experiences: []candidate.Experience{{
		Title: "Assistante comptable", Organization: "Cabinet Ndiaye", StartMonth: "2024-01", EndMonth: nil,
	}},
	Educations: []candidate.Education{{Degree: "Licence", School: "UCAD", Field: "Gestion", StartMonth: "2020-10", EndMonth: ptr("2023-07")}},
	Languages:  []candidate.Language{{Language: "Wolof", Level: candidate.LevelNative}},
}}

var userID = uuid.MustParse("00000000-0000-0000-0000-00000000000a")

func allText(req ai.Request) string {
	var b strings.Builder
	for _, m := range req.Messages {
		b.WriteString(m.Content)
	}
	return b.String()
}

func TestRewriteSummaryUsesTheProfileAsContext(t *testing.T) {
	writer := &fakeWriter{answer: "Comptable rigoureuse, je cherche un poste en cabinet."}
	service := NewService(writer, fakeProfiles{profile: filledProfile})

	got, err := service.Rewrite(context.Background(), userID, RewriteInput{Kind: KindSummary, Text: "je suis comptable"})

	if err != nil || got != writer.answer {
		t.Fatalf("got %q, %v", got, err)
	}
	prompt := allText(writer.got)
	for _, want := range []string{"je suis comptable", "Comptable junior", "Assistante comptable", "Cabinet Ndiaye", "Excel", "Licence", "Wolof"} {
		if !strings.Contains(prompt, want) {
			t.Errorf("prompt does not mention %q", want)
		}
	}
	if writer.got.Messages[0].Role != ai.RoleSystem || !strings.Contains(writer.got.Messages[0].Content, "invente") {
		t.Errorf("system message must forbid inventing facts: %q", writer.got.Messages[0].Content)
	}
}

func TestRewriteSummaryCanStartFromAnEmptyText(t *testing.T) {
	writer := &fakeWriter{answer: "Présentation rédigée."}

	_, err := NewService(writer, fakeProfiles{profile: filledProfile}).Rewrite(context.Background(), userID, RewriteInput{Kind: KindSummary})

	if err != nil || writer.calls != 1 {
		t.Errorf("err = %v, calls = %d", err, writer.calls)
	}
}

func TestRewriteSummaryNeedsSomethingToWorkFrom(t *testing.T) {
	writer := &fakeWriter{answer: "x"}

	_, err := NewService(writer, fakeProfiles{}).Rewrite(context.Background(), userID, RewriteInput{Kind: KindSummary})

	var validation *ValidationError
	if !errors.As(err, &validation) || validation.Fields["text"] == "" || writer.calls != 0 {
		t.Errorf("err = %v, calls = %d; want a validation error without calling the model", err, writer.calls)
	}
}

func TestRewriteExperienceDescribesTheGivenJob(t *testing.T) {
	writer := &fakeWriter{answer: "– Saisie des écritures comptables"}
	input := RewriteInput{Kind: KindExperience, Title: "Assistante comptable", Organization: "Cabinet Ndiaye", Text: "saisie compta"}

	_, err := NewService(writer, fakeProfiles{profile: filledProfile}).Rewrite(context.Background(), userID, input)

	if err != nil {
		t.Fatalf("rewrite: %v", err)
	}
	prompt := allText(writer.got)
	for _, want := range []string{"Assistante comptable", "Cabinet Ndiaye", "saisie compta"} {
		if !strings.Contains(prompt, want) {
			t.Errorf("prompt does not mention %q", want)
		}
	}
}

func TestRewriteRejectsInvalidInputBeforeCallingTheModel(t *testing.T) {
	tests := []struct {
		name  string
		input RewriteInput
		field string
	}{
		{"unknown kind", RewriteInput{Kind: "poem", Text: "x"}, "kind"},
		{"text too long", RewriteInput{Kind: KindSummary, Text: strings.Repeat("a", 2001)}, "text"},
		{"experience without title nor text", RewriteInput{Kind: KindExperience}, "text"},
		{"control characters", RewriteInput{Kind: KindSummary, Text: "a\x00b"}, "text"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			writer := &fakeWriter{answer: "x"}

			_, err := NewService(writer, fakeProfiles{profile: filledProfile}).Rewrite(context.Background(), userID, tt.input)

			var validation *ValidationError
			if !errors.As(err, &validation) || validation.Fields[tt.field] == "" || writer.calls != 0 {
				t.Errorf("err = %v, calls = %d", err, writer.calls)
			}
		})
	}
}

func TestRewritePassesProviderErrorsThrough(t *testing.T) {
	writer := &fakeWriter{err: ai.ErrBusy}

	_, err := NewService(writer, fakeProfiles{profile: filledProfile}).Rewrite(context.Background(), userID, RewriteInput{Kind: KindSummary, Text: "x"})

	if !errors.Is(err, ai.ErrBusy) {
		t.Errorf("err = %v, want ErrBusy", err)
	}
}

func TestCleanAnswer(t *testing.T) {
	tests := []struct {
		raw  string
		want string
	}{
		{"  « Comptable rigoureuse. »  ", "Comptable rigoureuse."},
		{`"Comptable rigoureuse."`, "Comptable rigoureuse."},
		{"**Comptable** rigoureuse.", "Comptable rigoureuse."},
		{"Ligne 1\r\n\r\n\r\nLigne 2", "Ligne 1\n\nLigne 2"},
	}
	for _, tt := range tests {
		if got := cleanAnswer(tt.raw, 2000); got != tt.want {
			t.Errorf("cleanAnswer(%q) = %q, want %q", tt.raw, got, tt.want)
		}
	}
}

func TestCleanAnswerCutsLongTextsAtASentenceEnd(t *testing.T) {
	raw := strings.Repeat("Une phrase complète. ", 20)

	got := cleanAnswer(raw, 100)

	if utf8.RuneCountInString(got) > 100 || !strings.HasSuffix(got, ".") {
		t.Errorf("got %d characters: %q", utf8.RuneCountInString(got), got)
	}
}
