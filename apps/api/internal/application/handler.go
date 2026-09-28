package application

import (
	"context"
	"errors"
	"net/http"
	"strconv"
	"time"
	"unicode/utf8"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"github.com/badStephane/dieuliko/apps/api/internal/auth"
	"github.com/badStephane/dieuliko/apps/api/internal/company"
	"github.com/badStephane/dieuliko/apps/api/internal/httpx"
)

// Error codes specific to applications (see httpx for the shared ones).
const (
	CodeEmailUnverified = "email_unverified"
	CodeAlreadyApplied  = "already_applied"
	CodeDailyLimit      = "daily_limit"
)

const (
	// maxApplyBodyBytes fits {"companySlug": "..."} with room to spare.
	maxApplyBodyBytes = 1 << 10
	maxSlugLength     = 120
	// Sends and withdrawals per candidate: 30 per hour on average, bursts of 5, on top of the daily cap.
	changesPerSecond = 30.0 / 3600
	changesBurst     = 5
)

// Applications is what the handler needs from Service (faked in tests).
type Applications interface {
	Apply(ctx context.Context, applicant Applicant, slug string) (Detail, error)
	List(ctx context.Context, userID uuid.UUID) ([]Application, error)
	Get(ctx context.Context, userID, id uuid.UUID) (Detail, error)
	Withdraw(ctx context.Context, userID, id uuid.UUID) error
}

// NewLimiter budgets sends and withdrawals per candidate; idle buckets are kept for idleTTL.
func NewLimiter(idleTTL time.Duration) *httpx.RateLimiter {
	return httpx.NewRateLimiter(changesPerSecond, changesBurst, idleTTL)
}

// Handler serves /me/applications.
type Handler struct {
	applications Applications
	limiter      *httpx.RateLimiter
}

// NewHandler builds the handler.
func NewHandler(applications Applications, limiter *httpx.RateLimiter) *Handler {
	return &Handler{applications: applications, limiter: limiter}
}

// Register mounts the routes on a router group (e.g. /v1) behind the session and candidate checks.
func (h *Handler) Register(group *gin.RouterGroup, requireUser, requireCandidate gin.HandlerFunc) {
	applications := group.Group("/me/applications", requireUser, requireCandidate)
	applications.GET("", h.list)
	applications.POST("", h.apply)
	applications.GET("/:id", h.get)
	applications.POST("/:id/withdraw", h.withdraw)
}

type applyRequest struct {
	CompanySlug string `json:"companySlug"`
}

func (h *Handler) apply(c *gin.Context) {
	user := auth.CurrentUser(c)
	if !h.allowChange(c, user.ID) {
		return
	}
	var req applyRequest
	if !httpx.BindJSONLimit(c, &req, maxApplyBodyBytes) {
		return
	}
	if req.CompanySlug == "" || utf8.RuneCountInString(req.CompanySlug) > maxSlugLength {
		httpx.FailFields(c, http.StatusUnprocessableEntity, httpx.CodeValidation, "Certains champs sont invalides.",
			map[string]string{"companySlug": "Choisissez une entreprise de l’annuaire."})
		return
	}
	applicant := Applicant{ID: user.ID, FirstName: user.FirstName, LastName: user.LastName, Email: user.Email, EmailVerified: user.EmailVerified}
	detail, err := h.applications.Apply(c.Request.Context(), applicant, req.CompanySlug)
	if err != nil {
		writeError(c, err)
		return
	}
	httpx.Created(c, detail)
}

func (h *Handler) list(c *gin.Context) {
	applications, err := h.applications.List(c.Request.Context(), auth.CurrentUser(c).ID)
	if err != nil {
		writeError(c, err)
		return
	}
	httpx.OK(c, applications)
}

func (h *Handler) get(c *gin.Context) {
	id, ok := applicationID(c)
	if !ok {
		return
	}
	detail, err := h.applications.Get(c.Request.Context(), auth.CurrentUser(c).ID, id)
	if err != nil {
		writeError(c, err)
		return
	}
	httpx.OK(c, detail)
}

func (h *Handler) withdraw(c *gin.Context) {
	userID := auth.CurrentUser(c).ID
	if !h.allowChange(c, userID) {
		return
	}
	id, ok := applicationID(c)
	if !ok {
		return
	}
	if err := h.applications.Withdraw(c.Request.Context(), userID, id); err != nil {
		writeError(c, err)
		return
	}
	httpx.OK(c, nil)
}

// allowChange spends one unit of the candidate's budget; it answers 429 when exhausted.
func (h *Handler) allowChange(c *gin.Context, userID uuid.UUID) bool {
	if h.limiter.Allow(userID.String()) {
		return true
	}
	c.Header("Retry-After", "60")
	httpx.Fail(c, http.StatusTooManyRequests, httpx.CodeRateLimited, "Trop de demandes. Réessayez dans quelques minutes.")
	return false
}

// applicationID reads the :id parameter; a malformed id is simply not found.
func applicationID(c *gin.Context) (uuid.UUID, bool) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		writeError(c, ErrNotFound)
		return uuid.UUID{}, false
	}
	return id, true
}

// writeError maps application errors to responses.
func writeError(c *gin.Context, err error) {
	var validation *ValidationError
	switch {
	case errors.As(err, &validation):
		httpx.FailFields(c, http.StatusUnprocessableEntity, httpx.CodeValidation, "Votre candidature est incomplète.", validation.Fields)
	case errors.Is(err, ErrEmailUnverified):
		httpx.Fail(c, http.StatusForbidden, CodeEmailUnverified, "Confirmez d’abord votre adresse email pour envoyer une candidature.")
	case errors.Is(err, company.ErrNotFound):
		httpx.Fail(c, http.StatusNotFound, httpx.CodeNotFound, "Cette entreprise n’existe pas dans l’annuaire.")
	case errors.Is(err, ErrNotFound):
		httpx.Fail(c, http.StatusNotFound, httpx.CodeNotFound, "Cette candidature est introuvable.")
	case errors.Is(err, ErrAlreadyApplied):
		httpx.Fail(c, http.StatusConflict, CodeAlreadyApplied, "Vous avez déjà une candidature en cours auprès de cette entreprise.")
	case errors.Is(err, ErrDailyLimit):
		c.Header("Retry-After", strconv.Itoa(int(dailyWindow.Seconds())))
		httpx.Fail(c, http.StatusTooManyRequests, CodeDailyLimit,
			"Vous avez envoyé "+strconv.Itoa(MaxPerDay)+" candidatures en 24 heures : c’est le maximum. Réessayez demain.")
	default:
		httpx.InternalError(c, err)
	}
}
