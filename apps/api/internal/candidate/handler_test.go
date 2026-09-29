package candidate

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"github.com/badStephane/dieuliko/apps/api/internal/auth"
	"github.com/badStephane/dieuliko/apps/api/internal/httpx"
)

const (
	candidateToken = "candidate-session"
	adminToken     = "admin-session"
	companyToken   = "company-session"
)

var (
	testCandidate = auth.User{ID: uuid.MustParse("00000000-0000-0000-0000-00000000000a"), Role: auth.RoleCandidate}
	testAdmin     = auth.User{ID: uuid.MustParse("00000000-0000-0000-0000-00000000000b"), Role: auth.RoleAdmin}
	testCV        = CV{FileName: "CV Awa Diop.pdf", SizeBytes: len(pdf), UploadedAt: time.Date(2026, 9, 28, 9, 0, 0, 0, time.UTC)}
)

// sessions authenticates the two test tokens; other auth.Accounts methods are never called here.
type sessions struct{ auth.Accounts }

func (sessions) Authenticate(_ context.Context, token string) (auth.User, error) {
	switch token {
	case candidateToken:
		return testCandidate, nil
	case adminToken:
		return testAdmin, nil
	case companyToken:
		return auth.User{ID: uuid.New(), Role: "company", FirstName: "Sonatel"}, nil
	}
	return auth.User{}, auth.ErrUnauthenticated
}

// fakeProfiles and fakeCVs record calls and return canned results; err applies to every call.
type fakeProfiles struct {
	err     error
	gotUser uuid.UUID
	saved   ProfileInput
}

func (f *fakeProfiles) Get(_ context.Context, userID uuid.UUID) (Profile, error) {
	f.gotUser = userID
	return emptyProfile(), f.err
}

func (f *fakeProfiles) Save(_ context.Context, userID uuid.UUID, input ProfileInput) (Profile, error) {
	f.gotUser, f.saved = userID, input
	return Profile{ProfileInput: input}, f.err
}

type fakeCVs struct {
	err         error
	none        bool
	gotName     string
	gotContent  []byte
	deletedUser uuid.UUID
}

func (f *fakeCVs) Get(context.Context, uuid.UUID) (*CV, error) {
	if f.none {
		return nil, f.err
	}
	return &testCV, f.err
}

func (f *fakeCVs) Upload(_ context.Context, _ uuid.UUID, name string, content []byte) (CV, error) {
	f.gotName, f.gotContent = name, content
	return testCV, f.err
}

func (f *fakeCVs) Open(context.Context, uuid.UUID) (CV, io.ReadCloser, error) {
	if f.none {
		return CV{}, nil, ErrNoCV
	}
	if f.err != nil {
		return CV{}, nil, f.err
	}
	return testCV, io.NopCloser(bytes.NewReader(pdf)), nil
}

func (f *fakeCVs) Delete(_ context.Context, userID uuid.UUID) error {
	f.deletedUser = userID
	return f.err
}

func newRouter(profiles Profiles, cvs CVs, uploads *httpx.RateLimiter) *gin.Engine {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	NewHandler(profiles, cvs, uploads).Register(router.Group("/v1"), auth.RequireUser(sessions{}))
	return router
}

func newUploadLimiter() *httpx.RateLimiter {
	return NewUploadLimiter(time.Minute)
}

func serve(router *gin.Engine, method, path, token string, body io.Reader, contentType string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, path, body)
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	if contentType != "" {
		req.Header.Set("Content-Type", contentType)
	}
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	return rec
}

func multipartBody(t *testing.T, field, fileName string, content []byte) (io.Reader, string) {
	t.Helper()
	var buf bytes.Buffer
	writer := multipart.NewWriter(&buf)
	part, err := writer.CreateFormFile(field, fileName)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := part.Write(content); err != nil {
		t.Fatal(err)
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	return &buf, writer.FormDataContentType()
}

// paddedMultipartBody puts padding bytes in a field before a valid "file" part.
func paddedMultipartBody(t *testing.T, padding int) (io.Reader, string) {
	t.Helper()
	var buf bytes.Buffer
	writer := multipart.NewWriter(&buf)
	if err := writer.WriteField("padding", strings.Repeat("x", padding)); err != nil {
		t.Fatal(err)
	}
	part, err := writer.CreateFormFile("file", "cv.pdf")
	if err == nil {
		_, err = part.Write(pdf)
	}
	if err == nil {
		err = writer.Close()
	}
	if err != nil {
		t.Fatal(err)
	}
	return &buf, writer.FormDataContentType()
}

func decodeEnvelope(t *testing.T, rec *httptest.ResponseRecorder) (httpx.Envelope, json.RawMessage) {
	t.Helper()
	var raw struct {
		httpx.Envelope
		Data json.RawMessage `json:"data"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &raw); err != nil {
		t.Fatalf("decode %q: %v", rec.Body.String(), err)
	}
	return raw.Envelope, raw.Data
}

func TestMeRoutesAreForCandidatesAndAdmins(t *testing.T) {
	router := newRouter(&fakeProfiles{}, &fakeCVs{}, newUploadLimiter())
	tests := []struct {
		name   string
		token  string
		status int
		code   string
	}{
		{"no session", "", http.StatusUnauthorized, auth.CodeUnauthenticated},
		{"another kind of account", companyToken, http.StatusForbidden, httpx.CodeForbidden},
		{"candidate session", candidateToken, http.StatusOK, ""},
		{"admin session, who may apply too", adminToken, http.StatusOK, ""},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rec := serve(router, http.MethodGet, "/v1/me/profile", tt.token, nil, "")

			envelope, _ := decodeEnvelope(t, rec)
			code := ""
			if envelope.Error != nil {
				code = envelope.Error.Code
			}
			if rec.Code != tt.status || code != tt.code {
				t.Errorf("status %d, body %s", rec.Code, rec.Body)
			}
		})
	}
}

func TestGetProfile(t *testing.T) {
	profiles := &fakeProfiles{}
	router := newRouter(profiles, &fakeCVs{}, newUploadLimiter())

	rec := serve(router, http.MethodGet, "/v1/me/profile", candidateToken, nil, "")

	_, data := decodeEnvelope(t, rec)
	if rec.Code != http.StatusOK || !strings.Contains(string(data), `"experiences":[]`) {
		t.Errorf("status %d, data %s", rec.Code, data)
	}
	if profiles.gotUser != testCandidate.ID {
		t.Errorf("profile read for %v", profiles.gotUser)
	}
}

func TestSaveProfile(t *testing.T) {
	profiles := &fakeProfiles{}
	router := newRouter(profiles, &fakeCVs{}, newUploadLimiter())
	// Larger than the default JSON limit, well within the profile one.
	summary := strings.Repeat("a", httpx.MaxJSONBodyBytes)
	body := `{"headline":"Comptable","summary":"` + summary + `","experiences":[{"title":"Stagiaire","startMonth":"2025-01","endMonth":null}]}`

	rec := serve(router, http.MethodPut, "/v1/me/profile", candidateToken, strings.NewReader(body), "application/json")

	if rec.Code != http.StatusOK {
		t.Fatalf("status %d, body %s", rec.Code, rec.Body)
	}
	if profiles.saved.Headline != "Comptable" || len(profiles.saved.Experiences) != 1 || profiles.saved.Experiences[0].EndMonth != nil {
		t.Errorf("service received %+v", profiles.saved)
	}
}

func TestSaveProfileRejectsUnknownFields(t *testing.T) {
	router := newRouter(&fakeProfiles{}, &fakeCVs{}, newUploadLimiter())

	rec := serve(router, http.MethodPut, "/v1/me/profile", candidateToken, strings.NewReader(`{"salary":1}`), "application/json")

	if rec.Code != http.StatusBadRequest {
		t.Errorf("status %d, want 400", rec.Code)
	}
}

func TestSaveProfileReportsValidationErrorsByField(t *testing.T) {
	profiles := &fakeProfiles{err: &ValidationError{Fields: map[string]string{"experiences.0.title": "Ce champ est obligatoire."}}}
	router := newRouter(profiles, &fakeCVs{}, newUploadLimiter())

	rec := serve(router, http.MethodPut, "/v1/me/profile", candidateToken, strings.NewReader(`{}`), "application/json")

	envelope, _ := decodeEnvelope(t, rec)
	if rec.Code != http.StatusUnprocessableEntity || envelope.Error.Fields["experiences.0.title"] == "" {
		t.Errorf("status %d, body %s", rec.Code, rec.Body)
	}
}

func TestUnexpectedErrorsAreInternal(t *testing.T) {
	router := newRouter(&fakeProfiles{err: errors.New("db down")}, &fakeCVs{}, newUploadLimiter())

	rec := serve(router, http.MethodGet, "/v1/me/profile", candidateToken, nil, "")

	envelope, _ := decodeEnvelope(t, rec)
	if rec.Code != http.StatusInternalServerError || strings.Contains(envelope.Error.Message, "db down") {
		t.Errorf("status %d, body %s", rec.Code, rec.Body)
	}
}

func TestUploadCV(t *testing.T) {
	cvs := &fakeCVs{}
	router := newRouter(&fakeProfiles{}, cvs, newUploadLimiter())
	body, contentType := multipartBody(t, "file", "CV Awa Diop.pdf", pdf)

	rec := serve(router, http.MethodPut, "/v1/me/cv", candidateToken, body, contentType)

	_, data := decodeEnvelope(t, rec)
	if rec.Code != http.StatusOK || !strings.Contains(string(data), `"fileName":"CV Awa Diop.pdf"`) {
		t.Fatalf("status %d, body %s", rec.Code, rec.Body)
	}
	if cvs.gotName != "CV Awa Diop.pdf" || !bytes.Equal(cvs.gotContent, pdf) {
		t.Errorf("service received %q, %q", cvs.gotName, cvs.gotContent)
	}
}

func TestUploadCVRejectsMalformedRequests(t *testing.T) {
	router := newRouter(&fakeProfiles{}, &fakeCVs{}, newUploadLimiter())
	wrongField, wrongFieldType := multipartBody(t, "document", "cv.pdf", pdf)
	tooLarge, tooLargeType := paddedMultipartBody(t, MaxCVBytes+maxMultipartOverhead)
	tests := []struct {
		name        string
		body        io.Reader
		contentType string
		status      int
	}{
		{"not multipart", strings.NewReader(`{}`), "application/json", http.StatusBadRequest},
		{"no file part", wrongField, wrongFieldType, http.StatusUnprocessableEntity},
		{"body over the limit before the file", tooLarge, tooLargeType, http.StatusUnprocessableEntity},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rec := serve(router, http.MethodPut, "/v1/me/cv", candidateToken, tt.body, tt.contentType)

			if rec.Code != tt.status {
				t.Errorf("status %d, want %d (body %s)", rec.Code, tt.status, rec.Body)
			}
		})
	}
}

func TestUploadCVIsRateLimitedPerCandidate(t *testing.T) {
	router := newRouter(&fakeProfiles{}, &fakeCVs{}, newUploadLimiter())

	var rec *httptest.ResponseRecorder
	for range uploadBurst + 1 {
		body, contentType := multipartBody(t, "file", "cv.pdf", pdf)
		rec = serve(router, http.MethodPut, "/v1/me/cv", candidateToken, body, contentType)
	}

	if rec.Code != http.StatusTooManyRequests {
		t.Errorf("status %d after %d uploads, want 429", rec.Code, uploadBurst+1)
	}
}

func TestGetCV(t *testing.T) {
	tests := []struct {
		name string
		cvs  *fakeCVs
		want string
	}{
		{"with a CV", &fakeCVs{}, `"fileName":"CV Awa Diop.pdf"`},
		{"without CV", &fakeCVs{none: true}, `null`},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			router := newRouter(&fakeProfiles{}, tt.cvs, newUploadLimiter())

			rec := serve(router, http.MethodGet, "/v1/me/cv", candidateToken, nil, "")

			_, data := decodeEnvelope(t, rec)
			if rec.Code != http.StatusOK || !strings.Contains(string(data), tt.want) {
				t.Errorf("status %d, data %s", rec.Code, data)
			}
		})
	}
}

func TestDownloadCV(t *testing.T) {
	router := newRouter(&fakeProfiles{}, &fakeCVs{}, newUploadLimiter())

	rec := serve(router, http.MethodGet, "/v1/me/cv/file", candidateToken, nil, "")

	if rec.Code != http.StatusOK || !bytes.Equal(rec.Body.Bytes(), pdf) {
		t.Fatalf("status %d, body %q", rec.Code, rec.Body)
	}
	if got := rec.Header().Get("Content-Type"); got != "application/pdf" {
		t.Errorf("Content-Type = %q", got)
	}
	if got := rec.Header().Get("Content-Disposition"); got != `attachment; filename="CV Awa Diop.pdf"` {
		t.Errorf("Content-Disposition = %q", got)
	}
	if got := rec.Header().Get("Cache-Control"); got != "private, no-store" {
		t.Errorf("Cache-Control = %q", got)
	}
}

func TestDownloadCVWithoutCVIsNotFound(t *testing.T) {
	router := newRouter(&fakeProfiles{}, &fakeCVs{none: true}, newUploadLimiter())

	rec := serve(router, http.MethodGet, "/v1/me/cv/file", candidateToken, nil, "")

	envelope, _ := decodeEnvelope(t, rec)
	if rec.Code != http.StatusNotFound || envelope.Error.Code != CodeNoCV {
		t.Errorf("status %d, body %s", rec.Code, rec.Body)
	}
}

func TestDeleteCVRoute(t *testing.T) {
	cvs := &fakeCVs{}
	router := newRouter(&fakeProfiles{}, cvs, newUploadLimiter())

	rec := serve(router, http.MethodDelete, "/v1/me/cv", candidateToken, nil, "")

	if rec.Code != http.StatusOK || cvs.deletedUser != testCandidate.ID {
		t.Errorf("status %d, deleted for %v", rec.Code, cvs.deletedUser)
	}
}
