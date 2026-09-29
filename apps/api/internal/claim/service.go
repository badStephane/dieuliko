package claim

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"

	"github.com/badStephane/dieuliko/apps/api/internal/company"
	"github.com/badStephane/dieuliko/apps/api/internal/database/dbgen"
	"github.com/badStephane/dieuliko/apps/api/internal/logo"
)

const (
	uniqueViolation      = "23505"
	oneOpenPerUser       = "company_claims_one_open_per_user"
	oneManagerPerListing = "company_claims_one_manager_per_company"
)

// Service opens, shows and cancels a company account's claims.
type Service struct {
	queries *dbgen.Queries
}

// NewService builds the service; db is satisfied by *pgxpool.Pool.
func NewService(db dbgen.DBTX) *Service {
	return &Service{queries: dbgen.New(db)}
}

// Current returns the account's most recent claim, whatever its status, or nil when it never asked for a listing.
func (s *Service) Current(ctx context.Context, userID uuid.UUID) (*Claim, error) {
	row, err := s.queries.GetLatestClaim(ctx, userID)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("current claim: %w", err)
	}
	claim := fromRow(row)
	return &claim, nil
}

// Request asks to manage a visible listing that has no manager yet. The account needs a verified email and no other
// open claim.
func (s *Service) Request(ctx context.Context, requester Requester, input RequestInput) (Claim, error) {
	clean, err := validateRequest(input)
	if err != nil {
		return Claim{}, err
	}
	if !requester.EmailVerified {
		return Claim{}, ErrEmailUnverified
	}
	companyID, err := s.queries.GetCompanyIDBySlug(ctx, clean.CompanySlug)
	if errors.Is(err, pgx.ErrNoRows) {
		return Claim{}, company.ErrNotFound
	}
	if err != nil {
		return Claim{}, fmt.Errorf("request claim: find company: %w", err)
	}
	managed, err := s.queries.CompanyHasManager(ctx, companyID)
	if err != nil {
		return Claim{}, fmt.Errorf("request claim: check manager: %w", err)
	}
	if managed {
		return Claim{}, ErrCompanyClaimed
	}
	_, err = s.queries.InsertClaim(ctx, dbgen.InsertClaimParams{
		UserID: requester.ID, CompanyID: companyID, JobTitle: clean.JobTitle, Phone: clean.Phone, Message: clean.Message,
	})
	if err != nil {
		return Claim{}, insertError(err)
	}
	current, err := s.Current(ctx, requester.ID)
	if err != nil {
		return Claim{}, err
	}
	return *current, nil
}

// Cancel withdraws the account's pending claim; an approved one is revoked by an admin only.
func (s *Service) Cancel(ctx context.Context, userID uuid.UUID) error {
	affected, err := s.queries.CancelPendingClaim(ctx, userID)
	if err != nil {
		return fmt.Errorf("cancel claim: %w", err)
	}
	if affected == 0 {
		return ErrNoPendingClaim
	}
	return nil
}

// insertError turns the unique indexes into domain errors: a concurrent request of the same account, or a listing
// approved for someone else in between.
func insertError(err error) error {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == uniqueViolation {
		switch pgErr.ConstraintName {
		case oneOpenPerUser:
			return ErrClaimOpen
		case oneManagerPerListing:
			return ErrCompanyClaimed
		}
	}
	return fmt.Errorf("request claim: %w", err)
}

func fromRow(row dbgen.GetLatestClaimRow) Claim {
	return Claim{
		ID: row.ID, Status: row.Status, JobTitle: row.JobTitle, Phone: row.Phone, Message: row.Message,
		DecisionReason: row.DecisionReason, ReviewedAt: row.ReviewedAt, CreatedAt: row.CreatedAt,
		Company: Listing{Slug: row.Slug, Name: row.Name, City: row.City, LogoVersion: logo.VersionOf(row.LogoKey)},
	}
}
