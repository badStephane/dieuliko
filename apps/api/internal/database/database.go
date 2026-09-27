// Package database opens the PostgreSQL pool and applies the embedded goose migrations.
package database

import (
	"context"
	"embed"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/jackc/pgx/v5/stdlib"
	"github.com/pressly/goose/v3"
)

//go:embed migrations/*.sql
var migrations embed.FS

const pingTimeout = 5 * time.Second

// Open connects to PostgreSQL and checks the connection before returning the pool.
func Open(ctx context.Context, databaseURL string) (*pgxpool.Pool, error) {
	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		return nil, fmt.Errorf("database: parse config: %w", err)
	}

	pingCtx, cancel := context.WithTimeout(ctx, pingTimeout)
	defer cancel()
	if err := pool.Ping(pingCtx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("database: ping: %w", err)
	}
	return pool, nil
}

// Migrate runs a goose command ("up", "down", "status", ...) with the embedded migrations.
func Migrate(ctx context.Context, pool *pgxpool.Pool, command string, args ...string) error {
	db := stdlib.OpenDBFromPool(pool)
	defer db.Close()

	goose.SetBaseFS(migrations)
	if err := goose.SetDialect("postgres"); err != nil {
		return fmt.Errorf("database: goose dialect: %w", err)
	}
	if err := goose.RunContext(ctx, command, db, "migrations", args...); err != nil {
		return fmt.Errorf("database: migrate %s: %w", command, err)
	}
	return nil
}
