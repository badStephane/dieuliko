package admin

import (
	"bytes"
	"context"
	"errors"
	"image"
	"image/png"
	"log/slog"
	"maps"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"slices"
	"strings"
	"testing"

	"github.com/badStephane/dieuliko/apps/api/internal/company"
)

func pngLogo(t *testing.T) []byte {
	t.Helper()
	var buf bytes.Buffer
	if err := png.Encode(&buf, image.NewRGBA(image.Rect(0, 0, 32, 32))); err != nil {
		t.Fatalf("encode: %v", err)
	}
	return buf.Bytes()
}

func TestSetLogoStoresTheFileReplacesThePreviousOneAndIsAudited(t *testing.T) {
	resetDB(t)
	store := &memStore{objects: map[string][]byte{}}
	service := NewCompanyService(testPool, store, slog.New(slog.DiscardHandler))
	adminID := newUser(t, "admin", "Admin")
	ctx := context.Background()
	created, err := service.Create(ctx, adminID, validCompany())
	if err != nil {
		t.Fatalf("create: %v", err)
	}

	first, err := service.SetLogo(ctx, adminID, created.Slug, pngLogo(t))
	if err != nil {
		t.Fatalf("set logo: %v", err)
	}
	second, err := service.SetLogo(ctx, adminID, created.Slug, pngLogo(t))
	if err != nil {
		t.Fatalf("replace logo: %v", err)
	}

	if first.LogoVersion == nil || second.LogoVersion == nil || *first.LogoVersion == *second.LogoVersion {
		t.Fatalf("versions = %v, %v", first.LogoVersion, second.LogoVersion)
	}
	if len(store.objects) != 1 || store.objects["logos/"+*second.LogoVersion] == nil {
		t.Errorf("stored objects = %v, want only the second logo", slices.Collect(maps.Keys(store.objects)))
	}
	key, err := service.LogoKey(ctx, created.Slug)
	if err != nil || key == nil || *key != "logos/"+*second.LogoVersion {
		t.Errorf("LogoKey = %v, %v", key, err)
	}

	removed, err := service.RemoveLogo(ctx, adminID, created.Slug)
	if err != nil || removed.LogoVersion != nil || len(store.objects) != 0 {
		t.Fatalf("remove: %v, version %v, objects %d", err, removed.LogoVersion, len(store.objects))
	}
	if _, err := service.RemoveLogo(ctx, adminID, created.Slug); err != nil {
		t.Errorf("removing a missing logo: %v", err)
	}

	actions, _ := audit(t, created.Slug)
	want := []string{"company.create", "company.logo_set", "company.logo_set", "company.logo_remove"}
	if !slices.Equal(actions, want) {
		t.Errorf("audit = %v, want %v", actions, want)
	}
}

func TestSetLogoRejectsBadFilesAndUnknownListings(t *testing.T) {
	resetDB(t)
	store := &memStore{objects: map[string][]byte{}}
	service := NewCompanyService(testPool, store, slog.New(slog.DiscardHandler))
	adminID := newUser(t, "admin", "Admin")
	ctx := context.Background()

	_, err := service.SetLogo(ctx, adminID, "inconnue", []byte("<svg></svg>"))
	var invalid *ValidationError
	if !errors.As(err, &invalid) || invalid.Fields["file"] == "" {
		t.Errorf("svg: err = %v", err)
	}
	if _, err := service.SetLogo(ctx, adminID, "inconnue", pngLogo(t)); !errors.Is(err, company.ErrNotFound) {
		t.Errorf("unknown listing: err = %v", err)
	}
	if len(store.objects) != 0 {
		t.Errorf("a refused logo left %d files behind", len(store.objects))
	}
	if _, err := service.LogoKey(ctx, "inconnue"); err == nil {
		t.Error("LogoKey of an unknown listing did not fail")
	}
}

func multipartLogo(t *testing.T, field string, content []byte) (*bytes.Buffer, string) {
	t.Helper()
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	part, err := writer.CreateFormFile(field, "logo.png")
	if err != nil {
		t.Fatalf("form file: %v", err)
	}
	if _, err := part.Write(content); err != nil {
		t.Fatalf("write: %v", err)
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("close: %v", err)
	}
	return &body, writer.FormDataContentType()
}

func sendMultipart(router http.Handler, path string, body *bytes.Buffer, contentType string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodPut, path, body)
	req.Header.Set("Content-Type", contentType)
	req.Header.Set("Authorization", "Bearer "+adminToken)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	return rec
}

func TestUploadLogoRouteReadsTheFilePart(t *testing.T) {
	companies := &fakeCompanies{}
	router := newRouter(Services{Companies: companies})

	body, contentType := multipartLogo(t, "file", []byte("image"))
	rec := sendMultipart(router, "/v1/admin/companies/cabinet-ndiaye/logo", body, contentType)

	if rec.Code != http.StatusOK || companies.gotSlug != "cabinet-ndiaye" || string(companies.gotContent) != "image" {
		t.Errorf("status %d slug %q content %q", rec.Code, companies.gotSlug, companies.gotContent)
	}

	body, contentType = multipartLogo(t, "other", []byte("image"))
	if rec := sendMultipart(router, "/v1/admin/companies/cabinet-ndiaye/logo", body, contentType); rec.Code != http.StatusUnprocessableEntity {
		t.Errorf("no file part: status %d, want 422", rec.Code)
	}
	if rec := send(router, http.MethodPut, "/v1/admin/companies/cabinet-ndiaye/logo", adminToken, `{}`); rec.Code != http.StatusBadRequest {
		t.Errorf("json body: status %d, want 400", rec.Code)
	}
}

func TestUploadLogoRouteRefusesOversizedBodies(t *testing.T) {
	router := newRouter(Services{Companies: &fakeCompanies{}})

	body, contentType := multipartLogo(t, "file", make([]byte, 3<<20))
	rec := sendMultipart(router, "/v1/admin/companies/cabinet-ndiaye/logo", body, contentType)

	if rec.Code != http.StatusUnprocessableEntity || !strings.Contains(rec.Body.String(), "2 Mo") {
		t.Errorf("status %d body %s", rec.Code, rec.Body.String())
	}
}

func TestLogoRoutesServeAndRemove(t *testing.T) {
	key := "logos/0b0b0b0b-0b0b-0b0b-0b0b-0b0b0b0b0b0b.png"
	store := &memStore{objects: map[string][]byte{key: []byte("png-bytes")}}
	companies := &fakeCompanies{logoKey: &key}
	router := newRouter(Services{Companies: companies, Logos: store})

	rec := send(router, http.MethodGet, "/v1/admin/companies/cabinet-ndiaye/logo", adminToken, "")
	if rec.Code != http.StatusOK || rec.Body.String() != "png-bytes" || rec.Header().Get("Content-Type") != "image/png" ||
		rec.Header().Get("Cache-Control") != "private, no-store" {
		t.Errorf("get: status %d type %q cache %q", rec.Code, rec.Header().Get("Content-Type"), rec.Header().Get("Cache-Control"))
	}
	if rec := send(router, http.MethodDelete, "/v1/admin/companies/cabinet-ndiaye/logo", adminToken, ""); rec.Code != http.StatusOK {
		t.Errorf("delete: status %d", rec.Code)
	}
	companies.logoKey = nil
	if rec := send(router, http.MethodGet, "/v1/admin/companies/cabinet-ndiaye/logo", adminToken, ""); rec.Code != http.StatusNotFound {
		t.Errorf("no logo: status %d, want 404", rec.Code)
	}
}
