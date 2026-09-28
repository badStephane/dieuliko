package assistant

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/badStephane/dieuliko/apps/api/internal/ai"
	"github.com/badStephane/dieuliko/apps/api/internal/company"
	"github.com/badStephane/dieuliko/apps/api/internal/database/dbgen"
)

// MaxLetterLength mirrors the CHECK constraint of cover_letters.content.
const MaxLetterLength = 5000

const (
	letterMaxTokens   = 1200
	letterTemperature = 0.6
	// maxDescriptionInPrompt keeps a long directory description from crowding out the profile.
	maxDescriptionInPrompt = 600
)

// ErrNoLetter is returned when the candidate has no letter for the company.
var ErrNoLetter = errors.New("no cover letter for this company")

// Letter is a candidate's cover letter for one company.
type Letter struct {
	CompanySlug string    `json:"companySlug"`
	CompanyName string    `json:"companyName"`
	CompanyCity string    `json:"companyCity"`
	Content     string    `json:"content"`
	UpdatedAt   time.Time `json:"updatedAt"`
}

// Author is the candidate a letter is written for; their name signs it.
type Author struct {
	ID        uuid.UUID
	FirstName string
	LastName  string
}

// CompanyDirectory is what letters need from the company directory.
type CompanyDirectory interface {
	FindBySlug(ctx context.Context, slug string) (company.Company, error)
	SectorCounts(ctx context.Context) ([]company.SectorCount, error)
}

// LetterService drafts, stores and edits cover letters, one per candidate and company.
type LetterService struct {
	queries   *dbgen.Queries
	writer    ai.Writer
	profiles  ProfileReader
	companies CompanyDirectory
}

// NewLetterService builds the service; db is satisfied by *pgxpool.Pool.
func NewLetterService(db dbgen.DBTX, writer ai.Writer, profiles ProfileReader, companies CompanyDirectory) *LetterService {
	return &LetterService{queries: dbgen.New(db), writer: writer, profiles: profiles, companies: companies}
}

// List returns the candidate's letters, most recently edited first (never nil).
func (s *LetterService) List(ctx context.Context, userID uuid.UUID) ([]Letter, error) {
	rows, err := s.queries.ListLetters(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("list letters: %w", err)
	}
	letters := make([]Letter, 0, len(rows))
	for _, row := range rows {
		letters = append(letters, Letter{CompanySlug: row.Slug, CompanyName: row.Name, CompanyCity: row.City, Content: row.Content, UpdatedAt: row.UpdatedAt})
	}
	return letters, nil
}

// Get returns the candidate's letter for a company, or ErrNoLetter.
func (s *LetterService) Get(ctx context.Context, userID uuid.UUID, slug string) (Letter, error) {
	row, err := s.queries.GetLetter(ctx, dbgen.GetLetterParams{UserID: userID, Slug: slug})
	if errors.Is(err, pgx.ErrNoRows) {
		return Letter{}, ErrNoLetter
	}
	if err != nil {
		return Letter{}, fmt.Errorf("get letter: %w", err)
	}
	return Letter{CompanySlug: row.Slug, CompanyName: row.Name, CompanyCity: row.City, Content: row.Content, UpdatedAt: row.UpdatedAt}, nil
}

// Generate drafts a letter from the candidate's saved profile and the company listing, and saves it
// (replacing any previous one). Nothing is saved when the model fails.
func (s *LetterService) Generate(ctx context.Context, author Author, slug string) (Letter, error) {
	target, err := s.companies.FindBySlug(ctx, slug)
	if err != nil {
		return Letter{}, err
	}
	profile, err := s.profiles.Get(ctx, author.ID)
	if err != nil {
		return Letter{}, fmt.Errorf("generate letter: load profile: %w", err)
	}
	if !profile.HasContent() {
		return Letter{}, fieldError("profile", "Complétez d’abord votre profil (titre, expériences ou compétences) : la lettre s’appuie dessus.")
	}
	sector, err := s.sectorLabel(ctx, target.Sector)
	if err != nil {
		return Letter{}, err
	}
	instruction := letterInstruction(author, target, sector, describeProfile(profile), profile.Summary)
	answer, err := s.writer.Write(ctx, ai.Request{
		Messages:    []ai.Message{{Role: ai.RoleSystem, Content: systemRules}, {Role: ai.RoleUser, Content: instruction}},
		MaxTokens:   letterMaxTokens,
		Temperature: letterTemperature,
		// At "low", real drafts credited the candidate with tasks their profile never mentioned.
		ReasoningEffort: ai.ReasoningMedium,
	})
	if err != nil {
		return Letter{}, err
	}
	return s.store(ctx, author.ID, slug, cleanAnswer(answer, MaxLetterLength))
}

// Save replaces the letter with the candidate's edited version.
func (s *LetterService) Save(ctx context.Context, userID uuid.UUID, slug, content string) (Letter, error) {
	content = strings.TrimSpace(strings.ReplaceAll(content, "\r\n", "\n"))
	switch {
	case content == "":
		return Letter{}, fieldError("content", "Écrivez votre lettre avant de l’enregistrer.")
	case !utf8.ValidString(content) || strings.ContainsFunc(content, isForbidden):
		return Letter{}, fieldError("content", "La lettre contient des caractères non autorisés.")
	case utf8.RuneCountInString(content) > MaxLetterLength:
		return Letter{}, fieldError("content", fmt.Sprintf("La lettre ne peut pas dépasser %d caractères.", MaxLetterLength))
	}
	return s.store(ctx, userID, slug, content)
}

// Delete removes the candidate's letter for a company; deleting a missing letter is not an error.
func (s *LetterService) Delete(ctx context.Context, userID uuid.UUID, slug string) error {
	if _, err := s.queries.DeleteLetter(ctx, dbgen.DeleteLetterParams{UserID: userID, Slug: slug}); err != nil {
		return fmt.Errorf("delete letter: %w", err)
	}
	return nil
}

func (s *LetterService) store(ctx context.Context, userID uuid.UUID, slug, content string) (Letter, error) {
	companyID, err := s.queries.GetCompanyIDBySlug(ctx, slug)
	if errors.Is(err, pgx.ErrNoRows) {
		return Letter{}, company.ErrNotFound
	}
	if err != nil {
		return Letter{}, fmt.Errorf("store letter: find company: %w", err)
	}
	if _, err := s.queries.UpsertLetter(ctx, dbgen.UpsertLetterParams{UserID: userID, CompanyID: companyID, Content: content}); err != nil {
		return Letter{}, fmt.Errorf("store letter: %w", err)
	}
	return s.Get(ctx, userID, slug)
}

// sectorLabel turns a sector slug into its French label ("finance-comptabilite" → "Finance & comptabilité").
func (s *LetterService) sectorLabel(ctx context.Context, slug string) (string, error) {
	sectors, err := s.companies.SectorCounts(ctx)
	if err != nil {
		return "", fmt.Errorf("generate letter: sectors: %w", err)
	}
	for _, sector := range sectors {
		if sector.Slug == slug {
			return sector.Label, nil
		}
	}
	return slug, nil
}

func letterInstruction(author Author, target company.Company, sector, profileFacts, summary string) string {
	var about []string
	add := func(label string, value *string) {
		if value != nil && strings.TrimSpace(*value) != "" {
			about = append(about, label+" : "+truncate(strings.TrimSpace(*value), maxDescriptionInPrompt))
		}
	}
	about = append(about, "Nom : "+target.Name, "Secteur : "+sector, "Ville : "+target.City)
	add("Activité", target.CompanyType)
	add("Description", target.Description)

	return fmt.Sprintf(`Rédige une lettre de motivation pour une candidature spontanée (aucune offre n'est publiée) auprès de l'entreprise ci-dessous.
Forme : commence par « Madame, Monsieur, », puis 3 ou 4 paragraphes courts (250 à 350 mots en tout), termine par une formule de politesse et, sur la dernière ligne, le prénom et le nom du candidat. Pas d'adresse, pas de date, pas d'objet.
Fond : dis pourquoi cette entreprise et son secteur intéressent le candidat, ce qu'il peut apporter en t'appuyant uniquement sur son profil, et propose un entretien.
Limites strictes :
- Ne cite que les missions, compétences et réalisations écrites dans le profil ; si une expérience n'a pas de description, mentionne le poste sans lui prêter de missions précises.
- N'attribue à l'entreprise aucune réputation, qualité, clientèle ou valeur : tu ne sais d'elle que ce qui est écrit ci-dessous.
- Les qualités personnelles restent sobres et générales (rigueur, motivation), sans exemple inventé.

Entreprise :
<<<
%s
>>>

Candidat : %s %s
<<<
%s
Présentation : %s
>>>`, strings.Join(about, "\n"), author.FirstName, author.LastName, profileFacts, summary)
}

func truncate(value string, maxLength int) string {
	runes := []rune(value)
	if len(runes) <= maxLength {
		return value
	}
	return string(runes[:maxLength]) + "…"
}
