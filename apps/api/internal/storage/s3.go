package storage

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/url"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

// S3Config locates a bucket of an S3-compatible service.
type S3Config struct {
	// Endpoint is the service URL: "http://127.0.0.1:8333" (SeaweedFS), "https://<account>.r2.cloudflarestorage.com" (R2).
	Endpoint string
	// Region is "us-east-1" for SeaweedFS or MinIO, "auto" for R2.
	Region    string
	Bucket    string
	AccessKey string
	SecretKey string
}

// ErrIncompleteConfig is returned when the bucket or the credentials are missing.
var ErrIncompleteConfig = errors.New("storage: S3 bucket, access key and secret key are required")

// S3Store is a Store backed by an S3-compatible bucket.
type S3Store struct {
	client *minio.Client
	bucket string
}

var _ Store = (*S3Store)(nil)

// NewS3Store connects to the bucket and checks that it exists, so misconfiguration fails at startup.
func NewS3Store(ctx context.Context, cfg S3Config) (*S3Store, error) {
	if cfg.Bucket == "" || cfg.AccessKey == "" || cfg.SecretKey == "" {
		return nil, ErrIncompleteConfig
	}
	endpoint, err := url.Parse(cfg.Endpoint)
	if err != nil || (endpoint.Scheme != "http" && endpoint.Scheme != "https") || endpoint.Host == "" {
		return nil, fmt.Errorf("storage: endpoint %q is not an http(s) URL", cfg.Endpoint)
	}
	client, err := minio.New(endpoint.Host, &minio.Options{
		Creds:  credentials.NewStaticV4(cfg.AccessKey, cfg.SecretKey, ""),
		Secure: endpoint.Scheme == "https",
		Region: cfg.Region,
	})
	if err != nil {
		return nil, fmt.Errorf("storage: client: %w", err)
	}
	exists, err := client.BucketExists(ctx, cfg.Bucket)
	if err != nil {
		return nil, fmt.Errorf("storage: check bucket %q: %w", cfg.Bucket, err)
	}
	if !exists {
		return nil, fmt.Errorf("storage: bucket %q does not exist", cfg.Bucket)
	}
	return &S3Store{client: client, bucket: cfg.Bucket}, nil
}

// Put implements Store.
func (s *S3Store) Put(ctx context.Context, key string, body io.Reader, size int64, contentType string) error {
	_, err := s.client.PutObject(ctx, s.bucket, key, body, size, minio.PutObjectOptions{ContentType: contentType})
	if err != nil {
		return fmt.Errorf("storage: put %q: %w", key, err)
	}
	return nil
}

// Get implements Store. The object is stat'ed first: minio-go only reports a missing key on first read.
func (s *S3Store) Get(ctx context.Context, key string) (io.ReadCloser, error) {
	object, err := s.client.GetObject(ctx, s.bucket, key, minio.GetObjectOptions{})
	if err != nil {
		return nil, fmt.Errorf("storage: get %q: %w", key, err)
	}
	if _, err := object.Stat(); err != nil {
		_ = object.Close()
		if minio.ToErrorResponse(err).Code == minio.NoSuchKey {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("storage: stat %q: %w", key, err)
	}
	return object, nil
}

// Delete implements Store (S3 deletes are idempotent).
func (s *S3Store) Delete(ctx context.Context, key string) error {
	if err := s.client.RemoveObject(ctx, s.bucket, key, minio.RemoveObjectOptions{}); err != nil {
		return fmt.Errorf("storage: delete %q: %w", key, err)
	}
	return nil
}
