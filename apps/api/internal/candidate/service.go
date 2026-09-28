package candidate

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"

	"github.com/badStephane/dieuliko/apps/api/internal/database/dbgen"
)

const (
	foreignKeyViolation = "23503"
	// desiredSectorFK is the constraint hit when a desired sector is not in the sectors table.
	desiredSectorFK = "candidate_desired_sectors_sector_fkey"
)

// readSnapshot makes the several queries of a read see one consistent state of the profile.
var readSnapshot = pgx.TxOptions{IsoLevel: pgx.RepeatableRead, AccessMode: pgx.ReadOnly}

// DB is satisfied by *pgxpool.Pool.
type DB interface {
	dbgen.DBTX
	BeginTx(ctx context.Context, opts pgx.TxOptions) (pgx.Tx, error)
}

// ProfileService reads and saves candidate profiles.
type ProfileService struct {
	db DB
	// now bounds the months of experiences and educations (overridden in tests).
	now func() time.Time
}

// NewProfileService builds the service.
func NewProfileService(db DB) *ProfileService {
	return &ProfileService{db: db, now: time.Now}
}

// Get returns the candidate's profile, or an empty one if they never saved it.
func (s *ProfileService) Get(ctx context.Context, userID uuid.UUID) (Profile, error) {
	var profile Profile
	err := withTx(ctx, s.db, readSnapshot, func(q *dbgen.Queries) error {
		var err error
		profile, err = loadProfile(ctx, q, userID)
		return err
	})
	if err != nil {
		return Profile{}, fmt.Errorf("get profile: %w", err)
	}
	return profile, nil
}

// Save validates the input and replaces the whole profile atomically.
func (s *ProfileService) Save(ctx context.Context, userID uuid.UUID, input ProfileInput) (Profile, error) {
	input, err := validateProfile(input, s.now())
	if err != nil {
		return Profile{}, err
	}
	var updatedAt time.Time
	err = withTx(ctx, s.db, pgx.TxOptions{}, func(q *dbgen.Queries) error {
		updatedAt, err = q.UpsertProfile(ctx, dbgen.UpsertProfileParams{
			UserID: userID, Headline: input.Headline, Summary: input.Summary,
			Phone: input.Phone, City: input.City, Skills: input.Skills,
		})
		if err != nil {
			return err
		}
		if err := q.DeleteProfileLists(ctx, userID); err != nil {
			return err
		}
		return insertLists(ctx, q, userID, input)
	})
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == foreignKeyViolation && pgErr.ConstraintName == desiredSectorFK {
		return Profile{}, &ValidationError{Fields: map[string]string{"desiredSectors": "Ce secteur n’existe pas."}}
	}
	if err != nil {
		return Profile{}, fmt.Errorf("save profile: %w", err)
	}
	return Profile{ProfileInput: input, UpdatedAt: &updatedAt}, nil
}

func loadProfile(ctx context.Context, q *dbgen.Queries, userID uuid.UUID) (Profile, error) {
	row, err := q.GetProfile(ctx, userID)
	if errors.Is(err, pgx.ErrNoRows) {
		return emptyProfile(), nil
	}
	if err != nil {
		return Profile{}, err
	}
	profile := emptyProfile()
	profile.Headline, profile.Summary, profile.Phone, profile.City = row.Headline, row.Summary, row.Phone, row.City
	profile.Skills = append(profile.Skills, row.Skills...)
	profile.UpdatedAt = &row.UpdatedAt

	sectors, err := q.ListDesiredSectors(ctx, userID)
	if err != nil {
		return Profile{}, err
	}
	profile.DesiredSectors = append(profile.DesiredSectors, sectors...)
	if profile.Languages, err = loadLanguages(ctx, q, userID); err != nil {
		return Profile{}, err
	}
	if profile.Experiences, err = loadExperiences(ctx, q, userID); err != nil {
		return Profile{}, err
	}
	if profile.Educations, err = loadEducations(ctx, q, userID); err != nil {
		return Profile{}, err
	}
	return profile, nil
}

func loadLanguages(ctx context.Context, q *dbgen.Queries, userID uuid.UUID) ([]Language, error) {
	rows, err := q.ListLanguages(ctx, userID)
	if err != nil {
		return nil, err
	}
	languages := make([]Language, 0, len(rows))
	for _, row := range rows {
		languages = append(languages, Language{Language: row.Language, Level: row.Level})
	}
	return languages, nil
}

func loadExperiences(ctx context.Context, q *dbgen.Queries, userID uuid.UUID) ([]Experience, error) {
	rows, err := q.ListExperiences(ctx, userID)
	if err != nil {
		return nil, err
	}
	experiences := make([]Experience, 0, len(rows))
	for _, row := range rows {
		experiences = append(experiences, Experience{
			Title: row.Title, Organization: row.Organization, City: row.City,
			StartMonth: formatMonth(row.StartMonth), EndMonth: formatOptionalMonth(row.EndMonth),
			Description: row.Description,
		})
	}
	return experiences, nil
}

func loadEducations(ctx context.Context, q *dbgen.Queries, userID uuid.UUID) ([]Education, error) {
	rows, err := q.ListEducations(ctx, userID)
	if err != nil {
		return nil, err
	}
	educations := make([]Education, 0, len(rows))
	for _, row := range rows {
		educations = append(educations, Education{
			Degree: row.Degree, School: row.School, Field: row.Field,
			StartMonth: formatMonth(row.StartMonth), EndMonth: formatOptionalMonth(row.EndMonth),
			Description: row.Description,
		})
	}
	return educations, nil
}

// insertLists writes the lists of a validated profile, positions following input order.
func insertLists(ctx context.Context, q *dbgen.Queries, userID uuid.UUID, input ProfileInput) error {
	for i, sector := range input.DesiredSectors {
		if err := q.InsertDesiredSector(ctx, dbgen.InsertDesiredSectorParams{UserID: userID, Position: int16(i), Sector: sector}); err != nil {
			return err
		}
	}
	for i, language := range input.Languages {
		params := dbgen.InsertLanguageParams{UserID: userID, Position: int16(i), Language: language.Language, Level: language.Level}
		if err := q.InsertLanguage(ctx, params); err != nil {
			return err
		}
	}
	for i, item := range input.Experiences {
		if err := q.InsertExperience(ctx, dbgen.InsertExperienceParams{
			UserID: userID, Position: int16(i), Title: item.Title, Organization: item.Organization, City: item.City,
			StartMonth: mustParseMonth(item.StartMonth), EndMonth: parseOptionalMonth(item.EndMonth), Description: item.Description,
		}); err != nil {
			return err
		}
	}
	for i, item := range input.Educations {
		if err := q.InsertEducation(ctx, dbgen.InsertEducationParams{
			UserID: userID, Position: int16(i), Degree: item.Degree, School: item.School, Field: item.Field,
			StartMonth: mustParseMonth(item.StartMonth), EndMonth: parseOptionalMonth(item.EndMonth), Description: item.Description,
		}); err != nil {
			return err
		}
	}
	return nil
}

// mustParseMonth parses a month that validateProfile already accepted.
func mustParseMonth(raw string) time.Time {
	month, _ := parseMonth(raw)
	return month
}

func parseOptionalMonth(raw *string) *time.Time {
	if raw == nil {
		return nil
	}
	month := mustParseMonth(*raw)
	return &month
}

func formatOptionalMonth(month *time.Time) *string {
	if month == nil {
		return nil
	}
	formatted := formatMonth(*month)
	return &formatted
}

// withTx runs fn in a transaction, committed only if fn succeeds.
func withTx(ctx context.Context, db DB, opts pgx.TxOptions, fn func(q *dbgen.Queries) error) error {
	tx, err := db.BeginTx(ctx, opts)
	if err != nil {
		return fmt.Errorf("begin transaction: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }() // no-op after a successful commit
	if err := fn(dbgen.New(tx)); err != nil {
		return err
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit transaction: %w", err)
	}
	return nil
}
