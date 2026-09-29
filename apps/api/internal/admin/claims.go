package admin

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/url"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/badStephane/dieuliko/apps/api/internal/database/dbgen"
	"github.com/badStephane/dieuliko/apps/api/internal/mail"
)

// ClaimStatuses are the claim statuses the back-office lists (see package claim for their meaning).
var ClaimStatuses = []string{"pending", "approved", "rejected", "cancelled", "revoked"}

const (
	maxReasonLength      = 500
	oneManagerConstraint = "company_claims_one_manager_per_company"
	pgUniqueViolation    = "23505"
	// autoRejectReason is sent to the other requesters of a listing once one of them is approved.
	autoRejectReason = "Une autre personne de l’entreprise gère désormais cette fiche. Si vous pensez qu’il s’agit d’une erreur, contactez-nous."
)

// Review errors; the handler translates them into HTTP responses.
var (
	ErrClaimNotFound    = errors.New("claim not found")
	ErrClaimNotPending  = errors.New("claim is not pending")
	ErrClaimNotApproved = errors.New("claim is not approved")
	// ErrListingManaged means another claim on the listing was approved first.
	ErrListingManaged = errors.New("listing already has a manager")
)

// ClaimLinks are the pages the notices point to.
type ClaimLinks struct {
	Contact string
	// Space is the company space, where an approved requester manages the listing.
	Space string
}

// ClaimRequester is the company account behind a claim.
type ClaimRequester struct {
	FirstName     string     `json:"firstName"`
	LastName      string     `json:"lastName"`
	Email         string     `json:"email"`
	EmailVerified bool       `json:"emailVerified"`
	CreatedAt     *time.Time `json:"createdAt,omitempty"`
}

// ClaimListing is the listing a claim is about; the contact fields are only filled on the detail.
type ClaimListing struct {
	Slug     string     `json:"slug"`
	Name     string     `json:"name"`
	City     string     `json:"city"`
	Website  string     `json:"website,omitempty"`
	Email    string     `json:"email,omitempty"`
	Verified bool       `json:"verified"`
	HiddenAt *time.Time `json:"hiddenAt"`
}

// ClaimSummary is one line of the back-office queue.
type ClaimSummary struct {
	ID         uuid.UUID      `json:"id"`
	Status     string         `json:"status"`
	JobTitle   string         `json:"jobTitle"`
	CreatedAt  time.Time      `json:"createdAt"`
	ReviewedAt *time.Time     `json:"reviewedAt"`
	Requester  ClaimRequester `json:"requester"`
	Company    ClaimListing   `json:"company"`
}

// OtherClaim is another request on the same listing.
type OtherClaim struct {
	ID        uuid.UUID `json:"id"`
	Status    string    `json:"status"`
	CreatedAt time.Time `json:"createdAt"`
	Name      string    `json:"name"`
	Email     string    `json:"email"`
}

// ClaimDetail is a request as the admin reviews it.
type ClaimDetail struct {
	ClaimSummary
	Phone          string  `json:"phone"`
	Message        string  `json:"message"`
	DecisionReason *string `json:"decisionReason"`
	// EmailDomainMatches is a hint only: the requester's email shares the domain of the listing's website.
	EmailDomainMatches bool         `json:"emailDomainMatches"`
	OtherClaims        []OtherClaim `json:"otherClaims"`
}

// ClaimPage is one page of claims and the number of matches.
type ClaimPage struct {
	Items []ClaimSummary `json:"items"`
	Total int            `json:"total"`
}

// ClaimService lets admins approve, reject or revoke the company accounts' claims. Every decision is audited and
// emailed to the requester only: the listing's own address is never written to.
type ClaimService struct {
	db     DB
	mailer mail.Mailer
	logger *slog.Logger
	links  ClaimLinks
}

// NewClaimService builds the service.
func NewClaimService(db DB, mailer mail.Mailer, logger *slog.Logger, links ClaimLinks) *ClaimService {
	return &ClaimService{db: db, mailer: mailer, logger: logger, links: links}
}

// List returns the claims of one status: pending ones oldest first, the others most recently reviewed first.
func (s *ClaimService) List(ctx context.Context, status string, offset, limit int) (ClaimPage, error) {
	q := dbgen.New(s.db)
	rows, err := q.ListAdminClaims(ctx, dbgen.ListAdminClaimsParams{Status: status, RowOffset: int32(offset), RowLimit: int32(limit)})
	if err != nil {
		return ClaimPage{}, fmt.Errorf("admin list claims: %w", err)
	}
	total, err := q.CountAdminClaims(ctx, status)
	if err != nil {
		return ClaimPage{}, fmt.Errorf("admin count claims: %w", err)
	}
	items := make([]ClaimSummary, 0, len(rows))
	for _, row := range rows {
		items = append(items, ClaimSummary{
			ID: row.ID, Status: row.Status, JobTitle: row.JobTitle, CreatedAt: row.CreatedAt, ReviewedAt: row.ReviewedAt,
			Requester: ClaimRequester{FirstName: row.FirstName, LastName: row.LastName, Email: row.Email, EmailVerified: row.EmailVerified},
			Company:   ClaimListing{Slug: row.Slug, Name: row.Name, City: row.City},
		})
	}
	return ClaimPage{Items: items, Total: int(total)}, nil
}

// Get returns a claim with its requester, its listing and the other requests on that listing.
func (s *ClaimService) Get(ctx context.Context, id uuid.UUID) (ClaimDetail, error) {
	q := dbgen.New(s.db)
	row, err := q.GetAdminClaim(ctx, id)
	if errors.Is(err, pgx.ErrNoRows) {
		return ClaimDetail{}, ErrClaimNotFound
	}
	if err != nil {
		return ClaimDetail{}, fmt.Errorf("admin get claim: %w", err)
	}
	others, err := q.ListOtherClaimsOfCompany(ctx, dbgen.ListOtherClaimsOfCompanyParams{CompanyID: row.CompanyID, ID: id})
	if err != nil {
		return ClaimDetail{}, fmt.Errorf("admin get claim: others: %w", err)
	}
	otherClaims := make([]OtherClaim, 0, len(others))
	for _, other := range others {
		otherClaims = append(otherClaims, OtherClaim{
			ID: other.ID, Status: other.Status, CreatedAt: other.CreatedAt, Name: other.FirstName + " " + other.LastName, Email: other.Email,
		})
	}
	website := deref(row.Website)
	return ClaimDetail{
		ClaimSummary: ClaimSummary{
			ID: row.ID, Status: row.Status, JobTitle: row.JobTitle, CreatedAt: row.CreatedAt, ReviewedAt: row.ReviewedAt,
			Requester: ClaimRequester{
				FirstName: row.FirstName, LastName: row.LastName, Email: row.Email, EmailVerified: row.EmailVerified, CreatedAt: &row.UserCreatedAt,
			},
			Company: ClaimListing{
				Slug: row.Slug, Name: row.Name, City: row.City, Website: website, Email: deref(row.CompanyEmail), Verified: row.Verified, HiddenAt: row.HiddenAt,
			},
		},
		Phone: row.Phone, Message: row.Message, DecisionReason: row.DecisionReason,
		EmailDomainMatches: emailDomainMatches(row.Email, website), OtherClaims: otherClaims,
	}, nil
}

// Approve makes the requester the manager of the listing, marks the listing verified and rejects the other pending
// requests on it.
func (s *ClaimService) Approve(ctx context.Context, adminID, id uuid.UUID) (ClaimDetail, error) {
	var rejected []dbgen.RejectOtherPendingClaimsRow
	err := pgx.BeginFunc(ctx, s.db, func(tx pgx.Tx) error {
		q := dbgen.New(tx)
		locked, err := lockClaim(ctx, q, id, "pending", ErrClaimNotPending)
		if err != nil {
			return err
		}
		managed, err := q.CompanyHasManager(ctx, locked.CompanyID)
		if err != nil {
			return fmt.Errorf("admin approve claim: check manager: %w", err)
		}
		if managed {
			return ErrListingManaged
		}
		reviewer := pgtype.UUID{Bytes: adminID, Valid: true}
		if err := q.SetClaimReview(ctx, dbgen.SetClaimReviewParams{Status: "approved", ReviewedBy: reviewer, ID: id}); err != nil {
			return approveError(err)
		}
		if err := q.MarkCompanyVerifiedByClaim(ctx, locked.CompanyID); err != nil {
			return fmt.Errorf("admin approve claim: verify listing: %w", err)
		}
		reason := autoRejectReason
		rejected, err = q.RejectOtherPendingClaims(ctx, dbgen.RejectOtherPendingClaimsParams{
			DecisionReason: &reason, ReviewedBy: reviewer, CompanyID: locked.CompanyID, ApprovedID: id,
		})
		if err != nil {
			return fmt.Errorf("admin approve claim: reject others: %w", err)
		}
		for _, other := range rejected {
			if err := recordAudit(ctx, q, adminID, "claim.reject", "claim", other.ID.String(), nil); err != nil {
				return err
			}
		}
		return recordAudit(ctx, q, adminID, "claim.approve", "claim", id.String(), []string{"verified"})
	})
	if err != nil {
		return ClaimDetail{}, err
	}
	detail, err := s.Get(ctx, id)
	if err != nil {
		return ClaimDetail{}, err
	}
	s.notify(ctx, approvedNotice(detail.Company.Name, s.links.Space), detail.Requester.Email, detail.Requester.FirstName)
	for _, other := range rejected {
		s.notify(ctx, rejectedNotice(detail.Company.Name, autoRejectReason), other.Email, other.FirstName)
	}
	return detail, nil
}

// Reject turns down a pending request, telling the requester why.
func (s *ClaimService) Reject(ctx context.Context, adminID, id uuid.UUID, reason string) (ClaimDetail, error) {
	return s.close(ctx, adminID, id, reason, closing{from: "pending", to: "rejected", action: "claim.reject", wrongStatus: ErrClaimNotPending, notice: rejectedNotice})
}

// Revoke ends an approved claim: the account no longer manages the listing, which stays verified.
func (s *ClaimService) Revoke(ctx context.Context, adminID, id uuid.UUID, reason string) (ClaimDetail, error) {
	return s.close(ctx, adminID, id, reason, closing{from: "approved", to: "revoked", action: "claim.revoke", wrongStatus: ErrClaimNotApproved, notice: revokedNotice})
}

// closing describes a decision that ends a claim with a reason.
type closing struct {
	from, to, action string
	wrongStatus      error
	notice           func(companyName, reason string) notice
}

func (s *ClaimService) close(ctx context.Context, adminID, id uuid.UUID, reason string, c closing) (ClaimDetail, error) {
	reason, err := validateReason(reason)
	if err != nil {
		return ClaimDetail{}, err
	}
	err = pgx.BeginFunc(ctx, s.db, func(tx pgx.Tx) error {
		q := dbgen.New(tx)
		if _, err := lockClaim(ctx, q, id, c.from, c.wrongStatus); err != nil {
			return err
		}
		params := dbgen.SetClaimReviewParams{Status: c.to, DecisionReason: &reason, ReviewedBy: pgtype.UUID{Bytes: adminID, Valid: true}, ID: id}
		if err := q.SetClaimReview(ctx, params); err != nil {
			return fmt.Errorf("admin %s: %w", c.action, err)
		}
		return recordAudit(ctx, q, adminID, c.action, "claim", id.String(), nil)
	})
	if err != nil {
		return ClaimDetail{}, err
	}
	detail, err := s.Get(ctx, id)
	if err != nil {
		return ClaimDetail{}, err
	}
	s.notify(ctx, c.notice(detail.Company.Name, reason), detail.Requester.Email, detail.Requester.FirstName)
	return detail, nil
}

// lockClaim locks the claim for the decision and checks it is in the status the decision applies to.
func lockClaim(ctx context.Context, q *dbgen.Queries, id uuid.UUID, want string, wrongStatus error) (dbgen.LockClaimRow, error) {
	locked, err := q.LockClaim(ctx, id)
	if errors.Is(err, pgx.ErrNoRows) {
		return dbgen.LockClaimRow{}, ErrClaimNotFound
	}
	if err != nil {
		return dbgen.LockClaimRow{}, fmt.Errorf("admin lock claim: %w", err)
	}
	if locked.Status != want {
		return dbgen.LockClaimRow{}, wrongStatus
	}
	return locked, nil
}

// approveError reports a listing approved for someone else in between (the unique index) as ErrListingManaged.
func approveError(err error) error {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == pgUniqueViolation && pgErr.ConstraintName == oneManagerConstraint {
		return ErrListingManaged
	}
	return fmt.Errorf("admin approve claim: %w", err)
}

func validateReason(raw string) (string, error) {
	reason := strings.TrimSpace(strings.ReplaceAll(raw, "\r\n", "\n"))
	message := ""
	switch {
	case reason == "":
		message = "Expliquez votre décision : le motif est envoyé au demandeur."
	case utf8.RuneCountInString(reason) > maxReasonLength:
		message = fmt.Sprintf("%d caractères maximum.", maxReasonLength)
	case !utf8.ValidString(reason) || strings.ContainsFunc(reason, func(r rune) bool { return unicode.IsControl(r) && r != '\n' }):
		message = "Ce motif contient des caractères non autorisés."
	}
	if message != "" {
		return "", &ValidationError{Fields: map[string]string{"reason": message}}
	}
	return reason, nil
}

// emailDomainMatches tells whether the email's domain is the website's host or one of its subdomains ("www." aside).
func emailDomainMatches(email, website string) bool {
	at := strings.LastIndex(email, "@")
	parsed, err := url.Parse(website)
	if at < 0 || err != nil || parsed.Hostname() == "" {
		return false
	}
	domain := strings.ToLower(email[at+1:])
	host := strings.TrimPrefix(strings.ToLower(parsed.Hostname()), "www.")
	return domain == host || strings.HasSuffix(domain, "."+host)
}

// notify emails the requester after the decision is committed; a delivery failure is logged, not returned.
func (s *ClaimService) notify(ctx context.Context, n notice, to, firstName string) {
	msg, err := n.message(to, firstName, s.links.Contact)
	if err == nil {
		err = s.mailer.Send(context.WithoutCancel(ctx), msg)
	}
	if err != nil {
		s.logger.Error("claim notice not sent", slog.String("subject", n.subject), slog.String("error", err.Error()))
	}
}
