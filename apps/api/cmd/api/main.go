// Command api serves the Dieuliko HTTP API.
package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"sync"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/badStephane/dieuliko/apps/api/internal/auth"
	"github.com/badStephane/dieuliko/apps/api/internal/company"
	"github.com/badStephane/dieuliko/apps/api/internal/config"
	"github.com/badStephane/dieuliko/apps/api/internal/database"
	"github.com/badStephane/dieuliko/apps/api/internal/database/dbgen"
	"github.com/badStephane/dieuliko/apps/api/internal/httpx"
	"github.com/badStephane/dieuliko/apps/api/internal/mail"
	"github.com/badStephane/dieuliko/apps/api/internal/server"
)

const (
	readHeaderTimeout = 5 * time.Second
	readTimeout       = 15 * time.Second
	writeTimeout      = 30 * time.Second
	idleTimeout       = 120 * time.Second
	shutdownTimeout   = 15 * time.Second
	maxHeaderBytes    = 1 << 20
	// cleanupInterval is how often expired sessions and email tokens are deleted.
	cleanupInterval = time.Hour
)

func main() {
	if err := run(); err != nil {
		slog.Error("api stopped", slog.String("error", err.Error()))
		os.Exit(1)
	}
}

func run() error {
	cfg, err := config.Load(os.LookupEnv)
	if err != nil {
		return err
	}
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: cfg.LogLevel}))
	slog.SetDefault(logger)
	gin.SetMode(gin.ReleaseMode)

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	pool, err := database.Open(ctx, cfg.DatabaseURL)
	if err != nil {
		return err
	}
	defer pool.Close()

	mailer, err := mail.NewSMTPMailer(mail.SMTPConfig(cfg.SMTP))
	if err != nil {
		return err
	}
	accounts, err := auth.NewService(pool, mailer, logger, auth.DefaultConfig(cfg.AppBaseURL))
	if err != nil {
		return err
	}
	defer accounts.Wait() // let background emails finish after the server stops

	// Periodic jobs stop with ctx; they are joined before the pool closes.
	var jobs sync.WaitGroup
	defer jobs.Wait()
	jobs.Go(func() { cleanupPeriodically(ctx, logger, accounts) })

	limiter := httpx.NewRateLimiter(cfg.RateLimitRPS, cfg.RateLimitBurst, server.RateLimiterIdleTTL)
	internalLimiter := httpx.NewRateLimiter(cfg.InternalRateLimitRPS, cfg.InternalRateLimitBurst, server.RateLimiterIdleTTL)
	authLimiters := auth.NewLimiters(server.RateLimiterIdleTTL)
	jobs.Go(func() { evictPeriodically(ctx, append([]*httpx.RateLimiter{limiter}, authLimiters.All()...)) })

	handler, err := server.New(server.Deps{
		Config:          cfg,
		Logger:          logger,
		DB:              pool,
		Companies:       company.NewPostgresRepository(dbgen.New(pool)),
		RateLimiter:     limiter,
		InternalLimiter: internalLimiter,
		Accounts:        accounts,
		AuthLimiters:    authLimiters,
	})
	if err != nil {
		return err
	}

	srv := &http.Server{
		Addr:              cfg.HTTPAddr,
		Handler:           handler,
		ReadHeaderTimeout: readHeaderTimeout,
		ReadTimeout:       readTimeout,
		WriteTimeout:      writeTimeout,
		IdleTimeout:       idleTimeout,
		MaxHeaderBytes:    maxHeaderBytes,
	}

	serveErr := make(chan error, 1)
	go func() {
		logger.Info("api listening", slog.String("addr", cfg.HTTPAddr))
		serveErr <- srv.ListenAndServe()
	}()

	select {
	case err := <-serveErr:
		if !errors.Is(err, http.ErrServerClosed) {
			return fmt.Errorf("listen: %w", err)
		}
		return nil
	case <-ctx.Done():
		logger.Info("shutting down")
	}

	shutdownCtx, cancel := context.WithTimeout(context.Background(), shutdownTimeout)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		return fmt.Errorf("shutdown: %w", err)
	}
	return nil
}

// evictionsPerTTL makes idle buckets live at most 1.25 × the TTL, bounding memory under IP rotation.
const evictionsPerTTL = 4

func evictPeriodically(ctx context.Context, limiters []*httpx.RateLimiter) {
	ticker := time.NewTicker(server.RateLimiterIdleTTL / evictionsPerTTL)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			for _, limiter := range limiters {
				limiter.Evict()
			}
		}
	}
}

func cleanupPeriodically(ctx context.Context, logger *slog.Logger, accounts *auth.Service) {
	ticker := time.NewTicker(cleanupInterval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			sessions, tokens, err := accounts.Cleanup(ctx)
			if err != nil {
				logger.Error("auth cleanup", slog.String("error", err.Error()))
				continue
			}
			logger.Info("auth cleanup", slog.Int64("sessions", sessions), slog.Int64("email_tokens", tokens))
		}
	}
}
