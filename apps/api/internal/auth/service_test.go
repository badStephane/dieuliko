package auth

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"io"
	"log/slog"
	"net/url"
	"os"
	"regexp"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/badStephane/dieuliko/apps/api/internal/mail"
	"github.com/badStephane/dieuliko/apps/api/internal/testutil"
)

const appBaseURL = "https://dieuliko.test"

// testPool is nil in -short mode: integration tests then skip.
var testPool *pgxpool.Pool

func TestMain(m *testing.M) {
	flag.Parse()
	if testing.Short() {
		os.Exit(m.Run())
	}
	ctx := context.Background()
	pg, err := testutil.StartPostgres(ctx)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	testPool = pg.Pool
	code := m.Run()
	if err := pg.Stop(ctx); err != nil {
		fmt.Fprintln(os.Stderr, err)
	}
	os.Exit(code)
}

// recordingMailer keeps sent messages; err makes every send fail.
type recordingMailer struct {
	mu   sync.Mutex
	sent []mail.Message
	err  error
}

func (m *recordingMailer) Send(_ context.Context, msg mail.Message) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.err != nil {
		return m.err
	}
	m.sent = append(m.sent, msg)
	return nil
}

func (m *recordingMailer) fail(err error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.err = err
}

func (m *recordingMailer) messages() []mail.Message {
	m.mu.Lock()
	defer m.mu.Unlock()
	return append([]mail.Message(nil), m.sent...)
}

// newTestService empties the auth tables and returns a service with a recording mailer.
func newTestService(t *testing.T) (*Service, *recordingMailer) {
	t.Helper()
	if testPool == nil {
		t.Skip("integration test (needs Docker); run without -short")
	}
	if _, err := testPool.Exec(context.Background(), "TRUNCATE users CASCADE"); err != nil {
		t.Fatalf("truncate: %v", err)
	}
	mailer := &recordingMailer{}
	service, err := NewService(testPool, mailer, slog.New(slog.NewTextHandler(io.Discard, nil)), DefaultConfig(appBaseURL))
	if err != nil {
		t.Fatalf("NewService: %v", err)
	}
	return service, mailer
}

var linkPattern = regexp.MustCompile(`https://dieuliko\.test(/[a-z-]+)\?token=([A-Za-z0-9_%-]+)`)

// lastLink returns the path and token of the link in the last email sent to `to`.
func lastLink(t *testing.T, service *Service, mailer *recordingMailer, to string) (string, string) {
	t.Helper()
	service.Wait()
	messages := mailer.messages()
	for i := len(messages) - 1; i >= 0; i-- {
		if messages[i].To != to {
			continue
		}
		match := linkPattern.FindStringSubmatch(messages[i].Text)
		if match == nil {
			t.Fatalf("no link in email %q", messages[i].Text)
		}
		token, err := url.QueryUnescape(match[2])
		if err != nil {
			t.Fatalf("unescape token: %v", err)
		}
		return match[1], token
	}
	t.Fatalf("no email sent to %s (sent: %d)", to, len(messages))
	return "", ""
}

func validInput() RegisterInput {
	return RegisterInput{Email: " Awa.Diop@Example.SN ", Password: "correct horse", FirstName: " Awa ", LastName: "Diop"}
}

func register(t *testing.T, service *Service) (User, Session) {
	t.Helper()
	user, session, err := service.Register(context.Background(), validInput())
	if err != nil {
		t.Fatalf("Register: %v", err)
	}
	return user, session
}

func TestRegisterCreatesAnUnverifiedCandidateWithASession(t *testing.T) {
	service, mailer := newTestService(t)
	ctx := context.Background()

	user, session := register(t, service)

	if user.Email != "awa.diop@example.sn" || user.FirstName != "Awa" || user.Role != RoleCandidate || user.EmailVerified {
		t.Errorf("user = %+v", user)
	}
	authenticated, err := service.Authenticate(ctx, session.Token)
	if err != nil || authenticated.ID != user.ID {
		t.Fatalf("Authenticate = %+v, %v", authenticated, err)
	}
	path, _ := lastLink(t, service, mailer, "awa.diop@example.sn")
	if path != verifyEmailPath {
		t.Errorf("link path = %q, want %q", path, verifyEmailPath)
	}
	if subject := mailer.messages()[0].Subject; subject != "Confirmez votre adresse email" {
		t.Errorf("subject = %q", subject)
	}
}

func TestRegisterCreatesACompanyAccountThatMustVerifyItsEmail(t *testing.T) {
	service, mailer := newTestService(t)
	input := validInput()
	input.AccountType = RoleCompany

	user, _, err := service.Register(context.Background(), input)

	if err != nil || user.Role != RoleCompany || user.EmailVerified {
		t.Fatalf("user = %+v, err = %v", user, err)
	}
	if path, _ := lastLink(t, service, mailer, "awa.diop@example.sn"); path != verifyEmailPath {
		t.Errorf("link path = %q, want %q", path, verifyEmailPath)
	}
}

func TestRegisterRejectsDuplicateEmailsCaseInsensitively(t *testing.T) {
	service, _ := newTestService(t)
	register(t, service)

	input := validInput()
	input.Email = "AWA.DIOP@example.sn"
	_, _, err := service.Register(context.Background(), input)

	if !errors.Is(err, ErrEmailTaken) {
		t.Fatalf("err = %v, want ErrEmailTaken", err)
	}
}

func TestRegisterReportsInvalidFields(t *testing.T) {
	service, _ := newTestService(t)

	_, _, err := service.Register(context.Background(), RegisterInput{Email: "nope", Password: "short"})

	var validation *ValidationError
	if !errors.As(err, &validation) {
		t.Fatalf("err = %v, want ValidationError", err)
	}
	for _, field := range []string{"email", "password", "firstName", "lastName"} {
		if validation.Fields[field] == "" {
			t.Errorf("missing error for %s in %v", field, validation.Fields)
		}
	}
}

func TestVerifyEmailIsSingleUse(t *testing.T) {
	service, mailer := newTestService(t)
	ctx := context.Background()
	_, session := register(t, service)
	_, token := lastLink(t, service, mailer, "awa.diop@example.sn")

	if err := service.VerifyEmail(ctx, token); err != nil {
		t.Fatalf("VerifyEmail: %v", err)
	}
	user, _ := service.Authenticate(ctx, session.Token)
	if !user.EmailVerified {
		t.Error("email should be verified")
	}
	if err := service.VerifyEmail(ctx, token); !errors.Is(err, ErrInvalidToken) {
		t.Errorf("second use err = %v, want ErrInvalidToken", err)
	}
	if err := service.VerifyEmail(ctx, "garbage"); !errors.Is(err, ErrInvalidToken) {
		t.Errorf("malformed token err = %v, want ErrInvalidToken", err)
	}
}

func TestResendVerificationInvalidatesPreviousLinks(t *testing.T) {
	service, mailer := newTestService(t)
	ctx := context.Background()
	user, _ := register(t, service)
	_, first := lastLink(t, service, mailer, user.Email)

	if err := service.ResendVerification(ctx, user); err != nil {
		t.Fatalf("ResendVerification: %v", err)
	}
	_, second := lastLink(t, service, mailer, user.Email)

	if err := service.VerifyEmail(ctx, first); !errors.Is(err, ErrInvalidToken) {
		t.Errorf("old link err = %v, want ErrInvalidToken", err)
	}
	if err := service.VerifyEmail(ctx, second); err != nil {
		t.Errorf("new link: %v", err)
	}
}

func TestResendVerificationIsANoOpForVerifiedUsersAndReportsDeliveryFailures(t *testing.T) {
	service, mailer := newTestService(t)
	ctx := context.Background()
	user, _ := register(t, service)
	service.Wait()
	sentBefore := len(mailer.messages())

	verified := user
	verified.EmailVerified = true
	if err := service.ResendVerification(ctx, verified); err != nil || len(mailer.messages()) != sentBefore {
		t.Fatalf("verified user: err %v, sent %d", err, len(mailer.messages())-sentBefore)
	}

	mailer.fail(errors.New("smtp down"))
	if err := service.ResendVerification(ctx, user); !errors.Is(err, ErrEmailDelivery) {
		t.Fatalf("err = %v, want ErrEmailDelivery", err)
	}
}

func TestLogin(t *testing.T) {
	service, _ := newTestService(t)
	ctx := context.Background()
	registered, _ := register(t, service)

	user, session, err := service.Login(ctx, "AWA.DIOP@example.sn", "correct horse")
	if err != nil || user.ID != registered.ID || session.Token == "" {
		t.Fatalf("Login = %+v, %+v, %v", user, session, err)
	}

	failures := map[string][2]string{
		"wrong password": {"awa.diop@example.sn", "wrong horse"},
		"unknown email":  {"nobody@example.sn", "correct horse"},
		"invalid email":  {"not-an-email", "correct horse"},
		"huge password":  {"awa.diop@example.sn", strings.Repeat("x", 10*MaxPasswordLength)},
	}
	for name, credentials := range failures {
		t.Run(name, func(t *testing.T) {
			if _, _, err := service.Login(ctx, credentials[0], credentials[1]); !errors.Is(err, ErrInvalidCredentials) {
				t.Fatalf("err = %v, want ErrInvalidCredentials", err)
			}
		})
	}
}

func TestLogoutAndExpiryEndSessions(t *testing.T) {
	service, _ := newTestService(t)
	ctx := context.Background()
	_, session := register(t, service)
	_, other, err := service.Login(ctx, "awa.diop@example.sn", "correct horse")
	if err != nil {
		t.Fatalf("Login: %v", err)
	}

	if err := service.Logout(ctx, session.Token); err != nil {
		t.Fatalf("Logout: %v", err)
	}
	if _, err := service.Authenticate(ctx, session.Token); !errors.Is(err, ErrUnauthenticated) {
		t.Errorf("after logout err = %v, want ErrUnauthenticated", err)
	}
	if _, err := service.Authenticate(ctx, other.Token); err != nil {
		t.Errorf("other session should survive: %v", err)
	}

	if _, err := testPool.Exec(ctx, "UPDATE sessions SET created_at = now() - interval '2 days', expires_at = now() - interval '1 second'"); err != nil {
		t.Fatalf("expire: %v", err)
	}
	if _, err := service.Authenticate(ctx, other.Token); !errors.Is(err, ErrUnauthenticated) {
		t.Errorf("expired session err = %v, want ErrUnauthenticated", err)
	}
	if err := service.Logout(ctx, "not-a-token"); err != nil {
		t.Errorf("malformed token logout: %v", err)
	}
}

func TestPasswordResetFlow(t *testing.T) {
	service, mailer := newTestService(t)
	ctx := context.Background()
	_, session := register(t, service)

	if err := service.RequestPasswordReset(ctx, "Awa.Diop@example.sn"); err != nil {
		t.Fatalf("RequestPasswordReset: %v", err)
	}
	path, token := lastLink(t, service, mailer, "awa.diop@example.sn")
	if path != resetPasswordPath {
		t.Fatalf("link path = %q", path)
	}

	if err := service.ResetPassword(ctx, token, "brand new secret"); err != nil {
		t.Fatalf("ResetPassword: %v", err)
	}

	if _, err := service.Authenticate(ctx, session.Token); !errors.Is(err, ErrUnauthenticated) {
		t.Errorf("sessions should be revoked, err = %v", err)
	}
	if _, _, err := service.Login(ctx, "awa.diop@example.sn", "correct horse"); !errors.Is(err, ErrInvalidCredentials) {
		t.Errorf("old password err = %v", err)
	}
	user, _, err := service.Login(ctx, "awa.diop@example.sn", "brand new secret")
	if err != nil || !user.EmailVerified {
		t.Errorf("new password login = %+v, %v (email should now be verified)", user, err)
	}
	if err := service.ResetPassword(ctx, token, "another secret"); !errors.Is(err, ErrInvalidToken) {
		t.Errorf("reused link err = %v, want ErrInvalidToken", err)
	}
}

func TestPasswordResetOnlyTheLatestLinkWorks(t *testing.T) {
	service, mailer := newTestService(t)
	ctx := context.Background()
	register(t, service)
	if err := service.RequestPasswordReset(ctx, "awa.diop@example.sn"); err != nil {
		t.Fatalf("first request: %v", err)
	}
	_, first := lastLink(t, service, mailer, "awa.diop@example.sn")
	if err := service.RequestPasswordReset(ctx, "awa.diop@example.sn"); err != nil {
		t.Fatalf("second request: %v", err)
	}
	_, second := lastLink(t, service, mailer, "awa.diop@example.sn")

	if err := service.ResetPassword(ctx, first, "brand new secret"); !errors.Is(err, ErrInvalidToken) {
		t.Errorf("superseded link err = %v, want ErrInvalidToken", err)
	}
	if err := service.ResetPassword(ctx, second, "brand new secret"); err != nil {
		t.Errorf("latest link: %v", err)
	}
}

func TestConcurrentResetRequestsLeaveASinglePendingLink(t *testing.T) {
	service, _ := newTestService(t)
	ctx := context.Background()
	register(t, service)

	var wg sync.WaitGroup
	for range 5 {
		wg.Go(func() {
			if err := service.RequestPasswordReset(ctx, "awa.diop@example.sn"); err != nil {
				t.Errorf("RequestPasswordReset: %v", err)
			}
		})
	}
	wg.Wait()
	service.Wait()

	var pending int
	err := testPool.QueryRow(ctx, "SELECT count(*) FROM email_tokens WHERE purpose = 'reset_password' AND used_at IS NULL").Scan(&pending)
	if err != nil || pending != 1 {
		t.Fatalf("pending reset links = %d, %v; want exactly 1", pending, err)
	}
}

func TestSessionExpiryComesFromTheDatabaseClock(t *testing.T) {
	service, _ := newTestService(t)
	_, session := register(t, service)

	var dbNow time.Time
	if err := testPool.QueryRow(context.Background(), "SELECT now()").Scan(&dbNow); err != nil {
		t.Fatalf("now: %v", err)
	}
	if drift := session.ExpiresAt.Sub(dbNow.Add(DefaultConfig("").SessionTTL)); drift > time.Minute || drift < -time.Minute {
		t.Errorf("expiresAt %v is not ~30 days after the database clock %v", session.ExpiresAt, dbNow)
	}
}

func TestPasswordResetRevealsNothingForUnknownEmails(t *testing.T) {
	service, mailer := newTestService(t)

	for _, email := range []string{"nobody@example.sn", "not-an-email"} {
		if err := service.RequestPasswordReset(context.Background(), email); err != nil {
			t.Errorf("RequestPasswordReset(%q) = %v, want nil", email, err)
		}
	}
	service.Wait()
	if sent := mailer.messages(); len(sent) != 0 {
		t.Errorf("sent %d emails, want none", len(sent))
	}
}

func TestResetPasswordValidatesInput(t *testing.T) {
	service, _ := newTestService(t)
	ctx := context.Background()

	var validation *ValidationError
	if err := service.ResetPassword(ctx, "whatever", "short"); !errors.As(err, &validation) {
		t.Errorf("short password err = %v, want ValidationError", err)
	}
	if err := service.ResetPassword(ctx, "garbage", "long enough secret"); !errors.Is(err, ErrInvalidToken) {
		t.Errorf("malformed token err = %v, want ErrInvalidToken", err)
	}
}

func TestExpiredEmailTokensAreRejectedAndCleanedUp(t *testing.T) {
	service, mailer := newTestService(t)
	ctx := context.Background()
	register(t, service)
	_, token := lastLink(t, service, mailer, "awa.diop@example.sn")
	expire := "UPDATE %s SET created_at = now() - interval '3 days', expires_at = now() - interval '1 second'"
	for _, table := range []string{"email_tokens", "sessions"} {
		if _, err := testPool.Exec(ctx, fmt.Sprintf(expire, table)); err != nil {
			t.Fatalf("expire %s: %v", table, err)
		}
	}

	if err := service.VerifyEmail(ctx, token); !errors.Is(err, ErrInvalidToken) {
		t.Errorf("expired link err = %v, want ErrInvalidToken", err)
	}
	sessions, tokens, err := service.Cleanup(ctx)
	if err != nil || sessions != 1 || tokens != 1 {
		t.Errorf("Cleanup = %d sessions, %d tokens, %v; want 1, 1", sessions, tokens, err)
	}
}

func TestCreateAdmin(t *testing.T) {
	service, mailer := newTestService(t)
	ctx := context.Background()
	input := RegisterInput{Email: "admin@dieuliko.sn", Password: "admin secret", FirstName: "Awa", LastName: "Diop"}

	admin, err := service.CreateAdmin(ctx, input)
	if err != nil {
		t.Fatalf("CreateAdmin: %v", err)
	}
	user, _, err := service.Login(ctx, "admin@dieuliko.sn", "admin secret")
	if err != nil || user.Role != RoleAdmin || !user.EmailVerified || user.ID != admin.ID {
		t.Errorf("admin login = %+v, %v", user, err)
	}
	if _, err := service.CreateAdmin(ctx, input); !errors.Is(err, ErrEmailTaken) {
		t.Errorf("duplicate admin err = %v", err)
	}
	service.Wait()
	if len(mailer.messages()) != 0 {
		t.Error("creating an admin must not send email")
	}
}

func TestDeleteAdminLeavesCandidatesAlone(t *testing.T) {
	service, _ := newTestService(t)
	ctx := context.Background()
	if _, err := service.CreateAdmin(ctx, RegisterInput{Email: "admin@dieuliko.sn", Password: "admin secret", FirstName: "Awa", LastName: "Diop"}); err != nil {
		t.Fatalf("CreateAdmin: %v", err)
	}
	candidate, _ := register(t, service)

	if err := service.DeleteAdmin(ctx, " admin@dieuliko.sn "); err != nil {
		t.Fatalf("DeleteAdmin: %v", err)
	}
	if _, _, err := service.Login(ctx, "admin@dieuliko.sn", "admin secret"); err == nil {
		t.Error("the deleted admin can still sign in")
	}
	if err := service.DeleteAdmin(ctx, candidate.Email); !errors.Is(err, ErrAdminNotFound) {
		t.Errorf("deleting a candidate as an admin: %v", err)
	}
}

// suspend marks the account suspended, as the back-office does.
func suspend(t *testing.T, userID uuid.UUID) {
	t.Helper()
	if _, err := testPool.Exec(context.Background(), "UPDATE users SET suspended_at = now() WHERE id = $1", userID); err != nil {
		t.Fatalf("suspend: %v", err)
	}
}

func TestSuspendedAccountsCannotSignIn(t *testing.T) {
	service, _ := newTestService(t)
	ctx := context.Background()
	user, session := register(t, service)
	suspend(t, user.ID)

	if _, err := service.Authenticate(ctx, session.Token); !errors.Is(err, ErrUnauthenticated) {
		t.Errorf("Authenticate with a live session = %v, want ErrUnauthenticated", err)
	}
	if _, _, err := service.Login(ctx, "awa.diop@example.sn", "correct horse"); !errors.Is(err, ErrAccountSuspended) {
		t.Errorf("Login with the right password = %v, want ErrAccountSuspended", err)
	}
	// A wrong password must not reveal that the account exists and is suspended.
	if _, _, err := service.Login(ctx, "awa.diop@example.sn", "wrong password"); !errors.Is(err, ErrInvalidCredentials) {
		t.Errorf("Login with a wrong password = %v, want ErrInvalidCredentials", err)
	}
}

func TestSuspendedAccountsGetNoPasswordResetLink(t *testing.T) {
	service, mailer := newTestService(t)
	user, _ := register(t, service)
	service.Wait()
	before := len(mailer.messages())
	suspend(t, user.ID)

	if err := service.RequestPasswordReset(context.Background(), "awa.diop@example.sn"); err != nil {
		t.Fatalf("RequestPasswordReset = %v, want nil", err)
	}
	service.Wait()
	if sent := len(mailer.messages()) - before; sent != 0 {
		t.Errorf("sent %d emails, want none", sent)
	}
}
