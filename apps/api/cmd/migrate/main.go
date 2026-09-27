// Command migrate applies the database migrations: `migrate [up|down|status|redo|version]`.
package main

import (
	"context"
	"errors"
	"log/slog"
	"os"

	"github.com/badStephane/dieuliko/apps/api/internal/config"
	"github.com/badStephane/dieuliko/apps/api/internal/database"
)

func main() {
	if err := run(os.Args[1:]); err != nil {
		slog.Error("migrate failed", slog.String("error", err.Error()))
		os.Exit(1)
	}
}

func run(args []string) error {
	if len(args) == 0 {
		return errors.New("usage: migrate <up|down|status|redo|version> [args]")
	}
	cfg, err := config.Load(os.LookupEnv)
	if err != nil {
		return err
	}

	ctx := context.Background()
	pool, err := database.Open(ctx, cfg.DatabaseURL)
	if err != nil {
		return err
	}
	defer pool.Close()

	return database.Migrate(ctx, pool, args[0], args[1:]...)
}
