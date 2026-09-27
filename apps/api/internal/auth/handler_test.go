package auth

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"github.com/badStephane/dieuliko/apps/api/internal/httpx"
)

const validToken = "valid-session"

// fakeAccounts records calls and returns canned results; err applies to every call.
type fakeAccounts struct {
	err         error
	gotRegister RegisterInput
	gotEmail    string
	gotPassword string
	gotToken    string
	resent      bool
}

var (
	testUser = User{
		ID: uuid.MustParse("00000000-0000-0000-0000-000000000001"), Email: "awa@example.sn",
		Role: RoleCandidate, FirstName: "Awa", LastName: "Diop",
	}
	testSession = Session{Token: "tok", ExpiresAt: time.Date(2026, 10, 27, 0, 0, 0, 0, time.UTC)}
)

func (f *fakeAccounts) Register(_ context.Context, input RegisterInput) (User, Session, error) {
	f.gotRegister = input
	return testUser, testSession, f.err
}

func (f *fakeAccounts) Login(_ context.Context, email, password string) (User, Session, error) {
	f.gotEmail, f.gotPassword = email, password
	return testUser, testSession, f.err
}

func (f *fakeAccounts) Logout(_ context.Context, token string) error {
	f.gotToken = token
	return f.err
}

func (f *fakeAccounts) Authenticate(_ context.Context, token string) (User, error) {
	if token != validToken {
		return User{}, ErrUnauthenticated
	}
	return testUser, nil
}

func (f *fakeAccounts) ResendVerification(context.Context, User) error {
	f.resent = true
	return f.err
}

func (f *fakeAccounts) VerifyEmail(_ context.Context, token string) error {
	f.gotToken = token
	return f.err
}

func (f *fakeAccounts) RequestPasswordReset(_ context.Context, email string) error {
	f.gotEmail = email
	return f.err
}

func (f *fakeAccounts) ResetPassword(_ context.Context, token, password string) error {
	f.gotToken, f.gotPassword = token, password
	return f.err
}

type response struct {
	Success bool            `json:"success"`
	Data    json.RawMessage `json:"data"`
	Error   *struct {
		Code    string            `json:"code"`
		Message string            `json:"message"`
		Fields  map[string]string `json:"fields"`
	} `json:"error"`
}

func generousLimiters() Limiters {
	return Limiters{
		PerClient: httpx.NewRateLimiter(100, 100, time.Minute),
		PerEmail:  httpx.NewRateLimiter(100, 100, time.Minute),
		PerUser:   httpx.NewRateLimiter(100, 100, time.Minute),
	}
}

func newRouter(accounts Accounts, limiters Limiters) *gin.Engine {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	NewHandler(accounts, limiters, func(c *gin.Context) string { return c.ClientIP() }).Register(router.Group("/v1"))
	return router
}

func call(t *testing.T, router http.Handler, method, path, body, token string) (int, response) {
	t.Helper()
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	var decoded response
	if err := json.Unmarshal(rec.Body.Bytes(), &decoded); err != nil {
		t.Fatalf("%s %s: decode %q: %v", method, path, rec.Body.String(), err)
	}
	return rec.Code, decoded
}

func TestRegisterReturnsUserAndSession(t *testing.T) {
	accounts := &fakeAccounts{}

	status, body := call(t, newRouter(accounts, generousLimiters()), http.MethodPost, "/v1/auth/register",
		`{"email":"awa@example.sn","password":"correct horse","firstName":"Awa","lastName":"Diop"}`, "")

	if status != http.StatusCreated || !body.Success {
		t.Fatalf("status %d body %+v", status, body)
	}
	want := RegisterInput{Email: "awa@example.sn", Password: "correct horse", FirstName: "Awa", LastName: "Diop"}
	if accounts.gotRegister != want {
		t.Errorf("input = %+v", accounts.gotRegister)
	}
	for _, fragment := range []string{`"token":"tok"`, `"expiresAt":"2026-10-27T00:00:00Z"`, `"firstName":"Awa"`, `"emailVerified":false`} {
		if !strings.Contains(string(body.Data), fragment) {
			t.Errorf("data %s missing %s", body.Data, fragment)
		}
	}
	if strings.Contains(string(body.Data), "password") {
		t.Error("response must never contain password data")
	}
}

func TestDomainErrorsMapToStatusAndCode(t *testing.T) {
	tests := []struct {
		err    error
		status int
		code   string
		field  string
	}{
		{&ValidationError{Fields: map[string]string{"email": "Invalide."}}, http.StatusUnprocessableEntity, "validation_failed", "email"},
		{ErrEmailTaken, http.StatusConflict, "email_taken", "email"},
		{ErrInvalidToken, http.StatusBadRequest, "invalid_token", ""},
		{ErrEmailDelivery, http.StatusServiceUnavailable, "email_delivery_failed", ""},
		{errors.New("db down"), http.StatusInternalServerError, "internal_error", ""},
	}
	for _, tt := range tests {
		t.Run(tt.code, func(t *testing.T) {
			status, body := call(t, newRouter(&fakeAccounts{err: tt.err}, generousLimiters()), http.MethodPost,
				"/v1/auth/register", `{"email":"a@b.sn"}`, "")

			if status != tt.status || body.Error == nil || body.Error.Code != tt.code {
				t.Fatalf("status %d body %+v", status, body)
			}
			if tt.field != "" && body.Error.Fields[tt.field] == "" {
				t.Errorf("fields = %v, want %s", body.Error.Fields, tt.field)
			}
		})
	}
}

func TestLoginEndpoint(t *testing.T) {
	accounts := &fakeAccounts{}
	router := newRouter(accounts, generousLimiters())

	status, _ := call(t, router, http.MethodPost, "/v1/auth/login", `{"email":"awa@example.sn","password":"pw"}`, "")
	if status != http.StatusOK || accounts.gotEmail != "awa@example.sn" || accounts.gotPassword != "pw" {
		t.Fatalf("status %d, got %q/%q", status, accounts.gotEmail, accounts.gotPassword)
	}

	accounts.err = ErrInvalidCredentials
	status, body := call(t, router, http.MethodPost, "/v1/auth/login", `{"email":"awa@example.sn","password":"bad"}`, "")
	if status != http.StatusUnauthorized || body.Error.Code != "invalid_credentials" {
		t.Fatalf("status %d body %+v", status, body)
	}
}

func TestMalformedBodiesAreRejected(t *testing.T) {
	bodies := []string{``, `not json`, `{"email":"a@b.sn","extra":1}`, `{"email":"a"} {"email":"b"}`}
	router := newRouter(&fakeAccounts{}, generousLimiters())

	for _, body := range bodies {
		status, decoded := call(t, router, http.MethodPost, "/v1/auth/login", body, "")
		if status != http.StatusBadRequest || decoded.Error.Code != "bad_request" {
			t.Errorf("body %q: status %d", body, status)
		}
	}
}

func TestAuthenticatedRoutesRequireAValidBearerToken(t *testing.T) {
	accounts := &fakeAccounts{}
	router := newRouter(accounts, generousLimiters())

	for _, token := range []string{"", "wrong"} {
		status, body := call(t, router, http.MethodGet, "/v1/auth/me", "", token)
		if status != http.StatusUnauthorized || body.Error.Code != "unauthenticated" {
			t.Errorf("token %q: status %d", token, status)
		}
	}

	status, body := call(t, router, http.MethodGet, "/v1/auth/me", "", validToken)
	if status != http.StatusOK || !strings.Contains(string(body.Data), `"email":"awa@example.sn"`) {
		t.Fatalf("me: %d %s", status, body.Data)
	}
	status, _ = call(t, router, http.MethodPost, "/v1/auth/email/verification", "", validToken)
	if status != http.StatusOK || !accounts.resent {
		t.Errorf("resend: %d, resent %v", status, accounts.resent)
	}
}

func TestLogoutRevokesTheBearerToken(t *testing.T) {
	accounts := &fakeAccounts{}

	status, _ := call(t, newRouter(accounts, generousLimiters()), http.MethodPost, "/v1/auth/logout", "", "some-token")

	if status != http.StatusOK || accounts.gotToken != "some-token" {
		t.Fatalf("status %d token %q", status, accounts.gotToken)
	}
}

func TestEmailLinkEndpoints(t *testing.T) {
	accounts := &fakeAccounts{}
	router := newRouter(accounts, generousLimiters())

	if status, _ := call(t, router, http.MethodPost, "/v1/auth/email/verify", `{"token":"abc"}`, ""); status != http.StatusOK || accounts.gotToken != "abc" {
		t.Errorf("verify: %d %q", status, accounts.gotToken)
	}
	if status, _ := call(t, router, http.MethodPost, "/v1/auth/password/forgot", `{"email":"x@y.sn"}`, ""); status != http.StatusOK || accounts.gotEmail != "x@y.sn" {
		t.Errorf("forgot: %d %q", status, accounts.gotEmail)
	}
	status, _ := call(t, router, http.MethodPost, "/v1/auth/password/reset", `{"token":"t","password":"new secret"}`, "")
	if status != http.StatusOK || accounts.gotToken != "t" || accounts.gotPassword != "new secret" {
		t.Errorf("reset: %d %q %q", status, accounts.gotToken, accounts.gotPassword)
	}
}

func TestPerEmailBudgetBlocksRepeatedLoginsOnOneAddress(t *testing.T) {
	limiters := generousLimiters()
	limiters.PerEmail = httpx.NewRateLimiter(0.001, 2, time.Minute)
	router := newRouter(&fakeAccounts{err: ErrInvalidCredentials}, limiters)
	login := func(email string) int {
		status, _ := call(t, router, http.MethodPost, "/v1/auth/login", `{"email":"`+email+`","password":"x"}`, "")
		return status
	}

	login("awa@example.sn")
	login("AWA@example.sn ")
	if status := login("awa@example.sn"); status != http.StatusTooManyRequests {
		t.Fatalf("third attempt on the same address: %d, want 429", status)
	}
	if status := login("other@example.sn"); status != http.StatusUnauthorized {
		t.Fatalf("other address: %d, want 401", status)
	}
}

func TestPerClientBudgetBlocksSignupSpam(t *testing.T) {
	limiters := generousLimiters()
	limiters.PerClient = httpx.NewRateLimiter(0.001, 1, time.Minute)
	router := newRouter(&fakeAccounts{}, limiters)

	call(t, router, http.MethodPost, "/v1/auth/register", `{}`, "")
	status, body := call(t, router, http.MethodPost, "/v1/auth/register", `{}`, "")

	if status != http.StatusTooManyRequests || body.Error.Code != "rate_limited" {
		t.Fatalf("status %d body %+v", status, body)
	}
}

func TestPerUserBudgetLimitsVerificationResends(t *testing.T) {
	limiters := generousLimiters()
	limiters.PerUser = httpx.NewRateLimiter(0.001, 1, time.Minute)
	router := newRouter(&fakeAccounts{}, limiters)

	call(t, router, http.MethodPost, "/v1/auth/email/verification", "", validToken)
	status, _ := call(t, router, http.MethodPost, "/v1/auth/email/verification", "", validToken)

	if status != http.StatusTooManyRequests {
		t.Fatalf("status %d, want 429", status)
	}
}

func TestNewLimitersCoversEveryBudget(t *testing.T) {
	for i, limiter := range NewLimiters(time.Minute).All() {
		if limiter == nil {
			t.Errorf("limiter %d is nil", i)
		}
	}
}
