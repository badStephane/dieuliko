package admin

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/badStephane/dieuliko/apps/api/internal/company"
	"github.com/badStephane/dieuliko/apps/api/internal/database/dbgen"
	"github.com/badStephane/dieuliko/apps/api/internal/mail"
	"github.com/badStephane/dieuliko/apps/api/internal/storage"
)

// Candidate status filters of the back-office search.
const (
	CandidateActive    = "active"
	CandidateSuspended = "suspended"
)

// ErrCandidateNotFound is returned for unknown ids and for admin accounts, which the back-office cannot change.
var ErrCandidateNotFound = errors.New("candidate not found")

// CandidateSummary is one line of the back-office candidate list.
type CandidateSummary struct {
	ID            uuid.UUID  `json:"id"`
	Email         string     `json:"email"`
	FirstName     string     `json:"firstName"`
	LastName      string     `json:"lastName"`
	EmailVerified bool       `json:"emailVerified"`
	SuspendedAt   *time.Time `json:"suspendedAt"`
	CreatedAt     time.Time  `json:"createdAt"`
	// Steps of the journey: facts only, never the content of the profile, CV or applications.
	HasProfile       bool  `json:"hasProfile"`
	HasCV            bool  `json:"hasCv"`
	ApplicationsSent int64 `json:"applicationsSent"`
}

// CandidateDetail adds what exists in the candidate's space, never its content.
type CandidateDetail struct {
	CandidateSummary
	HasProfile            bool  `json:"hasProfile"`
	HasCV                 bool  `json:"hasCv"`
	Letters               int64 `json:"letters"`
	ApplicationsSent      int64 `json:"applicationsSent"`
	ApplicationsWithdrawn int64 `json:"applicationsWithdrawn"`
}

// CandidateFilters narrows the back-office search; empty fields do not filter.
type CandidateFilters struct {
	Query    string
	Status   string // CandidateActive, CandidateSuspended or ""
	Progress string // one of Progresses, or ""
	Sort     string // SortNewest (default) or SortName
}

// Steps of the journey the candidate list can filter on.
const (
	ProgressUnverified = "unverified"
	ProgressNoProfile  = "no-profile"
	ProgressNoCV       = "no-cv"
	ProgressApplied    = "applied"
)

// Progresses are the accepted journey filters.
var Progresses = []string{ProgressUnverified, ProgressNoProfile, ProgressNoCV, ProgressApplied}

// SortNewest lists the newest accounts first (SortName is shared with the listings).
const SortNewest = "newest"

// CandidatePage is one page of candidates and the number of matches.
type CandidatePage struct {
	Items []CandidateSummary `json:"items"`
	Total int                `json:"total"`
}

// AccountService suspends and deletes candidate accounts, tells the candidate by email and records every change.
type AccountService struct {
	db         DB
	store      storage.Store
	mailer     mail.Mailer
	logger     *slog.Logger
	contactURL string
}

// NewAccountService builds the service; contactURL is linked from the notices sent to candidates.
func NewAccountService(db DB, store storage.Store, mailer mail.Mailer, logger *slog.Logger, contactURL string) *AccountService {
	return &AccountService{db: db, store: store, mailer: mailer, logger: logger, contactURL: contactURL}
}

// Search lists candidates, newest first.
func (s *AccountService) Search(ctx context.Context, filters CandidateFilters, offset, limit int) (CandidatePage, error) {
	q := dbgen.New(s.db)
	words := company.SearchWords(filters.Query)
	status, progress := nullable(filters.Status), nullable(filters.Progress)
	rows, err := q.SearchAdminCandidates(ctx, dbgen.SearchAdminCandidatesParams{
		Status: status, Progress: progress, Words: words, Sort: filters.Sort, RowOffset: int32(offset), RowLimit: int32(limit),
	})
	if err != nil {
		return CandidatePage{}, fmt.Errorf("admin search candidates: %w", err)
	}
	total, err := q.CountAdminCandidates(ctx, dbgen.CountAdminCandidatesParams{Status: status, Progress: progress, Words: words})
	if err != nil {
		return CandidatePage{}, fmt.Errorf("admin count candidates: %w", err)
	}
	items := make([]CandidateSummary, 0, len(rows))
	for _, row := range rows {
		items = append(items, CandidateSummary{
			ID: row.ID, Email: row.Email, FirstName: row.FirstName, LastName: row.LastName,
			EmailVerified: row.EmailVerifiedAt != nil, SuspendedAt: row.SuspendedAt, CreatedAt: row.CreatedAt,
			HasProfile: row.HasProfile, HasCV: row.HasCv, ApplicationsSent: row.ApplicationsSent,
		})
	}
	return CandidatePage{Items: items, Total: int(total)}, nil
}

// Get returns a candidate's account status, or ErrCandidateNotFound.
func (s *AccountService) Get(ctx context.Context, id uuid.UUID) (CandidateDetail, error) {
	row, err := dbgen.New(s.db).GetAdminCandidate(ctx, id)
	if errors.Is(err, pgx.ErrNoRows) {
		return CandidateDetail{}, ErrCandidateNotFound
	}
	if err != nil {
		return CandidateDetail{}, fmt.Errorf("admin get candidate: %w", err)
	}
	return CandidateDetail{
		CandidateSummary: CandidateSummary{
			ID: row.ID, Email: row.Email, FirstName: row.FirstName, LastName: row.LastName,
			EmailVerified: row.EmailVerifiedAt != nil, SuspendedAt: row.SuspendedAt, CreatedAt: row.CreatedAt,
		},
		HasProfile: row.HasProfile, HasCV: row.HasCv, Letters: row.Letters,
		ApplicationsSent: row.ApplicationsSent, ApplicationsWithdrawn: row.ApplicationsWithdrawn,
	}, nil
}

// SetSuspended suspends a candidate (their sessions are revoked) or lifts the suspension. Only an actual change is
// recorded and emailed, so repeating the request is harmless.
func (s *AccountService) SetSuspended(ctx context.Context, adminID, id uuid.UUID, suspended bool) (CandidateDetail, error) {
	var account dbgen.LockCandidateRow
	changed := false
	err := pgx.BeginFunc(ctx, s.db, func(tx pgx.Tx) error {
		q := dbgen.New(tx)
		var err error
		if account, err = lockCandidate(ctx, q, id); err != nil {
			return err
		}
		if changed = (account.SuspendedAt != nil) != suspended; !changed {
			return nil
		}
		if err := q.SetUserSuspended(ctx, dbgen.SetUserSuspendedParams{ID: id, Suspended: suspended}); err != nil {
			return fmt.Errorf("admin suspend: %w", err)
		}
		if suspended {
			if err := q.DeleteUserSessions(ctx, id); err != nil {
				return fmt.Errorf("admin suspend: revoke sessions: %w", err)
			}
		}
		action := map[bool]string{true: "user.suspend", false: "user.unsuspend"}[suspended]
		return recordAudit(ctx, q, adminID, action, "user", id.String(), nil)
	})
	if err != nil {
		return CandidateDetail{}, err
	}
	if changed {
		s.notify(ctx, map[bool]notice{true: suspendedNotice, false: reactivatedNotice}[suspended], account)
	}
	return s.Get(ctx, id)
}

// Delete erases a candidate's account and everything in it, once confirmEmail matches the account's address. Files
// are removed after the rows: a failure then only leaves unreachable orphans behind, which is logged.
func (s *AccountService) Delete(ctx context.Context, adminID, id uuid.UUID, confirmEmail string) error {
	var account dbgen.LockCandidateRow
	var keys []string
	err := pgx.BeginFunc(ctx, s.db, func(tx pgx.Tx) error {
		q := dbgen.New(tx)
		var err error
		if account, err = lockCandidate(ctx, q, id); err != nil {
			return err
		}
		if !strings.EqualFold(strings.TrimSpace(confirmEmail), account.Email) {
			return &ValidationError{Fields: map[string]string{"confirmEmail": "Recopiez exactement l’adresse email du compte."}}
		}
		if keys, err = q.ListCandidateObjectKeys(ctx, id); err != nil {
			return fmt.Errorf("admin delete: list files: %w", err)
		}
		if _, err := q.DeleteCandidate(ctx, id); err != nil {
			return fmt.Errorf("admin delete: %w", err)
		}
		return recordAudit(ctx, q, adminID, "user.delete", "user", id.String(), nil)
	})
	if err != nil {
		return err
	}
	for _, key := range keys {
		if err := s.store.Delete(context.WithoutCancel(ctx), key); err != nil {
			s.logger.Error("orphan candidate file", slog.String("key", key), slog.String("error", err.Error()))
		}
	}
	s.notify(ctx, deletedNotice, account)
	return nil
}

func lockCandidate(ctx context.Context, q *dbgen.Queries, id uuid.UUID) (dbgen.LockCandidateRow, error) {
	account, err := q.LockCandidate(ctx, id)
	if errors.Is(err, pgx.ErrNoRows) {
		return dbgen.LockCandidateRow{}, ErrCandidateNotFound
	}
	if err != nil {
		return dbgen.LockCandidateRow{}, fmt.Errorf("admin lock candidate: %w", err)
	}
	return account, nil
}

// notify emails the candidate after the change is committed; a delivery failure is logged, not returned, since the
// change itself succeeded.
func (s *AccountService) notify(ctx context.Context, n notice, account dbgen.LockCandidateRow) {
	msg, err := n.message(account.Email, account.FirstName, s.contactURL)
	if err == nil {
		err = s.mailer.Send(context.WithoutCancel(ctx), msg)
	}
	if err != nil {
		s.logger.Error("account notice not sent", slog.String("subject", n.subject), slog.String("error", err.Error()))
	}
}
