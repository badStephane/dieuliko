package logo

import (
	"bytes"
	"context"
	"errors"
	"image"
	"image/color"
	"image/jpeg"
	"image/png"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"

	"github.com/badStephane/dieuliko/apps/api/internal/storage"
)

func encodePNG(t *testing.T, width, height int) []byte {
	t.Helper()
	var buf bytes.Buffer
	img := image.NewRGBA(image.Rect(0, 0, width, height))
	img.Set(0, 0, color.RGBA{R: 255, A: 255})
	if err := png.Encode(&buf, img); err != nil {
		t.Fatalf("encode png: %v", err)
	}
	return buf.Bytes()
}

func encodeJPEG(t *testing.T) []byte {
	t.Helper()
	var buf bytes.Buffer
	if err := jpeg.Encode(&buf, image.NewRGBA(image.Rect(0, 0, 16, 16)), nil); err != nil {
		t.Fatalf("encode jpeg: %v", err)
	}
	return buf.Bytes()
}

// minimalWebP is a RIFF/WEBP header, enough for content sniffing.
var minimalWebP = append([]byte("RIFF\x1a\x00\x00\x00WEBPVP8L"), make([]byte, 16)...)

func TestValidateAcceptsPNGJPEGAndWebP(t *testing.T) {
	cases := []struct {
		name    string
		content []byte
		want    Format
	}{
		{"png", encodePNG(t, 64, 64), Format{ContentType: "image/png", Extension: "png"}},
		{"jpeg", encodeJPEG(t), Format{ContentType: "image/jpeg", Extension: "jpg"}},
		{"webp", minimalWebP, Format{ContentType: "image/webp", Extension: "webp"}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, err := Validate(tc.content)
			if err != nil {
				t.Fatalf("Validate: %v", err)
			}
			if got != tc.want {
				t.Errorf("format = %+v, want %+v", got, tc.want)
			}
		})
	}
}

func TestValidateRejectsBadFiles(t *testing.T) {
	cases := []struct {
		name    string
		content []byte
		want    string
	}{
		{"empty", nil, MsgEmpty},
		{"too large", append(encodePNG(t, 1, 1), make([]byte, MaxBytes)...), MsgTooLarge},
		{"svg", []byte(`<svg xmlns="http://www.w3.org/2000/svg"></svg>`), MsgFormat},
		{"pdf", []byte("%PDF-1.7\n"), MsgFormat},
		{"truncated png", encodePNG(t, 8, 8)[:20], MsgUnreadable},
		{"too wide", encodePNG(t, MaxSide+1, 1), MsgTooBig},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			_, err := Validate(tc.content)
			var invalid *InvalidError
			if !errors.As(err, &invalid) {
				t.Fatalf("err = %v, want InvalidError", err)
			}
			if invalid.Message != tc.want {
				t.Errorf("message = %q, want %q", invalid.Message, tc.want)
			}
		})
	}
}

func TestNewKeyMatchesTheDatabaseConstraintAndGivesAVersion(t *testing.T) {
	key := NewKey(Format{ContentType: "image/png", Extension: "png"})
	if !strings.HasPrefix(key, "logos/") || !strings.HasSuffix(key, ".png") || len(key) != len("logos/")+36+len(".png") {
		t.Fatalf("key = %q", key)
	}
	if other := NewKey(Format{ContentType: "image/png", Extension: "png"}); other == key {
		t.Error("two uploads got the same key")
	}
	if got := ContentType(key); got != "image/png" {
		t.Errorf("content type = %q", got)
	}
	if got := ContentType("logos/x.gif"); got != "application/octet-stream" {
		t.Errorf("unknown content type = %q", got)
	}
}

func TestVersionOf(t *testing.T) {
	if VersionOf(nil) != nil {
		t.Error("VersionOf(nil) != nil")
	}
	key := "logos/0b0b0b0b-0b0b-0b0b-0b0b-0b0b0b0b0b0b.webp"
	if got := VersionOf(&key); got == nil || *got != "0b0b0b0b-0b0b-0b0b-0b0b-0b0b0b0b0b0b.webp" {
		t.Errorf("VersionOf = %v", got)
	}
}

// fakeStore holds objects in memory; Put and Delete are never called by the handler.
type fakeStore struct {
	storage.Store
	objects map[string][]byte
}

func (f fakeStore) Get(_ context.Context, key string) (io.ReadCloser, error) {
	content, ok := f.objects[key]
	if !ok {
		return nil, storage.ErrNotFound
	}
	return io.NopCloser(bytes.NewReader(content)), nil
}

func TestPublicHandlerServesVisibleLogosWithCacheHeaders(t *testing.T) {
	key := "logos/0b0b0b0b-0b0b-0b0b-0b0b-0b0b0b0b0b0b.webp"
	keys := func(_ context.Context, slug string) (*string, error) {
		switch slug {
		case "with-logo":
			return &key, nil
		case "without-logo":
			return nil, nil
		case "missing-file":
			missing := "logos/ffffffff-ffff-ffff-ffff-ffffffffffff.png"
			return &missing, nil
		default:
			return nil, ErrNoListing
		}
	}
	gin.SetMode(gin.TestMode)
	router := gin.New()
	NewHandler(keys, fakeStore{objects: map[string][]byte{key: []byte("webp")}}).Register(router.Group("/v1"))
	get := func(target string) *httptest.ResponseRecorder {
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, target, nil))
		return rec
	}

	rec := get("/v1/companies/with-logo/logo?v=abc")
	if rec.Code != http.StatusOK || rec.Body.String() != "webp" || rec.Header().Get("Content-Type") != "image/webp" ||
		!strings.Contains(rec.Header().Get("Cache-Control"), "immutable") {
		t.Errorf("versioned: status %d type %q cache %q", rec.Code, rec.Header().Get("Content-Type"), rec.Header().Get("Cache-Control"))
	}
	if rec := get("/v1/companies/with-logo/logo"); rec.Header().Get("Cache-Control") != "public, max-age=300" {
		t.Errorf("unversioned cache = %q", rec.Header().Get("Cache-Control"))
	}
	for _, slug := range []string{"without-logo", "missing-file", "hidden-or-unknown"} {
		if rec := get("/v1/companies/" + slug + "/logo"); rec.Code != http.StatusNotFound {
			t.Errorf("%s: status %d, want 404", slug, rec.Code)
		}
	}
}
