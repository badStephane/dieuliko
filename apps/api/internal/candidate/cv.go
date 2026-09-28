package candidate

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"path"
	"strings"
	"time"
	"unicode"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/badStephane/dieuliko/apps/api/internal/database/dbgen"
	"github.com/badStephane/dieuliko/apps/api/internal/storage"
)

// CV limits, mirrored by the CHECK constraints of candidate_cvs.
const (
	MaxCVBytes        = 5 << 20
	MaxFileNameLength = 120
)

const (
	pdfContentType   = "application/pdf"
	pdfExtension     = ".pdf"
	defaultCVName    = "cv"
	cvKeyPrefix      = "cvs/"
	msgCVTooLarge    = "Le CV ne doit pas dépasser 5 Mo."
	msgCVEmpty       = "Le fichier est vide."
	msgCVMustBePDF   = "Le CV doit être un fichier PDF."
	fileField        = "file"
	pdfMagicSequence = "%PDF-"
)

// CV describes a candidate's current CV file.
type CV struct {
	FileName   string    `json:"fileName"`
	SizeBytes  int       `json:"sizeBytes"`
	UploadedAt time.Time `json:"uploadedAt"`
}

// CVService stores candidates' CV files (object storage) and their metadata (PostgreSQL).
// Metadata is written after the file and removed before it, so it never points to a missing file.
type CVService struct {
	db     DB
	store  storage.Store
	logger *slog.Logger
}

// NewCVService builds the service.
func NewCVService(db DB, store storage.Store, logger *slog.Logger) *CVService {
	return &CVService{db: db, store: store, logger: logger}
}

// Get returns the candidate's CV metadata, or nil if they have none.
func (s *CVService) Get(ctx context.Context, userID uuid.UUID) (*CV, error) {
	row, err := dbgen.New(s.db).GetCV(ctx, userID)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("get cv: %w", err)
	}
	cv := newCV(row)
	return &cv, nil
}

// Upload validates a PDF and makes it the candidate's CV, replacing any previous one.
func (s *CVService) Upload(ctx context.Context, userID uuid.UUID, fileName string, content []byte) (CV, error) {
	if err := validateCVFile(content); err != nil {
		return CV{}, err
	}
	name := sanitizeFileName(fileName)
	key := cvKeyPrefix + userID.String() + "/" + uuid.NewString() + pdfExtension
	if err := s.store.Put(ctx, key, bytes.NewReader(content), int64(len(content)), pdfContentType); err != nil {
		return CV{}, fmt.Errorf("upload cv: %w", err)
	}

	var previousKey string
	var uploadedAt time.Time
	err := withTx(ctx, s.db, pgx.TxOptions{}, func(q *dbgen.Queries) error {
		// Lock the user, not the CV row: a first upload has no CV row to lock, and concurrent
		// first uploads must still see each other's file to delete it.
		if err := q.LockUser(ctx, userID); err != nil {
			return err
		}
		current, err := q.GetCV(ctx, userID)
		if err != nil && !errors.Is(err, pgx.ErrNoRows) {
			return err
		}
		previousKey = current.ObjectKey
		uploadedAt, err = q.UpsertCV(ctx, dbgen.UpsertCVParams{
			UserID: userID, ObjectKey: key, FileName: name, SizeBytes: int32(len(content)),
		})
		return err
	})
	if err != nil {
		s.deleteObject(ctx, key)
		return CV{}, fmt.Errorf("upload cv: %w", err)
	}
	if previousKey != "" {
		s.deleteObject(ctx, previousKey)
	}
	return CV{FileName: name, SizeBytes: len(content), UploadedAt: uploadedAt}, nil
}

// Open returns the candidate's CV metadata and file (the caller closes it), or ErrNoCV.
func (s *CVService) Open(ctx context.Context, userID uuid.UUID) (CV, io.ReadCloser, error) {
	row, err := dbgen.New(s.db).GetCV(ctx, userID)
	if errors.Is(err, pgx.ErrNoRows) {
		return CV{}, nil, ErrNoCV
	}
	if err != nil {
		return CV{}, nil, fmt.Errorf("open cv: %w", err)
	}
	body, err := s.store.Get(ctx, row.ObjectKey)
	if errors.Is(err, storage.ErrNotFound) {
		return CV{}, nil, ErrNoCV // deleted between the metadata read and the file read
	}
	if err != nil {
		return CV{}, nil, fmt.Errorf("open cv file %q: %w", row.ObjectKey, err)
	}
	return newCV(row), body, nil
}

// Delete removes the candidate's CV; deleting a missing CV is not an error.
func (s *CVService) Delete(ctx context.Context, userID uuid.UUID) error {
	key, err := dbgen.New(s.db).DeleteCV(ctx, userID)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("delete cv: %w", err)
	}
	s.deleteObject(ctx, key)
	return nil
}

// deleteObject removes a file no metadata points to anymore. A failure only leaves an orphan
// file behind, so it is logged rather than returned; it runs even if the client went away.
func (s *CVService) deleteObject(ctx context.Context, key string) {
	if err := s.store.Delete(context.WithoutCancel(ctx), key); err != nil {
		s.logger.Error("orphan cv file", slog.String("key", key), slog.String("error", err.Error()))
	}
}

func newCV(row dbgen.GetCVRow) CV {
	return CV{FileName: row.FileName, SizeBytes: int(row.SizeBytes), UploadedAt: row.UploadedAt}
}

// validateCVFile accepts non-empty PDFs (checked by signature, not by the claimed type) up to MaxCVBytes.
func validateCVFile(content []byte) error {
	message := ""
	switch {
	case len(content) == 0:
		message = msgCVEmpty
	case len(content) > MaxCVBytes:
		message = msgCVTooLarge
	case !bytes.HasPrefix(content, []byte(pdfMagicSequence)):
		message = msgCVMustBePDF
	default:
		return nil
	}
	return &ValidationError{Fields: map[string]string{fileField: message}}
}

// sanitizeFileName keeps the base name of an uploaded file, without control characters,
// ending in .pdf and at most MaxFileNameLength characters long. It is only ever displayed.
func sanitizeFileName(raw string) string {
	name := raw
	if i := strings.LastIndexAny(name, `/\`); i >= 0 {
		name = name[i+1:]
	}
	name = singleLine(strings.Map(func(r rune) rune {
		if unicode.IsControl(r) {
			return ' '
		}
		return r
	}, name))
	if strings.Trim(name, ".") == "" {
		name = defaultCVName
	}
	if !strings.EqualFold(path.Ext(name), pdfExtension) {
		name += pdfExtension
	}
	if runes := []rune(name); len(runes) > MaxFileNameLength {
		extension := runes[len(runes)-len(pdfExtension):]
		name = string(runes[:MaxFileNameLength-len(pdfExtension)]) + string(extension)
	}
	return name
}
