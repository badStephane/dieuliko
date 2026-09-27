// Package testutil starts a disposable, migrated PostgreSQL for integration tests.
package testutil

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/postgres"
	"github.com/testcontainers/testcontainers-go/wait"

	"github.com/badStephane/dieuliko/apps/api/internal/database"
)

// Same major version as docker-compose.yml.
const postgresImage = "postgres:17-alpine"

const startupTimeout = 60 * time.Second

// Postgres is a running, migrated test database.
type Postgres struct {
	Pool      *pgxpool.Pool
	container *postgres.PostgresContainer
}

// StartPostgres launches a container, applies all migrations and returns a pool on it.
// Call it from TestMain so one container serves a whole package.
func StartPostgres(ctx context.Context) (*Postgres, error) {
	container, err := postgres.Run(ctx, postgresImage,
		postgres.WithDatabase("dieuliko_test"),
		postgres.WithUsername("dieuliko"),
		postgres.WithPassword("dieuliko"),
		testcontainers.WithWaitStrategy(
			wait.ForLog("database system is ready to accept connections").
				WithOccurrence(2).
				WithStartupTimeout(startupTimeout),
		),
	)
	if err != nil {
		return nil, fmt.Errorf("testutil: start postgres: %w", err)
	}

	url, err := container.ConnectionString(ctx, "sslmode=disable")
	if err != nil {
		_ = container.Terminate(ctx)
		return nil, fmt.Errorf("testutil: connection string: %w", err)
	}
	pool, err := database.Open(ctx, url)
	if err != nil {
		_ = container.Terminate(ctx)
		return nil, err
	}
	if err := database.Migrate(ctx, pool, "up"); err != nil {
		pool.Close()
		_ = container.Terminate(ctx)
		return nil, err
	}
	return &Postgres{Pool: pool, container: container}, nil
}

// Stop closes the pool and removes the container.
func (p *Postgres) Stop(ctx context.Context) error {
	p.Pool.Close()
	return p.container.Terminate(ctx)
}
