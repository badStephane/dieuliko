package storage

import (
	"bytes"
	"context"
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"testing"

	"github.com/badStephane/dieuliko/apps/api/internal/testutil"
)

const testBucket = "cvs-test"

// testS3 is nil in -short mode: integration tests then skip.
var testS3 *testutil.S3

func TestMain(m *testing.M) {
	flag.Parse()
	if testing.Short() {
		os.Exit(m.Run())
	}
	ctx := context.Background()
	s3, err := testutil.StartS3(ctx, testBucket)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	testS3 = s3
	code := m.Run()
	if err := s3.Stop(ctx); err != nil {
		fmt.Fprintln(os.Stderr, err)
	}
	os.Exit(code)
}

func newTestStore(t *testing.T, bucket string) (*S3Store, error) {
	t.Helper()
	if testS3 == nil {
		t.Skip("integration test: needs Docker (run without -short)")
	}
	return NewS3Store(context.Background(), S3Config{
		Endpoint: testS3.Endpoint, Region: testS3.Region, Bucket: bucket,
		AccessKey: testS3.AccessKey, SecretKey: testS3.SecretKey,
	})
}

func TestS3StoreRoundTrip(t *testing.T) {
	store, err := newTestStore(t, testBucket)
	if err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()
	content := []byte("%PDF-1.7 test content")

	if err := store.Put(ctx, "cvs/a/cv.pdf", bytes.NewReader(content), int64(len(content)), "application/pdf"); err != nil {
		t.Fatalf("put: %v", err)
	}
	body, err := store.Get(ctx, "cvs/a/cv.pdf")
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	got, err := io.ReadAll(body)
	_ = body.Close()
	if err != nil || !bytes.Equal(got, content) {
		t.Fatalf("read back %q, %v", got, err)
	}

	if err := store.Delete(ctx, "cvs/a/cv.pdf"); err != nil {
		t.Fatalf("delete: %v", err)
	}
	if _, err := store.Get(ctx, "cvs/a/cv.pdf"); !errors.Is(err, ErrNotFound) {
		t.Errorf("get after delete: err = %v, want ErrNotFound", err)
	}
}

func TestS3StoreDeleteOfAMissingObjectSucceeds(t *testing.T) {
	store, err := newTestStore(t, testBucket)
	if err != nil {
		t.Fatal(err)
	}

	if err := store.Delete(context.Background(), "cvs/missing.pdf"); err != nil {
		t.Errorf("delete: %v", err)
	}
}

func TestNewS3StoreFailsWhenTheBucketIsMissing(t *testing.T) {
	_, err := newTestStore(t, "no-such-bucket")

	if err == nil {
		t.Fatal("want an error for a missing bucket")
	}
}

func TestNewS3StoreRequiresBucketAndCredentials(t *testing.T) {
	valid := S3Config{Endpoint: "http://127.0.0.1:8333", Region: "us-east-1", Bucket: testBucket, AccessKey: "k", SecretKey: "s"}
	tests := map[string]func(*S3Config){
		"no bucket":     func(c *S3Config) { c.Bucket = "" },
		"no access key": func(c *S3Config) { c.AccessKey = "" },
		"no secret key": func(c *S3Config) { c.SecretKey = "" },
	}
	for name, mutate := range tests {
		t.Run(name, func(t *testing.T) {
			cfg := valid
			mutate(&cfg)

			if _, err := NewS3Store(context.Background(), cfg); !errors.Is(err, ErrIncompleteConfig) {
				t.Fatalf("err = %v, want ErrIncompleteConfig", err)
			}
		})
	}
}

func TestNewS3StoreRejectsAnEndpointWithoutScheme(t *testing.T) {
	_, err := NewS3Store(context.Background(), S3Config{
		Endpoint: "127.0.0.1:9000", Region: "us-east-1", Bucket: testBucket, AccessKey: "k", SecretKey: "s",
	})

	if err == nil {
		t.Fatal("want an error for an endpoint without http(s) scheme")
	}
}
