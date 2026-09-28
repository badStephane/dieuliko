package testutil

import (
	"context"
	"fmt"
	"time"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/wait"
)

// Same image as docker-compose.yml: an all-in-one SeaweedFS with its S3 gateway.
const seaweedImage = "chrislusf/seaweedfs:4.47"

const (
	s3Port        = "8333/tcp"
	s3AccessKey   = "dieuliko-test"
	s3SecretKey   = "dieuliko-test-secret"
	s3Region      = "us-east-1"
	bucketPolling = 200 * time.Millisecond
)

// S3 is a running S3-compatible server with one bucket.
type S3 struct {
	Endpoint  string
	Region    string
	Bucket    string
	AccessKey string
	SecretKey string
	container testcontainers.Container
}

// StartS3 launches SeaweedFS with bucket pre-created and waits until it is usable.
// Call it from TestMain so one container serves a whole package.
func StartS3(ctx context.Context, bucket string) (*S3, error) {
	container, err := testcontainers.GenericContainer(ctx, testcontainers.GenericContainerRequest{
		ContainerRequest: testcontainers.ContainerRequest{
			Image:        seaweedImage,
			Cmd:          []string{"mini", "-dir=/data", "-bucket=" + bucket},
			Env:          map[string]string{"AWS_ACCESS_KEY_ID": s3AccessKey, "AWS_SECRET_ACCESS_KEY": s3SecretKey},
			ExposedPorts: []string{s3Port},
			WaitingFor:   wait.ForListeningPort(s3Port).WithStartupTimeout(startupTimeout),
		},
		Started: true,
	})
	if err != nil {
		return nil, fmt.Errorf("testutil: start s3: %w", err)
	}
	s3 := &S3{Region: s3Region, Bucket: bucket, AccessKey: s3AccessKey, SecretKey: s3SecretKey, container: container}
	hostPort, err := container.PortEndpoint(ctx, s3Port, "")
	if err == nil {
		s3.Endpoint = "http://" + hostPort
		err = waitForBucket(ctx, hostPort, bucket)
	}
	if err != nil {
		_ = container.Terminate(ctx)
		return nil, err
	}
	return s3, nil
}

// waitForBucket polls until the bucket created at startup is visible (it lags the open port).
func waitForBucket(ctx context.Context, hostPort, bucket string) error {
	client, err := minio.New(hostPort, &minio.Options{Creds: credentials.NewStaticV4(s3AccessKey, s3SecretKey, ""), Region: s3Region})
	if err != nil {
		return fmt.Errorf("testutil: s3 client: %w", err)
	}
	ctx, cancel := context.WithTimeout(ctx, startupTimeout)
	defer cancel()
	for {
		exists, err := client.BucketExists(ctx, bucket)
		if err == nil && exists {
			return nil
		}
		select {
		case <-ctx.Done():
			return fmt.Errorf("testutil: bucket %q never became available: %w", bucket, err)
		case <-time.After(bucketPolling):
		}
	}
}

// Stop removes the container.
func (s *S3) Stop(ctx context.Context) error {
	return s.container.Terminate(ctx)
}
