// Package config reads the API configuration from environment variables and validates it at startup.
package config

import (
	"errors"
	"fmt"
	"log/slog"
	"net/netip"
	"net/url"
	"strconv"
	"strings"
)

// Config is the validated runtime configuration of the API.
type Config struct {
	DatabaseURL string
	HTTPAddr    string
	// CORSOrigins lists the browser origins allowed to call the API (the Next.js front).
	CORSOrigins []string
	// TrustedProxies are the reverse proxies whose X-Forwarded-For is believed (none by default).
	TrustedProxies []string
	// RateLimitRPS and RateLimitBurst size the per-client-IP token bucket.
	RateLimitRPS   float64
	RateLimitBurst int
	// InternalToken, when set, identifies trusted server-side callers (the Next.js server). They share
	// one separate, larger bucket (InternalRateLimitRPS/Burst) so a leaked token still has a finite budget.
	InternalToken          string
	InternalRateLimitRPS   float64
	InternalRateLimitBurst int
	LogLevel               slog.Level
}

const (
	defaultHTTPAddr    = ":8080"
	defaultCORSOrigins = "http://localhost:3000"
	defaultLogLevel    = "info"
	defaultRateRPS     = "20"
	defaultRateBurst   = "40"
	// All server-side rendering goes through the internal bucket, hence the larger budget.
	defaultInternalRateRPS   = "200"
	defaultInternalRateBurst = "400"
	// MinInternalTokenLength keeps the internal token out of brute-force reach.
	MinInternalTokenLength = 32
)

// Load builds a Config from a lookup function (os.LookupEnv in production, a map in tests).
func Load(lookup func(string) (string, bool)) (Config, error) {
	get := func(key, fallback string) string {
		if value, ok := lookup(key); ok && strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
		return fallback
	}

	var errs []error

	databaseURL := get("DATABASE_URL", "")
	if databaseURL == "" {
		errs = append(errs, errors.New("DATABASE_URL is required"))
	}

	origins, err := parseOrigins(get("CORS_ORIGINS", defaultCORSOrigins))
	if err != nil {
		errs = append(errs, err)
	}

	rps, burst, rateErrs := parseRateLimit(get, "RATE_LIMIT", defaultRateRPS, defaultRateBurst)
	errs = append(errs, rateErrs...)
	internalRPS, internalBurst, rateErrs := parseRateLimit(get, "INTERNAL_RATE_LIMIT", defaultInternalRateRPS, defaultInternalRateBurst)
	errs = append(errs, rateErrs...)

	trustedProxies := splitList(get("TRUSTED_PROXIES", ""))
	for _, proxy := range trustedProxies {
		if isCatchAll(proxy) {
			errs = append(errs, fmt.Errorf("TRUSTED_PROXIES: %q would let any client spoof its IP; list your proxy addresses only", proxy))
		}
	}

	internalToken := get("INTERNAL_API_TOKEN", "")
	if internalToken != "" && len(internalToken) < MinInternalTokenLength {
		errs = append(errs, fmt.Errorf("INTERNAL_API_TOKEN must be at least %d characters", MinInternalTokenLength))
	}

	var level slog.Level
	if err := level.UnmarshalText([]byte(get("LOG_LEVEL", defaultLogLevel))); err != nil {
		errs = append(errs, fmt.Errorf("LOG_LEVEL: %w", err))
	}

	if len(errs) > 0 {
		return Config{}, fmt.Errorf("config: %w", errors.Join(errs...))
	}
	return Config{
		DatabaseURL:            databaseURL,
		HTTPAddr:               get("HTTP_ADDR", defaultHTTPAddr),
		CORSOrigins:            origins,
		TrustedProxies:         trustedProxies,
		RateLimitRPS:           rps,
		RateLimitBurst:         burst,
		InternalToken:          internalToken,
		InternalRateLimitRPS:   internalRPS,
		InternalRateLimitBurst: internalBurst,
		LogLevel:               level,
	}, nil
}

// parseRateLimit reads <prefix>_RPS (positive number) and <prefix>_BURST (positive integer).
func parseRateLimit(get func(string, string) string, prefix, defaultRPS, defaultBurst string) (float64, int, []error) {
	var errs []error
	rps, err := strconv.ParseFloat(get(prefix+"_RPS", defaultRPS), 64)
	if err != nil || rps <= 0 {
		errs = append(errs, fmt.Errorf("%s_RPS must be a positive number", prefix))
	}
	burst, err := strconv.Atoi(get(prefix+"_BURST", defaultBurst))
	if err != nil || burst < 1 {
		errs = append(errs, fmt.Errorf("%s_BURST must be a positive integer", prefix))
	}
	return rps, burst, errs
}

// isCatchAll reports CIDRs matching every address, which would make X-Forwarded-For fully client-controlled.
func isCatchAll(proxy string) bool {
	prefix, err := netip.ParsePrefix(proxy)
	return err == nil && prefix.Bits() == 0
}

func splitList(raw string) []string {
	var items []string
	for _, part := range strings.Split(raw, ",") {
		if item := strings.TrimSpace(part); item != "" {
			items = append(items, item)
		}
	}
	return items
}

func parseOrigins(raw string) ([]string, error) {
	origins := splitList(raw)
	for _, origin := range origins {
		parsed, err := url.Parse(origin)
		if err != nil || parsed.Scheme == "" || parsed.Host == "" || parsed.Path != "" {
			return nil, fmt.Errorf("CORS_ORIGINS: %q is not an origin like https://example.com", origin)
		}
	}
	return origins, nil
}
