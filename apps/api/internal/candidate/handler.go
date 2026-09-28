package candidate

import (
	"context"
	"errors"
	"io"
	"mime"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"github.com/badStephane/dieuliko/apps/api/internal/auth"
	"github.com/badStephane/dieuliko/apps/api/internal/httpx"
)

// Error codes specific to candidates (see httpx for the shared ones).
const CodeNoCV = "no_cv"

const (
	// MaxProfileBodyBytes fits a profile at every limit of validate.go (multi-byte text included).
	MaxProfileBodyBytes = 256 << 10
	// maxMultipartOverhead covers multipart boundaries and headers around the CV file.
	maxMultipartOverhead = 64 << 10
	// Uploads per candidate: one per minute on average, bursts of 5.
	uploadsPerSecond = 1.0 / 60
	uploadBurst      = 5
)

// Profiles is what the handler needs from ProfileService (faked in tests).
type Profiles interface {
	Get(ctx context.Context, userID uuid.UUID) (Profile, error)
	Save(ctx context.Context, userID uuid.UUID, input ProfileInput) (Profile, error)
}

// CVs is what the handler needs from CVService (faked in tests).
type CVs interface {
	Get(ctx context.Context, userID uuid.UUID) (*CV, error)
	Upload(ctx context.Context, userID uuid.UUID, fileName string, content []byte) (CV, error)
	Open(ctx context.Context, userID uuid.UUID) (CV, io.ReadCloser, error)
	Delete(ctx context.Context, userID uuid.UUID) error
}

// NewUploadLimiter budgets CV uploads per candidate; idle buckets are kept for idleTTL.
func NewUploadLimiter(idleTTL time.Duration) *httpx.RateLimiter {
	return httpx.NewRateLimiter(uploadsPerSecond, uploadBurst, idleTTL)
}

// Handler serves the logged-in candidate's /me endpoints.
type Handler struct {
	profiles Profiles
	cvs      CVs
	uploads  *httpx.RateLimiter
}

// NewHandler builds the handler.
func NewHandler(profiles Profiles, cvs CVs, uploads *httpx.RateLimiter) *Handler {
	return &Handler{profiles: profiles, cvs: cvs, uploads: uploads}
}

// Register mounts the routes on a router group (e.g. /v1); requireUser authenticates the session
// (auth.RequireUser) and every route is then restricted to candidates.
func (h *Handler) Register(group *gin.RouterGroup, requireUser gin.HandlerFunc) {
	me := group.Group("/me", requireUser, requireCandidate)
	me.GET("/profile", h.getProfile)
	me.PUT("/profile", h.saveProfile)
	me.GET("/cv", h.getCV)
	me.PUT("/cv", h.uploadCV)
	me.GET("/cv/file", h.downloadCV)
	me.DELETE("/cv", h.deleteCV)
}

func requireCandidate(c *gin.Context) {
	if auth.CurrentUser(c).Role != auth.RoleCandidate {
		httpx.Fail(c, http.StatusForbidden, httpx.CodeForbidden, "Cet espace est réservé aux candidats.")
		return
	}
	c.Next()
}

func (h *Handler) getProfile(c *gin.Context) {
	profile, err := h.profiles.Get(c.Request.Context(), auth.CurrentUser(c).ID)
	if err != nil {
		writeError(c, err)
		return
	}
	httpx.OK(c, profile)
}

func (h *Handler) saveProfile(c *gin.Context) {
	var input ProfileInput
	if !httpx.BindJSONLimit(c, &input, MaxProfileBodyBytes) {
		return
	}
	profile, err := h.profiles.Save(c.Request.Context(), auth.CurrentUser(c).ID, input)
	if err != nil {
		writeError(c, err)
		return
	}
	httpx.OK(c, profile)
}

func (h *Handler) getCV(c *gin.Context) {
	cv, err := h.cvs.Get(c.Request.Context(), auth.CurrentUser(c).ID)
	if err != nil {
		writeError(c, err)
		return
	}
	httpx.OK(c, cv)
}

// uploadCV expects a multipart/form-data body whose "file" part is the PDF.
func (h *Handler) uploadCV(c *gin.Context) {
	userID := auth.CurrentUser(c).ID
	if !h.uploads.Allow(userID.String()) {
		c.Header("Retry-After", "60")
		httpx.Fail(c, http.StatusTooManyRequests, httpx.CodeRateLimited, "Trop d’envois de CV. Réessayez dans quelques minutes.")
		return
	}
	fileName, content, ok := readUploadedFile(c)
	if !ok {
		return
	}
	cv, err := h.cvs.Upload(c.Request.Context(), userID, fileName, content)
	if err != nil {
		writeError(c, err)
		return
	}
	httpx.OK(c, cv)
}

// readUploadedFile streams the multipart body up to its "file" part and reads at most one byte
// more than MaxCVBytes of it (the service rejects larger files). On failure it answers and returns false.
func readUploadedFile(c *gin.Context) (string, []byte, bool) {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, MaxCVBytes+maxMultipartOverhead)
	reader, err := c.Request.MultipartReader()
	if err != nil {
		httpx.Fail(c, http.StatusBadRequest, httpx.CodeBadRequest, "Envoyez le CV dans un formulaire (multipart/form-data).")
		return "", nil, false
	}
	for {
		part, err := reader.NextPart()
		if errors.Is(err, io.EOF) {
			failFile(c, "Choisissez un fichier PDF.")
			return "", nil, false
		}
		if err != nil {
			failUploadRead(c, err)
			return "", nil, false
		}
		if part.FormName() != fileField {
			continue // NextPart discards the unread rest of this part
		}
		content, err := io.ReadAll(io.LimitReader(part, MaxCVBytes+1))
		if err != nil {
			failUploadRead(c, err)
			return "", nil, false
		}
		return part.FileName(), content, true
	}
}

func failUploadRead(c *gin.Context, err error) {
	var tooLarge *http.MaxBytesError
	if errors.As(err, &tooLarge) {
		failFile(c, msgCVTooLarge)
		return
	}
	httpx.Fail(c, http.StatusBadRequest, httpx.CodeBadRequest, "Requête invalide.")
}

func failFile(c *gin.Context, message string) {
	httpx.FailFields(c, http.StatusUnprocessableEntity, httpx.CodeValidation, message, map[string]string{fileField: message})
}

// downloadCV streams the PDF; it is only ever served as an attachment, never rendered by the API origin.
func (h *Handler) downloadCV(c *gin.Context) {
	cv, body, err := h.cvs.Open(c.Request.Context(), auth.CurrentUser(c).ID)
	if err != nil {
		writeError(c, err)
		return
	}
	defer func() { _ = body.Close() }()
	c.Header("Cache-Control", "private, no-store")
	c.DataFromReader(http.StatusOK, int64(cv.SizeBytes), pdfContentType, body, map[string]string{
		"Content-Disposition": mime.FormatMediaType("attachment", map[string]string{"filename": cv.FileName}),
	})
}

func (h *Handler) deleteCV(c *gin.Context) {
	if err := h.cvs.Delete(c.Request.Context(), auth.CurrentUser(c).ID); err != nil {
		writeError(c, err)
		return
	}
	httpx.OK(c, nil)
}

// writeError maps domain errors to responses; anything unexpected is a logged 500.
func writeError(c *gin.Context, err error) {
	var validation *ValidationError
	switch {
	case errors.As(err, &validation):
		httpx.FailFields(c, http.StatusUnprocessableEntity, httpx.CodeValidation,
			"Certains champs sont invalides.", validation.Fields)
	case errors.Is(err, ErrNoCV):
		httpx.Fail(c, http.StatusNotFound, CodeNoCV, "Vous n’avez pas encore déposé de CV.")
	default:
		httpx.InternalError(c, err)
	}
}
