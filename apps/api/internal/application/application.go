// Package application keeps candidates' spontaneous applications in the Dieuliko inbox: nothing is emailed to the
// company, which will read them from its own space. A sent application is a frozen snapshot of the candidate's
// identity, profile, saved letter and CV; withdrawing it erases that snapshot.
package application

import (
	"context"
	"errors"
	"io"
	"time"

	"github.com/google/uuid"

	"github.com/badStephane/dieuliko/apps/api/internal/assistant"
	"github.com/badStephane/dieuliko/apps/api/internal/candidate"
)

// MaxPerDay caps the applications a candidate sends in 24 hours, so a directory is not flooded with generic letters.
const MaxPerDay = 10

// Errors the handler turns into responses.
var (
	ErrNotFound        = errors.New("application not found")
	ErrAlreadyApplied  = errors.New("an application to this company is already sent")
	ErrDailyLimit      = errors.New("daily application limit reached")
	ErrEmailUnverified = errors.New("email address not verified")
)

// Status is where an application stands.
type Status string

// Application statuses, mirrored by the CHECK constraint of applications.status.
const (
	StatusSent      Status = "sent"
	StatusWithdrawn Status = "withdrawn"
)

// Application is one line of the candidate's history.
type Application struct {
	ID          uuid.UUID  `json:"id"`
	CompanySlug string     `json:"companySlug"`
	CompanyName string     `json:"companyName"`
	CompanyCity string     `json:"companyCity"`
	Status      Status     `json:"status"`
	CreatedAt   time.Time  `json:"createdAt"`
	WithdrawnAt *time.Time `json:"withdrawnAt"`
}

// Snapshot is what the company will read, frozen when the application was sent.
type Snapshot struct {
	FirstName   string                 `json:"firstName"`
	LastName    string                 `json:"lastName"`
	Email       string                 `json:"email"`
	Profile     candidate.ProfileInput `json:"profile"`
	Letter      string                 `json:"letter"`
	CVFileName  string                 `json:"cvFileName"`
	CVSizeBytes int                    `json:"cvSizeBytes"`
}

// Detail is an application with its snapshot; Snapshot is nil once withdrawn.
type Detail struct {
	Application
	Snapshot *Snapshot `json:"snapshot"`
}

// Applicant is the signed-in candidate sending an application.
type Applicant struct {
	ID            uuid.UUID
	FirstName     string
	LastName      string
	Email         string
	EmailVerified bool
}

// ValidationError names what is missing before the candidate can apply, field by field.
type ValidationError struct {
	Fields map[string]string
}

func (e *ValidationError) Error() string {
	return "application incomplete"
}

// ProfileReader is what applications need from candidate.ProfileService.
type ProfileReader interface {
	Get(ctx context.Context, userID uuid.UUID) (candidate.Profile, error)
}

// CVOpener is what applications need from candidate.CVService.
type CVOpener interface {
	Open(ctx context.Context, userID uuid.UUID) (candidate.CV, io.ReadCloser, error)
}

// LetterReader is what applications need from assistant.LetterService.
type LetterReader interface {
	Get(ctx context.Context, userID uuid.UUID, slug string) (assistant.Letter, error)
}
