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

	"github.com/badStephane/dieuliko/apps/api/internal/admin"
	"github.com/badStephane/dieuliko/apps/api/internal/ai"
	"github.com/badStephane/dieuliko/apps/api/internal/application"
	"github.com/badStephane/dieuliko/apps/api/internal/assistant"
	"github.com/badStephane/dieuliko/apps/api/internal/auth"
	"github.com/badStephane/dieuliko/apps/api/internal/candidate"
	"github.com/badStephane/dieuliko/apps/api/internal/company"
	"github.com/badStephane/dieuliko/apps/api/internal/config"
	"github.com/badStephane/dieuliko/apps/api/internal/database"
	"github.com/badStephane/dieuliko/apps/api/internal/database/dbgen"
	"github.com/badStephane/dieuliko/apps/api/internal/httpx"
	"github.com/badStephane/dieuliko/apps/api/internal/mail"
	"github.com/badStephane/dieuliko/apps/api/internal/server"
	"github.com/badStephane/dieuliko/apps/api/internal/storage"
)

const (
	readHeaderTimeout = 5 * time.Second
	readTimeout       = 15 * time.Second
	writeTimeout      = 30 * time.Second
	idleTimeout       = 120 * time.Second
	shutdownTimeout   = 15 * time.Second
	maxHeaderBytes    = 1 << 20
	// aiTimeout stays under writeTimeout, so a slow model still gets a proper error response.
	aiTimeout = 25 * time.Second
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

	cvStore, err := storage.NewS3Store(ctx, storage.S3Config(cfg.S3))
	if err != nil {
		return err
	}
	profiles := candidate.NewProfileService(pool)
	companies := company.NewPostgresRepository(dbgen.New(pool))
	writer := ai.NewWriter(ai.Config{
		APIKey: cfg.AI.APIKey, Model: cfg.AI.Model, BaseURL: cfg.AI.BaseURL,
		RequestsPerMinute: cfg.AI.RequestsPerMinute, Timeout: aiTimeout,
	})
	if cfg.AI.APIKey == "" {
		logger.Warn("GROQ_API_KEY is not set: the writing assistant is disabled")
	}

	// Periodic jobs stop with ctx; they are joined before the pool closes.
	var jobs sync.WaitGroup
	defer jobs.Wait()
	jobs.Go(func() { cleanupPeriodically(ctx, logger, accounts) })

	limiter := httpx.NewRateLimiter(cfg.RateLimitRPS, cfg.RateLimitBurst, server.RateLimiterIdleTTL)
	internalLimiter := httpx.NewRateLimiter(cfg.InternalRateLimitRPS, cfg.InternalRateLimitBurst, server.RateLimiterIdleTTL)
	authLimiters := auth.NewLimiters(server.RateLimiterIdleTTL)
	uploadLimiter := candidate.NewUploadLimiter(server.RateLimiterIdleTTL)
	assistLimiter := assistant.NewLimiter(server.RateLimiterIdleTTL)
	applyLimiter := application.NewLimiter(server.RateLimiterIdleTTL)
	adminLimiter := admin.NewLimiter(server.RateLimiterIdleTTL)
	limiters := append([]*httpx.RateLimiter{limiter, uploadLimiter, assistLimiter, applyLimiter, adminLimiter}, authLimiters.All()...)
	jobs.Go(func() { evictPeriodically(ctx, limiters) })

	cvs := candidate.NewCVService(pool, cvStore, logger)
	letters := assistant.NewLetterService(pool, writer, profiles, companies)
	handler, err := server.New(server.Deps{
		Config:          cfg,
		Logger:          logger,
		DB:              pool,
		Companies:       companies,
		RateLimiter:     limiter,
		InternalLimiter: internalLimiter,
		Accounts:        accounts,
		AuthLimiters:    authLimiters,
		Profiles:        profiles,
		CVs:             cvs,
		UploadLimiter:   uploadLimiter,
		Assistant:       assistant.NewService(writer, profiles),
		Letters:         letters,
		AssistLimiter:   assistLimiter,
		Applications:    application.NewService(pool, cvStore, profiles, cvs, letters, logger),
		ApplyLimiter:    applyLimiter,
		Admin:           admin.Services{Stats: admin.NewStatsService(pool)},
		AdminLimiter:    adminLimiter,
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
		// Stop the periodic jobs, or the deferred jobs.Wait would block forever (e.g. port already in use).
		stop()
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
