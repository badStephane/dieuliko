// Package logo checks the company logos uploaded in the back-office and serves them from object storage. Each upload
// gets a new key, so the version derived from it changes the logo URL and caches never show an old logo.
package logo

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"image"
	_ "image/jpeg" // registers the decoder used by image.DecodeConfig
	_ "image/png"  // idem
	"io"
	"net/http"
	"path"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"github.com/badStephane/dieuliko/apps/api/internal/httpx"
	"github.com/badStephane/dieuliko/apps/api/internal/storage"
)

// Limits of an uploaded logo.
const (
	MaxBytes = 2 << 20
	MaxSide  = 4096
)

// Messages shown under the logo field.
const (
	MsgEmpty      = "Le fichier est vide."
	MsgTooLarge   = "Le logo ne doit pas dépasser 2 Mo."
	MsgFormat     = "Le logo doit être une image PNG, JPEG ou WebP."
	MsgUnreadable = "Cette image est illisible."
	MsgTooBig     = "Le logo ne doit pas dépasser 4096 × 4096 pixels."
)

const keyPrefix = "logos/"

// Cache lifetimes: a versioned URL never changes content; an unversioned one may, after an upload.
const (
	cacheVersioned   = "public, max-age=31536000, immutable"
	cacheUnversioned = "public, max-age=300"
)

// Format is an accepted image type.
type Format struct {
	ContentType string
	Extension   string
}

var formats = []Format{
	{ContentType: "image/png", Extension: "png"},
	{ContentType: "image/jpeg", Extension: "jpg"},
	{ContentType: "image/webp", Extension: "webp"},
}

// InvalidError explains, in French, why a file is not an acceptable logo.
type InvalidError struct {
	Message string
}

func (e *InvalidError) Error() string { return "invalid logo: " + e.Message }

// Validate identifies the image by its content (never by the claimed type or name). SVG is refused: it can carry
// scripts. PNG and JPEG are decoded far enough to check their size; WebP has no decoder in the standard library.
func Validate(content []byte) (Format, error) {
	switch {
	case len(content) == 0:
		return Format{}, &InvalidError{Message: MsgEmpty}
	case len(content) > MaxBytes:
		return Format{}, &InvalidError{Message: MsgTooLarge}
	}
	sniffed := http.DetectContentType(content)
	for _, format := range formats {
		if format.ContentType != sniffed {
			continue
		}
		if format.Extension == "webp" {
			return format, nil
		}
		config, _, err := image.DecodeConfig(bytes.NewReader(content))
		if err != nil {
			return Format{}, &InvalidError{Message: MsgUnreadable}
		}
		if config.Width > MaxSide || config.Height > MaxSide {
			return Format{}, &InvalidError{Message: MsgTooBig}
		}
		return format, nil
	}
	return Format{}, &InvalidError{Message: MsgFormat}
}

// NewKey returns a fresh storage key, matching the CHECK constraint on companies.logo_key.
func NewKey(format Format) string {
	return keyPrefix + uuid.NewString() + "." + format.Extension
}

// VersionOf is what identifies a stored logo in its URL (nil when there is none).
func VersionOf(key *string) *string {
	if key == nil {
		return nil
	}
	version := strings.TrimPrefix(*key, keyPrefix)
	return &version
}

// ContentType is the media type of a stored logo, from its key.
func ContentType(key string) string {
	extension := strings.TrimPrefix(path.Ext(key), ".")
	for _, format := range formats {
		if format.Extension == extension {
			return format.ContentType
		}
	}
	return "application/octet-stream"
}

// ReadAll reads at most MaxBytes+1 bytes, so Validate can tell a file that is too large.
func ReadAll(r io.Reader) ([]byte, error) {
	return io.ReadAll(io.LimitReader(r, MaxBytes+1))
}

// Serve streams the logo stored under key, 404 when there is none. Public logos are cached by browsers and
// proxies; the back-office's are not (a hidden listing's logo must not linger in shared caches).
func Serve(c *gin.Context, store storage.Store, key *string, public bool) {
	if key == nil {
		notFound(c)
		return
	}
	body, err := store.Get(c.Request.Context(), *key)
	if errors.Is(err, storage.ErrNotFound) {
		notFound(c)
		return
	}
	if err != nil {
		httpx.InternalError(c, fmt.Errorf("open logo %q: %w", *key, err))
		return
	}
	defer func() { _ = body.Close() }()
	c.Header("Cache-Control", cacheControl(c, public))
	c.Header("Content-Security-Policy", "default-src 'none'; sandbox")
	c.DataFromReader(http.StatusOK, -1, ContentType(*key), body, nil)
}

func cacheControl(c *gin.Context, public bool) string {
	switch {
	case !public:
		return "private, no-store"
	case c.Query("v") != "":
		return cacheVersioned
	default:
		return cacheUnversioned
	}
}

func notFound(c *gin.Context) {
	httpx.Fail(c, http.StatusNotFound, httpx.CodeNotFound, "Logo introuvable.")
}

// ErrNoListing is returned by a KeyReader when no listing it may show has the slug.
var ErrNoListing = errors.New("logo: no listing")

// KeyReader finds the logo key of a listing: nil when it has no logo, ErrNoListing when there is no such listing.
type KeyReader func(ctx context.Context, slug string) (*string, error)

// Get answers a logo request for the listing named by the :slug parameter.
func Get(c *gin.Context, keys KeyReader, store storage.Store, public bool) {
	key, err := keys(c.Request.Context(), c.Param("slug"))
	if errors.Is(err, ErrNoListing) {
		notFound(c)
		return
	}
	if err != nil {
		httpx.InternalError(c, err)
		return
	}
	Serve(c, store, key, public)
}

// Handler serves the logos of the public directory; hidden listings have none.
type Handler struct {
	keys  KeyReader
	store storage.Store
}

// NewHandler builds the public logo handler.
func NewHandler(keys KeyReader, store storage.Store) *Handler {
	return &Handler{keys: keys, store: store}
}

// Register mounts GET /companies/:slug/logo on a router group (e.g. /v1).
func (h *Handler) Register(group *gin.RouterGroup) {
	group.GET("/companies/:slug/logo", func(c *gin.Context) { Get(c, h.keys, h.store, true) })
}
