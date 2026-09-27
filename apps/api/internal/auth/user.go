// Package auth manages accounts and sessions: registration, login with opaque session tokens,
// email verification and password reset.
package auth

import (
	"errors"
	"time"

	"github.com/google/uuid"
)

// Roles. Company accounts arrive with the "claim your listing" step.
const (
	RoleCandidate = "candidate"
	RoleAdmin     = "admin"
)

// Domain errors; handlers translate them into HTTP responses.
var (
	ErrEmailTaken         = errors.New("email already registered")
	ErrInvalidCredentials = errors.New("invalid email or password")
	ErrUnauthenticated    = errors.New("missing, invalid or expired session")
	ErrInvalidToken       = errors.New("invalid, expired or already used token")
	ErrEmailDelivery      = errors.New("email could not be sent")
)

// ValidationError lists user input problems by field; messages are French and shown to users.
type ValidationError struct {
	Fields map[string]string
}

func (e *ValidationError) Error() string {
	return "invalid input"
}

// User is the public view of an account (never includes the password hash).
type User struct {
	ID            uuid.UUID `json:"id"`
	Email         string    `json:"email"`
	Role          string    `json:"role"`
	FirstName     string    `json:"firstName"`
	LastName      string    `json:"lastName"`
	EmailVerified bool      `json:"emailVerified"`
	CreatedAt     time.Time `json:"createdAt"`
}

// Session is a freshly issued session. Token is shown once: only its hash is stored.
type Session struct {
	Token     string    `json:"token"`
	ExpiresAt time.Time `json:"expiresAt"`
}

// RegisterInput is what a candidate provides to sign up.
type RegisterInput struct {
	Email     string
	Password  string
	FirstName string
	LastName  string
}
