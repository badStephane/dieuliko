package application

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"

	"github.com/badStephane/dieuliko/apps/api/internal/assistant"
	"github.com/badStephane/dieuliko/apps/api/internal/candidate"
	"github.com/badStephane/dieuliko/apps/api/internal/company"
	"github.com/badStephane/dieuliko/apps/api/internal/database/dbgen"
	"github.com/badStephane/dieuliko/apps/api/internal/storage"
)

const (
	dailyWindow       = 24 * time.Hour
	cvCopyKeyPrefix   = "applications/"
	pdfContentType    = "application/pdf"
	uniqueViolation   = "23505"
	oneSentConstraint = "applications_one_sent_per_company"

	msgNoProfile = "Complétez d’abord votre profil (titre, expériences ou compétences)."
	msgNoLetter  = "Enregistrez d’abord votre lettre de motivation pour cette entreprise."
	msgNoCV      = "Ajoutez d’abord votre CV (PDF) dans votre espace candidat."
)

// DB is satisfied by *pgxpool.Pool.
type DB interface {
	dbgen.DBTX
	Begin(ctx context.Context) (pgx.Tx, error)
}

// Service sends, lists and withdraws applications. The CV copy is written before the row and erased after it,
// so a sent application never points to a missing file.
type Service struct {
	db       DB
	store    storage.Store
	profiles ProfileReader
	cvs      CVOpener
	letters  LetterReader
	logger   *slog.Logger
}

// NewService builds the service.
func NewService(db DB, store storage.Store, profiles ProfileReader, cvs CVOpener, letters LetterReader, logger *slog.Logger) *Service {
	return &Service{db: db, store: store, profiles: profiles, cvs: cvs, letters: letters, logger: logger}
}

// material is what an application is made of, gathered from the candidate's space.
type material struct {
	profile candidate.Profile
	letter  string
	cv      candidate.CV
	file    io.ReadCloser
}

// Apply sends the candidate's current profile, saved letter and CV to a company.
func (s *Service) Apply(ctx context.Context, applicant Applicant, slug string) (Detail, error) {
	if !applicant.EmailVerified {
		return Detail{}, ErrEmailUnverified
	}
	companyID, err := dbgen.New(s.db).GetCompanyIDBySlug(ctx, slug)
	if errors.Is(err, pgx.ErrNoRows) {
		return Detail{}, company.ErrNotFound
	}
	if err != nil {
		return Detail{}, fmt.Errorf("apply: find company: %w", err)
	}
	sent, err := s.gather(ctx, applicant.ID, slug)
	if err != nil {
		return Detail{}, err
	}
	defer func() { _ = sent.file.Close() }()
	profile, err := json.Marshal(sent.profile.ProfileInput)
	if err != nil {
		return Detail{}, fmt.Errorf("apply: encode profile: %w", err)
	}

	key := cvCopyKeyPrefix + applicant.ID.String() + "/" + uuid.NewString() + ".pdf"
	if err := s.store.Put(ctx, key, sent.file, int64(sent.cv.SizeBytes), pdfContentType); err != nil {
		return Detail{}, fmt.Errorf("apply: copy cv: %w", err)
	}
	size := int32(sent.cv.SizeBytes)
	id, err := s.insert(ctx, dbgen.InsertApplicationParams{
		UserID: applicant.ID, CompanyID: companyID,
		FirstName: &applicant.FirstName, LastName: &applicant.LastName, Email: &applicant.Email,
		Profile: profile, Letter: &sent.letter, CvObjectKey: &key, CvFileName: &sent.cv.FileName, CvSizeBytes: &size,
	})
	if err != nil {
		s.deleteObject(ctx, key)
		return Detail{}, err
	}
	return s.Get(ctx, applicant.ID, id)
}

// gather reads what the application is made of; every missing piece is named in one ValidationError.
// On success the caller closes the CV file.
func (s *Service) gather(ctx context.Context, userID uuid.UUID, slug string) (material, error) {
	missing := map[string]string{}
	profile, err := s.profiles.Get(ctx, userID)
	if err != nil {
		return material{}, fmt.Errorf("apply: load profile: %w", err)
	}
	if !profile.HasContent() {
		missing["profile"] = msgNoProfile
	}
	letter, err := s.letters.Get(ctx, userID, slug)
	if errors.Is(err, assistant.ErrNoLetter) {
		missing["letter"] = msgNoLetter
	} else if err != nil {
		return material{}, fmt.Errorf("apply: load letter: %w", err)
	}
	cv, file, err := s.cvs.Open(ctx, userID)
	if errors.Is(err, candidate.ErrNoCV) {
		missing["cv"] = msgNoCV
	} else if err != nil {
		return material{}, fmt.Errorf("apply: open cv: %w", err)
	}
	if len(missing) > 0 {
		if file != nil {
			_ = file.Close()
		}
		return material{}, &ValidationError{Fields: missing}
	}
	return material{profile: profile, letter: letter.Content, cv: cv, file: file}, nil
}

// insert records the application once the daily cap and the one-per-company rule allow it. Locking the user
// serializes a candidate's concurrent applications, so the count cannot be raced past the cap.
func (s *Service) insert(ctx context.Context, params dbgen.InsertApplicationParams) (uuid.UUID, error) {
	var id uuid.UUID
	err := pgx.BeginFunc(ctx, s.db, func(tx pgx.Tx) error {
		q := dbgen.New(tx)
		if err := q.LockUser(ctx, params.UserID); err != nil {
			return fmt.Errorf("apply: lock user: %w", err)
		}
		count, err := q.CountApplicationsSince(ctx, dbgen.CountApplicationsSinceParams{UserID: params.UserID, CreatedAt: time.Now().Add(-dailyWindow)})
		if err != nil {
			return fmt.Errorf("apply: count today's applications: %w", err)
		}
		if count >= MaxPerDay {
			return ErrDailyLimit
		}
		row, err := q.InsertApplication(ctx, params)
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == uniqueViolation && pgErr.ConstraintName == oneSentConstraint {
			return ErrAlreadyApplied
		}
		if err != nil {
			return fmt.Errorf("apply: insert: %w", err)
		}
		id = row.ID
		return nil
	})
	return id, err
}

// List returns the candidate's applications, most recent first (never nil).
func (s *Service) List(ctx context.Context, userID uuid.UUID) ([]Application, error) {
	rows, err := dbgen.New(s.db).ListApplications(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("list applications: %w", err)
	}
	applications := make([]Application, 0, len(rows))
	for _, row := range rows {
		applications = append(applications, Application{
			ID: row.ID, CompanySlug: row.Slug, CompanyName: row.Name, CompanyCity: row.City,
			Status: Status(row.Status), CreatedAt: row.CreatedAt, WithdrawnAt: row.WithdrawnAt,
		})
	}
	return applications, nil
}

// Get returns one of the candidate's applications, or ErrNotFound (also for someone else's).
func (s *Service) Get(ctx context.Context, userID, id uuid.UUID) (Detail, error) {
	row, err := dbgen.New(s.db).GetApplication(ctx, dbgen.GetApplicationParams{ID: id, UserID: userID})
	if errors.Is(err, pgx.ErrNoRows) {
		return Detail{}, ErrNotFound
	}
	if err != nil {
		return Detail{}, fmt.Errorf("get application: %w", err)
	}
	detail := Detail{Application: Application{
		ID: row.ID, CompanySlug: row.Slug, CompanyName: row.Name, CompanyCity: row.City,
		Status: Status(row.Status), CreatedAt: row.CreatedAt, WithdrawnAt: row.WithdrawnAt,
	}}
	if detail.Status != StatusSent {
		return detail, nil
	}
	snapshot, err := newSnapshot(row)
	if err != nil {
		return Detail{}, err
	}
	detail.Snapshot = &snapshot
	return detail, nil
}

// newSnapshot reads a sent application's snapshot; the table's CHECK guarantees every column is set.
func newSnapshot(row dbgen.GetApplicationRow) (Snapshot, error) {
	var profile candidate.ProfileInput
	if err := json.Unmarshal(row.Profile, &profile); err != nil {
		return Snapshot{}, fmt.Errorf("get application: decode profile: %w", err)
	}
	return Snapshot{
		FirstName: deref(row.FirstName), LastName: deref(row.LastName), Email: deref(row.Email),
		Profile: profile, Letter: deref(row.Letter), CVFileName: deref(row.CvFileName), CVSizeBytes: int(deref(row.CvSizeBytes)),
	}, nil
}

// Withdraw erases the snapshot and the CV copy; withdrawing twice is not an error.
func (s *Service) Withdraw(ctx context.Context, userID, id uuid.UUID) error {
	key, err := dbgen.New(s.db).WithdrawApplication(ctx, dbgen.WithdrawApplicationParams{ID: id, UserID: userID})
	if errors.Is(err, pgx.ErrNoRows) {
		_, err := s.Get(ctx, userID, id) // ErrNotFound, or already withdrawn
		return err
	}
	if err != nil {
		return fmt.Errorf("withdraw application: %w", err)
	}
	if key != nil {
		s.deleteObject(ctx, *key)
	}
	return nil
}

// deleteObject removes a CV copy no row points to anymore. A failure only leaves an orphan file behind, so it is
// logged rather than returned; it runs even if the client went away.
func (s *Service) deleteObject(ctx context.Context, key string) {
	if err := s.store.Delete(context.WithoutCancel(ctx), key); err != nil {
		s.logger.Error("orphan application cv file", slog.String("key", key), slog.String("error", err.Error()))
	}
}

func deref[T any](value *T) T {
	var zero T
	if value == nil {
		return zero
	}
	return *value
}
