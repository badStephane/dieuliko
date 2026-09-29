package listing

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"log/slog"

	"github.com/jackc/pgx/v5"

	"github.com/badStephane/dieuliko/apps/api/internal/company"
	"github.com/badStephane/dieuliko/apps/api/internal/database/dbgen"
	"github.com/badStephane/dieuliko/apps/api/internal/logo"
	"github.com/badStephane/dieuliko/apps/api/internal/storage"
)

// DB is satisfied by *pgxpool.Pool.
type DB interface {
	dbgen.DBTX
	Begin(ctx context.Context) (pgx.Tx, error)
}

// Record writes who changed the logo (the admin audit, or the company's activity), in the change's transaction.
type Record func(ctx context.Context, q *dbgen.Queries) error

// Logos stores the logo files of the listings and points the listings at them.
type Logos struct {
	db     DB
	store  storage.Store
	logger *slog.Logger
}

// NewLogos builds the logo store of the listings.
func NewLogos(db DB, store storage.Store, logger *slog.Logger) *Logos {
	return &Logos{db: db, store: store, logger: logger}
}

// Set stores a new logo for the listing and drops the previous one. The file is stored before the row points to it,
// so the listing never shows a missing logo; if the row cannot be updated the new file is deleted again. An image
// that is not accepted comes back as a *logo.InvalidError.
func (l *Logos) Set(ctx context.Context, slug string, content []byte, record Record) error {
	format, err := logo.Validate(content)
	if err != nil {
		return err
	}
	key := logo.NewKey(format)
	if err := l.store.Put(ctx, key, bytes.NewReader(content), int64(len(content)), format.ContentType); err != nil {
		return fmt.Errorf("set logo: %w", err)
	}
	previous, err := l.replace(ctx, slug, &key, record)
	if err != nil {
		l.DeleteFile(ctx, key)
		return err
	}
	l.DeleteFile(ctx, previous)
	return nil
}

// Remove takes the logo off the listing; the monogram is shown again. Removing a missing logo is not an error, and
// is not recorded.
func (l *Logos) Remove(ctx context.Context, slug string, record Record) error {
	previous, err := l.replace(ctx, slug, nil, record)
	if err != nil {
		return err
	}
	l.DeleteFile(ctx, previous)
	return nil
}

// replace points the listing at key (nil: no logo) and returns the key it replaced ("" when none).
func (l *Logos) replace(ctx context.Context, slug string, key *string, record Record) (string, error) {
	var previous string
	err := pgx.BeginFunc(ctx, l.db, func(tx pgx.Tx) error {
		q := dbgen.New(tx)
		current, err := q.LockCompanyLogo(ctx, slug)
		if errors.Is(err, pgx.ErrNoRows) {
			return company.ErrNotFound
		}
		if err != nil {
			return fmt.Errorf("replace logo: lock: %w", err)
		}
		if current == nil && key == nil {
			return nil
		}
		if current != nil {
			previous = *current
		}
		if err := q.SetCompanyLogo(ctx, dbgen.SetCompanyLogoParams{Slug: slug, LogoKey: key}); err != nil {
			return fmt.Errorf("replace logo: %w", err)
		}
		return record(ctx, q)
	})
	return previous, err
}

// DeleteFile removes a file no listing points to anymore. A failure only leaves an orphan file behind, so it is
// logged rather than returned; it runs even if the client went away.
func (l *Logos) DeleteFile(ctx context.Context, key string) {
	if key == "" {
		return
	}
	if err := l.store.Delete(context.WithoutCancel(ctx), key); err != nil {
		l.logger.Error("orphan logo file", slog.String("key", key), slog.String("error", err.Error()))
	}
}
