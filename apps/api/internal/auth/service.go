package auth

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"

	"github.com/badStephane/dieuliko/apps/api/internal/database/dbgen"
	"github.com/badStephane/dieuliko/apps/api/internal/mail"
)

// Token purposes stored in email_tokens.purpose.
const (
	purposeVerifyEmail   = "verify_email"
	purposeResetPassword = "reset_password"
)

const (
	uniqueViolation = "23505"
	// backgroundTimeout bounds work done after the response (email delivery, reset link issuance).
	backgroundTimeout = 30 * time.Second
	// Validity wording shown in emails; keep in sync with DefaultConfig.
	verifyEmailValidity   = "48 heures"
	resetPasswordValidity = "1 heure"
)

// Config holds the service settings.
type Config struct {
	// AppBaseURL is the public URL of the web front, used in email links (no trailing slash).
	AppBaseURL       string
	SessionTTL       time.Duration
	VerifyEmailTTL   time.Duration
	ResetPasswordTTL time.Duration
}

// DefaultConfig returns production durations for the given front URL.
func DefaultConfig(appBaseURL string) Config {
	return Config{
		AppBaseURL:       appBaseURL,
		SessionTTL:       30 * 24 * time.Hour,
		VerifyEmailTTL:   48 * time.Hour,
		ResetPasswordTTL: time.Hour,
	}
}

// DB is satisfied by *pgxpool.Pool.
type DB interface {
	dbgen.DBTX
	Begin(ctx context.Context) (pgx.Tx, error)
}

// Service implements the account use cases. Expiry times are computed by PostgreSQL (now() + TTL),
// the same clock that checks them.
type Service struct {
	db      DB
	queries *dbgen.Queries
	mailer  mail.Mailer
	logger  *slog.Logger
	cfg     Config
	// dummyHash is compared against when the email is unknown, so login time does not reveal accounts.
	dummyHash string
	// pending tracks background work so shutdown can wait for it.
	pending sync.WaitGroup
}

// NewService builds the service.
func NewService(db DB, mailer mail.Mailer, logger *slog.Logger, cfg Config) (*Service, error) {
	dummyHash, err := HashPassword("dummy password used to equalize login timing")
	if err != nil {
		return nil, err
	}
	return &Service{db: db, queries: dbgen.New(db), mailer: mailer, logger: logger, cfg: cfg, dummyHash: dummyHash}, nil
}

// Wait blocks until background work (emails, reset links) is done (call on shutdown).
func (s *Service) Wait() {
	s.pending.Wait()
}

// Register atomically creates a candidate account, its verification link and a session,
// then emails the link in the background.
func (s *Service) Register(ctx context.Context, input RegisterInput) (User, Session, error) {
	input, err := validateRegistration(input)
	if err != nil {
		return User{}, Session{}, err
	}
	hash, err := HashPassword(input.Password)
	if err != nil {
		return User{}, Session{}, err
	}

	var (
		user        User
		session     Session
		verifyToken string
	)
	err = s.withTx(ctx, func(q *dbgen.Queries) error {
		if user, err = insertUser(ctx, q, input, hash, RoleCandidate); err != nil {
			return err
		}
		if verifyToken, err = s.issueEmailToken(ctx, q, user.ID, purposeVerifyEmail, s.cfg.VerifyEmailTTL); err != nil {
			return err
		}
		session, err = s.createSession(ctx, q, user.ID)
		return err
	})
	if err != nil {
		return User{}, Session{}, err
	}
	s.background("send verification email", user.ID, func(ctx context.Context) error {
		return s.sendLink(ctx, user, verifyEmailTemplate, verifyEmailPath, verifyToken, verifyEmailValidity)
	})
	return user, session, nil
}

// Login checks credentials and opens a session. Unknown emails and wrong passwords are
// indistinguishable, in result and in timing (a dummy hash is checked when there is no account).
func (s *Service) Login(ctx context.Context, email, password string) (User, Session, error) {
	if len(password) > 4*MaxPasswordLength {
		return User{}, Session{}, ErrInvalidCredentials
	}
	email = normalizeEmail(email)
	row, err := s.queries.GetUserCredentialsByEmail(ctx, email)
	if errors.Is(err, pgx.ErrNoRows) || (err == nil && validateEmail(email) != "") {
		_, _ = VerifyPassword(password, s.dummyHash)
		return User{}, Session{}, ErrInvalidCredentials
	}
	if err != nil {
		return User{}, Session{}, fmt.Errorf("login: find user: %w", err)
	}
	match, err := VerifyPassword(password, row.PasswordHash)
	if err != nil {
		return User{}, Session{}, err
	}
	if !match {
		return User{}, Session{}, ErrInvalidCredentials
	}
	if row.SuspendedAt != nil {
		return User{}, Session{}, ErrAccountSuspended
	}

	session, err := s.createSession(ctx, s.queries, row.ID)
	if err != nil {
		return User{}, Session{}, err
	}
	return newUser(row.ID, row.Email, row.Role, row.FirstName, row.LastName, row.EmailVerifiedAt, row.CreatedAt), session, nil
}

// Authenticate resolves a session token to its user.
func (s *Service) Authenticate(ctx context.Context, token string) (User, error) {
	if !isWellFormedToken(token) {
		return User{}, ErrUnauthenticated
	}
	row, err := s.queries.GetSessionUser(ctx, hashToken(token))
	if errors.Is(err, pgx.ErrNoRows) {
		return User{}, ErrUnauthenticated
	}
	if err != nil {
		return User{}, fmt.Errorf("authenticate: %w", err)
	}
	return newUser(row.ID, row.Email, row.Role, row.FirstName, row.LastName, row.EmailVerifiedAt, row.CreatedAt), nil
}

// Logout revokes a session; unknown tokens are ignored.
func (s *Service) Logout(ctx context.Context, token string) error {
	if !isWellFormedToken(token) {
		return nil
	}
	if err := s.queries.DeleteSession(ctx, hashToken(token)); err != nil {
		return fmt.Errorf("logout: %w", err)
	}
	return nil
}

// ResendVerification emails a new verification link (previous links stop working).
// It is synchronous so the logged-in user learns if delivery failed.
func (s *Service) ResendVerification(ctx context.Context, user User) error {
	if user.EmailVerified {
		return nil
	}
	token, err := s.issueEmailTokenTx(ctx, user.ID, purposeVerifyEmail, s.cfg.VerifyEmailTTL)
	if err != nil {
		return err
	}
	if err := s.sendLink(ctx, user, verifyEmailTemplate, verifyEmailPath, token, verifyEmailValidity); err != nil {
		return fmt.Errorf("%w: %w", ErrEmailDelivery, err)
	}
	return nil
}

// VerifyEmail consumes a verification link.
func (s *Service) VerifyEmail(ctx context.Context, token string) error {
	if !isWellFormedToken(token) {
		return ErrInvalidToken
	}
	return s.withTx(ctx, func(q *dbgen.Queries) error {
		userID, err := consumeEmailToken(ctx, q, token, purposeVerifyEmail)
		if err != nil {
			return err
		}
		return q.MarkEmailVerified(ctx, userID)
	})
}

// RequestPasswordReset emails a reset link when the account exists. The caller always gets nil after
// the same single lookup: issuing and sending the link happen in the background, so neither the
// result nor the response time reveals whether the account exists.
func (s *Service) RequestPasswordReset(ctx context.Context, email string) error {
	email = normalizeEmail(email)
	row, err := s.queries.GetUserCredentialsByEmail(ctx, email)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("password reset: find user: %w", err)
	}
	if row.SuspendedAt != nil {
		return nil // a new password would not let a suspended account sign in
	}
	user := newUser(row.ID, row.Email, row.Role, row.FirstName, row.LastName, row.EmailVerifiedAt, row.CreatedAt)
	s.background("send password reset email", user.ID, func(ctx context.Context) error {
		token, err := s.issueEmailTokenTx(ctx, user.ID, purposeResetPassword, s.cfg.ResetPasswordTTL)
		if err != nil {
			return err
		}
		return s.sendLink(ctx, user, resetPasswordTemplate, resetPasswordPath, token, resetPasswordValidity)
	})
	return nil
}

// ResetPassword consumes a reset link, sets the new password and revokes every session.
// Receiving the link also proves ownership of the address, so it is marked verified.
func (s *Service) ResetPassword(ctx context.Context, token, password string) error {
	if err := validateNewPassword(password); err != nil {
		return err
	}
	if !isWellFormedToken(token) {
		return ErrInvalidToken
	}
	hash, err := HashPassword(password)
	if err != nil {
		return err
	}
	return s.withTx(ctx, func(q *dbgen.Queries) error {
		userID, err := consumeEmailToken(ctx, q, token, purposeResetPassword)
		if err != nil {
			return err
		}
		if err := q.UpdatePasswordHash(ctx, dbgen.UpdatePasswordHashParams{ID: userID, PasswordHash: hash}); err != nil {
			return fmt.Errorf("reset password: update: %w", err)
		}
		if err := q.MarkEmailVerified(ctx, userID); err != nil {
			return fmt.Errorf("reset password: verify email: %w", err)
		}
		if err := q.DeleteUserSessions(ctx, userID); err != nil {
			return fmt.Errorf("reset password: revoke sessions: %w", err)
		}
		return nil
	})
}

// CreateAdmin creates an administrator account whose email is considered verified. Used by cmd/admin.
func (s *Service) CreateAdmin(ctx context.Context, input RegisterInput) (User, error) {
	input, err := validateRegistration(input)
	if err != nil {
		return User{}, err
	}
	hash, err := HashPassword(input.Password)
	if err != nil {
		return User{}, err
	}
	var user User
	err = s.withTx(ctx, func(q *dbgen.Queries) error {
		if user, err = insertUser(ctx, q, input, hash, RoleAdmin); err != nil {
			return err
		}
		if err := q.MarkEmailVerified(ctx, user.ID); err != nil {
			return fmt.Errorf("create admin: verify email: %w", err)
		}
		user.EmailVerified = true
		return nil
	})
	return user, err
}

// ErrAdminNotFound is returned when no administrator has the email.
var ErrAdminNotFound = errors.New("admin not found")

// DeleteAdmin removes an administrator account and its sessions; a candidate with that email is left alone.
func (s *Service) DeleteAdmin(ctx context.Context, email string) error {
	deleted, err := s.queries.DeleteAdminByEmail(ctx, strings.TrimSpace(email))
	if err != nil {
		return fmt.Errorf("delete admin: %w", err)
	}
	if deleted == 0 {
		return ErrAdminNotFound
	}
	return nil
}

// Cleanup deletes expired sessions and email tokens.
func (s *Service) Cleanup(ctx context.Context) (sessions, tokens int64, err error) {
	if sessions, err = s.queries.DeleteExpiredSessions(ctx); err != nil {
		return 0, 0, fmt.Errorf("cleanup sessions: %w", err)
	}
	if tokens, err = s.queries.DeleteExpiredEmailTokens(ctx); err != nil {
		return sessions, 0, fmt.Errorf("cleanup email tokens: %w", err)
	}
	return sessions, tokens, nil
}

func insertUser(ctx context.Context, q *dbgen.Queries, input RegisterInput, hash, role string) (User, error) {
	row, err := q.CreateUser(ctx, dbgen.CreateUserParams{
		Email: input.Email, PasswordHash: hash, Role: role, FirstName: input.FirstName, LastName: input.LastName,
	})
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == uniqueViolation {
		return User{}, ErrEmailTaken
	}
	if err != nil {
		return User{}, fmt.Errorf("create user: %w", err)
	}
	return newUser(row.ID, row.Email, row.Role, row.FirstName, row.LastName, row.EmailVerifiedAt, row.CreatedAt), nil
}

func (s *Service) createSession(ctx context.Context, q *dbgen.Queries, userID uuid.UUID) (Session, error) {
	token, hash, err := newToken()
	if err != nil {
		return Session{}, err
	}
	expiresAt, err := q.CreateSession(ctx, dbgen.CreateSessionParams{
		TokenHash: hash, UserID: userID, TtlSeconds: s.cfg.SessionTTL.Seconds(),
	})
	if err != nil {
		return Session{}, fmt.Errorf("create session: %w", err)
	}
	return Session{Token: token, ExpiresAt: expiresAt.UTC()}, nil
}

// issueEmailToken retires the pending token of the same purpose and stores a new one. The user row
// is locked first, so concurrent requests are serialized and only the latest link stays valid.
func (s *Service) issueEmailToken(ctx context.Context, q *dbgen.Queries, userID uuid.UUID, purpose string, ttl time.Duration) (string, error) {
	if err := q.LockUser(ctx, userID); err != nil {
		return "", fmt.Errorf("lock user for %s token: %w", purpose, err)
	}
	if err := q.RetireEmailTokens(ctx, dbgen.RetireEmailTokensParams{UserID: userID, Purpose: purpose}); err != nil {
		return "", fmt.Errorf("retire %s tokens: %w", purpose, err)
	}
	token, hash, err := newToken()
	if err != nil {
		return "", err
	}
	err = q.CreateEmailToken(ctx, dbgen.CreateEmailTokenParams{
		TokenHash: hash, UserID: userID, Purpose: purpose, TtlSeconds: ttl.Seconds(),
	})
	if err != nil {
		return "", fmt.Errorf("create %s token: %w", purpose, err)
	}
	return token, nil
}

func (s *Service) issueEmailTokenTx(ctx context.Context, userID uuid.UUID, purpose string, ttl time.Duration) (string, error) {
	var token string
	err := s.withTx(ctx, func(q *dbgen.Queries) error {
		var err error
		token, err = s.issueEmailToken(ctx, q, userID, purpose, ttl)
		return err
	})
	return token, err
}

func consumeEmailToken(ctx context.Context, q *dbgen.Queries, token, purpose string) (uuid.UUID, error) {
	userID, err := q.ConsumeEmailToken(ctx, dbgen.ConsumeEmailTokenParams{TokenHash: hashToken(token), Purpose: purpose})
	if errors.Is(err, pgx.ErrNoRows) {
		return uuid.UUID{}, ErrInvalidToken
	}
	if err != nil {
		return uuid.UUID{}, fmt.Errorf("consume %s token: %w", purpose, err)
	}
	return userID, nil
}

func (s *Service) sendLink(ctx context.Context, user User, tmpl emailTemplate, path, token, validity string) error {
	msg, err := tmpl.render(user.Email, user.FirstName, s.cfg.AppBaseURL, path, token, validity)
	if err != nil {
		return err
	}
	return s.mailer.Send(ctx, msg)
}

// background runs fn after the response with its own deadline; failures are logged.
func (s *Service) background(task string, userID uuid.UUID, fn func(ctx context.Context) error) {
	s.pending.Add(1)
	go func() {
		defer s.pending.Done()
		ctx, cancel := context.WithTimeout(context.Background(), backgroundTimeout)
		defer cancel()
		if err := fn(ctx); err != nil {
			s.logger.Error(task, slog.String("user_id", userID.String()), slog.String("error", err.Error()))
		}
	}()
}

func (s *Service) withTx(ctx context.Context, fn func(q *dbgen.Queries) error) error {
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin transaction: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }() // no-op after a successful commit
	if err := fn(s.queries.WithTx(tx)); err != nil {
		return err
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit transaction: %w", err)
	}
	return nil
}

func newUser(id uuid.UUID, email, role, firstName, lastName string, verifiedAt *time.Time, createdAt time.Time) User {
	return User{
		ID: id, Email: email, Role: role, FirstName: firstName, LastName: lastName,
		EmailVerified: verifiedAt != nil, CreatedAt: createdAt,
	}
}
