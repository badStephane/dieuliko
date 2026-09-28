// Package storage keeps files (candidate CVs) in an S3-compatible object store:
// MinIO in development, Cloudflare R2 or any S3 service in production.
package storage

import (
	"context"
	"errors"
	"io"
)

// ErrNotFound is returned when no object exists under a key.
var ErrNotFound = errors.New("storage: object not found")

// Store saves, reads and deletes objects by key.
type Store interface {
	// Put stores size bytes read from body under key, replacing any existing object.
	Put(ctx context.Context, key string, body io.Reader, size int64, contentType string) error
	// Get opens the object stored under key; the caller closes it. Missing objects give ErrNotFound.
	Get(ctx context.Context, key string) (io.ReadCloser, error)
	// Delete removes the object stored under key; deleting a missing object is not an error.
	Delete(ctx context.Context, key string) error
}
