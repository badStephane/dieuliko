// Command seed imports the scraped company base into PostgreSQL (idempotent upsert on slug).
package main

import (
	"context"
	"flag"
	"fmt"
	"log/slog"
	"os"

	"github.com/badStephane/dieuliko/apps/api/internal/company"
	"github.com/badStephane/dieuliko/apps/api/internal/config"
	"github.com/badStephane/dieuliko/apps/api/internal/database"
)

const defaultFile = "../../data/companies_scraped.json"

func main() {
	file := flag.String("file", defaultFile, "path to the scraped companies JSON file")
	flag.Parse()

	if err := run(*file); err != nil {
		slog.Error("seed failed", slog.String("error", err.Error()))
		os.Exit(1)
	}
}

func run(path string) error {
	cfg, err := config.Load(os.LookupEnv)
	if err != nil {
		return err
	}

	f, err := os.Open(path)
	if err != nil {
		return fmt.Errorf("open %s: %w", path, err)
	}
	defer f.Close()

	companies, err := company.ParseScraped(f)
	if err != nil {
		return err
	}

	ctx := context.Background()
	pool, err := database.Open(ctx, cfg.DatabaseURL)
	if err != nil {
		return err
	}
	defer pool.Close()

	if err := company.ImportScraped(ctx, pool, companies); err != nil {
		return err
	}
	slog.Info("companies imported", slog.Int("count", len(companies)), slog.String("file", path))
	return nil
}
