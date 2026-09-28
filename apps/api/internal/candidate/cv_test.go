package candidate

import (
	"bytes"
	"context"
	"errors"
	"io"
	"log/slog"
	"strings"
	"sync"
	"testing"
	"unicode/utf8"

	"github.com/google/uuid"

	"github.com/badStephane/dieuliko/apps/api/internal/storage"
)

// memStore is an in-memory storage.Store; putErr makes every Put fail.
type memStore struct {
	mu      sync.Mutex
	objects map[string][]byte
	putErr  error
}

func newMemStore() *memStore {
	return &memStore{objects: map[string][]byte{}}
}

func (m *memStore) Put(_ context.Context, key string, body io.Reader, _ int64, _ string) error {
	if m.putErr != nil {
		return m.putErr
	}
	content, err := io.ReadAll(body)
	if err != nil {
		return err
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	m.objects[key] = content
	return nil
}

func (m *memStore) Get(_ context.Context, key string) (io.ReadCloser, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	content, ok := m.objects[key]
	if !ok {
		return nil, storage.ErrNotFound
	}
	return io.NopCloser(bytes.NewReader(content)), nil
}

func (m *memStore) Delete(_ context.Context, key string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.objects, key)
	return nil
}

func (m *memStore) count() int {
	m.mu.Lock()
	defer m.mu.Unlock()
	return len(m.objects)
}

var pdf = []byte("%PDF-1.7\n% test CV\n")

func newCVService(store storage.Store) *CVService {
	return NewCVService(testPool, store, slog.New(slog.DiscardHandler))
}

func TestUploadCVStoresTheFileAndItsMetadata(t *testing.T) {
	requireDB(t)
	ctx := context.Background()
	store := newMemStore()
	service := newCVService(store)
	userID := newCandidate(t)

	uploaded, err := service.Upload(ctx, userID, "CV Awa Diop.pdf", pdf)
	if err != nil {
		t.Fatalf("upload: %v", err)
	}
	meta, err := service.Get(ctx, userID)
	if err != nil || meta == nil {
		t.Fatalf("get: %v, %v", meta, err)
	}
	opened, body, err := service.Open(ctx, userID)
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	content, _ := io.ReadAll(body)
	_ = body.Close()

	if *meta != uploaded || opened != uploaded {
		t.Errorf("metadata differ: upload %+v, get %+v, open %+v", uploaded, *meta, opened)
	}
	if uploaded.FileName != "CV Awa Diop.pdf" || uploaded.SizeBytes != len(pdf) {
		t.Errorf("metadata = %+v", uploaded)
	}
	if !bytes.Equal(content, pdf) {
		t.Errorf("content = %q", content)
	}
}

func TestUploadCVReplacesThePreviousFile(t *testing.T) {
	requireDB(t)
	ctx := context.Background()
	store := newMemStore()
	service := newCVService(store)
	userID := newCandidate(t)
	if _, err := service.Upload(ctx, userID, "ancien.pdf", pdf); err != nil {
		t.Fatalf("first upload: %v", err)
	}

	second := append(append([]byte{}, pdf...), "v2"...)
	if _, err := service.Upload(ctx, userID, "nouveau.pdf", second); err != nil {
		t.Fatalf("second upload: %v", err)
	}

	meta, err := service.Get(ctx, userID)
	if err != nil || meta.FileName != "nouveau.pdf" {
		t.Fatalf("get: %+v, %v", meta, err)
	}
	if store.count() != 1 {
		t.Errorf("store holds %d objects, want the old file deleted", store.count())
	}
}

func TestUploadCVRejectsInvalidFiles(t *testing.T) {
	requireDB(t)
	tests := []struct {
		name    string
		content []byte
	}{
		{"empty", nil},
		{"not a PDF", []byte("PK\x03\x04 a docx")},
		{"too large", append(append([]byte{}, pdf...), make([]byte, MaxCVBytes)...)},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			store := newMemStore()

			_, err := newCVService(store).Upload(context.Background(), newCandidate(t), "cv.pdf", tt.content)

			var validation *ValidationError
			if !errors.As(err, &validation) || validation.Fields["file"] == "" {
				t.Fatalf("err = %v, want a validation error on file", err)
			}
			if store.count() != 0 {
				t.Error("an invalid file reached the store")
			}
		})
	}
}

func TestUploadCVFailsWhenTheStoreFails(t *testing.T) {
	requireDB(t)
	ctx := context.Background()
	store := newMemStore()
	store.putErr = errors.New("store down")
	service := newCVService(store)
	userID := newCandidate(t)

	if _, err := service.Upload(ctx, userID, "cv.pdf", pdf); err == nil {
		t.Fatal("want an error")
	}

	if meta, err := service.Get(ctx, userID); err != nil || meta != nil {
		t.Errorf("metadata saved without a file: %+v, %v", meta, err)
	}
}

func TestUploadCVRemovesTheFileWhenMetadataCannotBeSaved(t *testing.T) {
	requireDB(t)
	store := newMemStore()

	// No user has this ID: the metadata insert fails on its foreign key.
	_, err := newCVService(store).Upload(context.Background(), uuid.New(), "cv.pdf", pdf)

	if err == nil {
		t.Fatal("want an error")
	}
	if store.count() != 0 {
		t.Error("orphan file left in the store")
	}
}

func TestConcurrentFirstUploadsLeaveASingleFile(t *testing.T) {
	requireDB(t)
	ctx := context.Background()
	store := newMemStore()
	service := newCVService(store)
	userID := newCandidate(t)
	const uploads = 8

	var wg sync.WaitGroup
	errs := make(chan error, uploads)
	for range uploads {
		wg.Go(func() {
			_, err := service.Upload(ctx, userID, "cv.pdf", pdf)
			errs <- err
		})
	}
	wg.Wait()
	close(errs)

	for err := range errs {
		if err != nil {
			t.Fatalf("upload: %v", err)
		}
	}
	if store.count() != 1 {
		t.Errorf("store holds %d files, want only the current CV", store.count())
	}
}

func TestOpenCVWhoseFileVanishedReportsNoCV(t *testing.T) {
	requireDB(t)
	ctx := context.Background()
	store := newMemStore()
	service := newCVService(store)
	userID := newCandidate(t)
	if _, err := service.Upload(ctx, userID, "cv.pdf", pdf); err != nil {
		t.Fatalf("upload: %v", err)
	}
	// A concurrent delete removed the file after the metadata was read.
	store.mu.Lock()
	clear(store.objects)
	store.mu.Unlock()

	if _, _, err := service.Open(ctx, userID); !errors.Is(err, ErrNoCV) {
		t.Errorf("err = %v, want ErrNoCV", err)
	}
}

func TestDeleteCV(t *testing.T) {
	requireDB(t)
	ctx := context.Background()
	store := newMemStore()
	service := newCVService(store)
	userID := newCandidate(t)
	if _, err := service.Upload(ctx, userID, "cv.pdf", pdf); err != nil {
		t.Fatalf("upload: %v", err)
	}

	if err := service.Delete(ctx, userID); err != nil {
		t.Fatalf("delete: %v", err)
	}

	if _, _, err := service.Open(ctx, userID); !errors.Is(err, ErrNoCV) {
		t.Errorf("open after delete: err = %v, want ErrNoCV", err)
	}
	if store.count() != 0 {
		t.Error("file left in the store")
	}
	if err := service.Delete(ctx, userID); err != nil {
		t.Errorf("deleting a missing CV: %v", err)
	}
}

func TestGetCVOfACandidateWithoutOneIsNil(t *testing.T) {
	requireDB(t)

	meta, err := newCVService(newMemStore()).Get(context.Background(), newCandidate(t))

	if err != nil || meta != nil {
		t.Errorf("got %+v, %v; want nil, nil", meta, err)
	}
}

func TestSanitizeFileName(t *testing.T) {
	tests := []struct {
		raw  string
		want string
	}{
		{"CV Awa Diop.pdf", "CV Awa Diop.pdf"},
		{"../../etc/passwd", "passwd.pdf"},
		{`C:\Users\awa\Mon CV.PDF`, "Mon CV.PDF"},
		{"  cv\x00\r\n final .pdf ", "cv final .pdf"},
		{"", "cv.pdf"},
		{"..", "cv.pdf"},
		{"curriculum", "curriculum.pdf"},
	}
	for _, tt := range tests {
		if got := sanitizeFileName(tt.raw); got != tt.want {
			t.Errorf("sanitizeFileName(%q) = %q, want %q", tt.raw, got, tt.want)
		}
	}
}

func TestSanitizeFileNameTruncatesLongNamesKeepingTheExtension(t *testing.T) {
	got := sanitizeFileName(strings.Repeat("é", 300) + ".pdf")

	if utf8.RuneCountInString(got) != MaxFileNameLength || !strings.HasSuffix(got, ".pdf") {
		t.Errorf("got %d characters %q", utf8.RuneCountInString(got), got)
	}
}
