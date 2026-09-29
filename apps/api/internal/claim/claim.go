// Package claim lets company accounts ask to manage a listing of the directory. An admin reviews every request; an
// approved claim is what makes the account the manager of the listing (one each way in v1).
package claim

import (
	"errors"
	"time"

	"github.com/google/uuid"
)

// Statuses of a claim.
const (
	StatusPending   = "pending"
	StatusApproved  = "approved"
	StatusRejected  = "rejected"
	StatusCancelled = "cancelled"
	StatusRevoked   = "revoked"
)

// Domain errors; handlers translate them into HTTP responses.
var (
	ErrEmailUnverified = errors.New("email address not verified")
	// ErrClaimOpen means the account already has a pending or approved claim.
	ErrClaimOpen = errors.New("a claim is already open for this account")
	// ErrCompanyClaimed means the listing already has a manager.
	ErrCompanyClaimed = errors.New("listing already managed by another account")
	ErrNoPendingClaim = errors.New("no pending claim")
)

// ValidationError lists input problems by field; messages are French and shown to users.
type ValidationError struct {
	Fields map[string]string
}

func (e *ValidationError) Error() string { return "invalid input" }

// Requester is the company account asking for a listing.
type Requester struct {
	ID            uuid.UUID
	EmailVerified bool
}

// RequestInput is what the requester says about the listing and themselves.
type RequestInput struct {
	CompanySlug string `json:"companySlug"`
	JobTitle    string `json:"jobTitle"`
	Phone       string `json:"phone"`
	Message     string `json:"message"`
}

// Listing is the part of a listing a claim shows.
type Listing struct {
	Slug        string  `json:"slug"`
	Name        string  `json:"name"`
	City        string  `json:"city"`
	LogoVersion *string `json:"logoVersion"`
}

// Claim is a request as its author sees it.
type Claim struct {
	ID       uuid.UUID `json:"id"`
	Status   string    `json:"status"`
	JobTitle string    `json:"jobTitle"`
	Phone    string    `json:"phone"`
	Message  string    `json:"message"`
	// DecisionReason explains a rejection or a revocation.
	DecisionReason *string    `json:"decisionReason"`
	ReviewedAt     *time.Time `json:"reviewedAt"`
	CreatedAt      time.Time  `json:"createdAt"`
	Company        Listing    `json:"company"`
}
