package auth

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/badStephane/dieuliko/apps/api/internal/httpx"
)

// Error codes specific to authentication (see httpx for the shared ones).
const (
	CodeEmailTaken         = "email_taken"
	CodeInvalidCredentials = "invalid_credentials"
	CodeUnauthenticated    = "unauthenticated"
	CodeInvalidToken       = "invalid_token"
	CodeEmailDelivery      = "email_delivery_failed"
	CodeAccountSuspended   = "account_suspended"
)

const userContextKey = "auth.user"

// Accounts is what the handler needs from the Service (faked in tests).
type Accounts interface {
	Register(ctx context.Context, input RegisterInput) (User, Session, error)
	Login(ctx context.Context, email, password string) (User, Session, error)
	Logout(ctx context.Context, token string) error
	Authenticate(ctx context.Context, token string) (User, error)
	ResendVerification(ctx context.Context, user User) error
	VerifyEmail(ctx context.Context, token string) error
	RequestPasswordReset(ctx context.Context, email string) error
	ResetPassword(ctx context.Context, token, password string) error
}

// Limiters throttle abuse-prone endpoints on top of the global API rate limit.
type Limiters struct {
	// PerClient budgets sensitive actions per end-user IP (credential stuffing, signup spam).
	PerClient *httpx.RateLimiter
	// PerEmail budgets login and reset attempts per target address (targeted brute force, mail bombing).
	PerEmail *httpx.RateLimiter
	// PerUser budgets verification email resends per account.
	PerUser *httpx.RateLimiter
}

// Default budgets: 10 sensitive actions per minute per IP, 5 login or reset attempts per 15 minutes
// per address, one verification resend per minute per account (bursts of 10, 5 and 2).
const (
	perClientPerSecond = 10.0 / 60
	perClientBurst     = 10
	perEmailPerSecond  = 5.0 / (15 * 60)
	perEmailBurst      = 5
	perUserPerSecond   = 1.0 / 60
	perUserBurst       = 2
)

// NewLimiters returns the default budgets; idle buckets are kept for idleTTL.
func NewLimiters(idleTTL time.Duration) Limiters {
	return Limiters{
		PerClient: httpx.NewRateLimiter(perClientPerSecond, perClientBurst, idleTTL),
		PerEmail:  httpx.NewRateLimiter(perEmailPerSecond, perEmailBurst, idleTTL),
		PerUser:   httpx.NewRateLimiter(perUserPerSecond, perUserBurst, idleTTL),
	}
}

// All lists the limiters (for periodic eviction).
func (l Limiters) All() []*httpx.RateLimiter {
	return []*httpx.RateLimiter{l.PerClient, l.PerEmail, l.PerUser}
}

// Handler serves /auth endpoints.
type Handler struct {
	accounts Accounts
	limiters Limiters
	clientIP func(*gin.Context) string
}

// NewHandler builds the handler; clientIP identifies the end user (see httpx.EndUserIP).
func NewHandler(accounts Accounts, limiters Limiters, clientIP func(*gin.Context) string) *Handler {
	return &Handler{accounts: accounts, limiters: limiters, clientIP: clientIP}
}

// Register mounts the routes on a router group (e.g. /v1).
func (h *Handler) Register(group *gin.RouterGroup) {
	auth := group.Group("/auth")
	perClient := h.limitPerClient()
	auth.POST("/register", perClient, h.register)
	auth.POST("/login", perClient, h.login)
	auth.POST("/logout", h.logout)
	auth.POST("/email/verify", perClient, h.verifyEmail)
	auth.POST("/password/forgot", perClient, h.forgotPassword)
	auth.POST("/password/reset", perClient, h.resetPassword)

	authenticated := auth.Group("", RequireUser(h.accounts))
	authenticated.GET("/me", h.me)
	authenticated.POST("/email/verification", h.resendVerification)
}

// RequireUser rejects requests without a valid `Authorization: Bearer <session token>`.
func RequireUser(accounts Accounts) gin.HandlerFunc {
	return func(c *gin.Context) {
		user, err := accounts.Authenticate(c.Request.Context(), bearerToken(c))
		if err != nil {
			writeError(c, err)
			return
		}
		c.Set(userContextKey, user)
		c.Next()
	}
}

// CurrentUser returns the user set by RequireUser.
func CurrentUser(c *gin.Context) User {
	user, _ := c.MustGet(userContextKey).(User)
	return user
}

type registerRequest struct {
	Email     string `json:"email"`
	Password  string `json:"password"`
	FirstName string `json:"firstName"`
	LastName  string `json:"lastName"`
}

type credentialsRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type tokenRequest struct {
	Token string `json:"token"`
}

type emailRequest struct {
	Email string `json:"email"`
}

type resetRequest struct {
	Token    string `json:"token"`
	Password string `json:"password"`
}

type sessionResponse struct {
	User    User    `json:"user"`
	Session Session `json:"session"`
}

func (h *Handler) register(c *gin.Context) {
	var req registerRequest
	if !httpx.BindJSON(c, &req) {
		return
	}
	input := RegisterInput{Email: req.Email, Password: req.Password, FirstName: req.FirstName, LastName: req.LastName}
	user, session, err := h.accounts.Register(c.Request.Context(), input)
	if err != nil {
		writeError(c, err)
		return
	}
	httpx.Created(c, sessionResponse{User: user, Session: session})
}

func (h *Handler) login(c *gin.Context) {
	var req credentialsRequest
	if !httpx.BindJSON(c, &req) || !h.allowEmail(c, "login", req.Email) {
		return
	}
	user, session, err := h.accounts.Login(c.Request.Context(), req.Email, req.Password)
	if err != nil {
		writeError(c, err)
		return
	}
	httpx.OK(c, sessionResponse{User: user, Session: session})
}

func (h *Handler) logout(c *gin.Context) {
	if err := h.accounts.Logout(c.Request.Context(), bearerToken(c)); err != nil {
		httpx.InternalError(c, err)
		return
	}
	httpx.OK(c, nil)
}

func (h *Handler) me(c *gin.Context) {
	httpx.OK(c, CurrentUser(c))
}

func (h *Handler) resendVerification(c *gin.Context) {
	user := CurrentUser(c)
	if !h.limiters.PerUser.Allow(user.ID.String()) {
		failRateLimited(c)
		return
	}
	if err := h.accounts.ResendVerification(c.Request.Context(), user); err != nil {
		writeError(c, err)
		return
	}
	httpx.OK(c, nil)
}

func (h *Handler) verifyEmail(c *gin.Context) {
	var req tokenRequest
	if !httpx.BindJSON(c, &req) {
		return
	}
	if err := h.accounts.VerifyEmail(c.Request.Context(), req.Token); err != nil {
		writeError(c, err)
		return
	}
	httpx.OK(c, nil)
}

// forgotPassword always answers 200 so the response never reveals whether an account exists.
func (h *Handler) forgotPassword(c *gin.Context) {
	var req emailRequest
	if !httpx.BindJSON(c, &req) || !h.allowEmail(c, "reset", req.Email) {
		return
	}
	if err := h.accounts.RequestPasswordReset(c.Request.Context(), req.Email); err != nil {
		httpx.InternalError(c, err)
		return
	}
	httpx.OK(c, nil)
}

func (h *Handler) resetPassword(c *gin.Context) {
	var req resetRequest
	if !httpx.BindJSON(c, &req) {
		return
	}
	if err := h.accounts.ResetPassword(c.Request.Context(), req.Token, req.Password); err != nil {
		writeError(c, err)
		return
	}
	httpx.OK(c, nil)
}

func (h *Handler) limitPerClient() gin.HandlerFunc {
	return func(c *gin.Context) {
		if !h.limiters.PerClient.Allow(h.clientIP(c)) {
			failRateLimited(c)
			return
		}
		c.Next()
	}
}

// allowEmail applies the per-address budget of an action; it answers 429 when exhausted.
// The key is capped at the longest valid address so arbitrary input cannot bloat the limiter.
func (h *Handler) allowEmail(c *gin.Context, action, email string) bool {
	key := normalizeEmail(email)
	if len(key) > MaxEmailLength {
		key = key[:MaxEmailLength]
	}
	if h.limiters.PerEmail.Allow(action + ":" + key) {
		return true
	}
	failRateLimited(c)
	return false
}

func bearerToken(c *gin.Context) string {
	scheme, token, found := strings.Cut(c.GetHeader("Authorization"), " ")
	if !found || !strings.EqualFold(scheme, "Bearer") {
		return ""
	}
	return strings.TrimSpace(token)
}

func failRateLimited(c *gin.Context) {
	c.Header("Retry-After", "60")
	httpx.Fail(c, http.StatusTooManyRequests, httpx.CodeRateLimited, "Trop de tentatives. Réessayez dans quelques minutes.")
}

// writeError maps domain errors to responses; anything unexpected is a logged 500.
func writeError(c *gin.Context, err error) {
	var validation *ValidationError
	switch {
	case errors.As(err, &validation):
		httpx.FailFields(c, http.StatusUnprocessableEntity, httpx.CodeValidation,
			"Certains champs sont invalides.", validation.Fields)
	case errors.Is(err, ErrEmailTaken):
		httpx.FailFields(c, http.StatusConflict, CodeEmailTaken, "Un compte existe déjà avec cette adresse email.",
			map[string]string{"email": "Un compte existe déjà avec cette adresse email."})
	case errors.Is(err, ErrInvalidCredentials):
		httpx.Fail(c, http.StatusUnauthorized, CodeInvalidCredentials, "Email ou mot de passe incorrect.")
	case errors.Is(err, ErrAccountSuspended):
		httpx.Fail(c, http.StatusForbidden, CodeAccountSuspended, "Ce compte est suspendu. Contactez-nous pour en savoir plus.")
	case errors.Is(err, ErrUnauthenticated):
		httpx.Fail(c, http.StatusUnauthorized, CodeUnauthenticated, "Votre session a expiré. Reconnectez-vous.")
	case errors.Is(err, ErrInvalidToken):
		httpx.Fail(c, http.StatusBadRequest, CodeInvalidToken, "Ce lien est invalide ou a expiré.")
	case errors.Is(err, ErrEmailDelivery):
		_ = c.Error(err)
		httpx.Fail(c, http.StatusServiceUnavailable, CodeEmailDelivery, "L’email n’a pas pu être envoyé. Réessayez plus tard.")
	default:
		httpx.InternalError(c, err)
	}
}
