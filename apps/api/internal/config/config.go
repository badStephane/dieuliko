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
	// AppBaseURL is the public URL of the web front, used in email links.
	AppBaseURL string
	SMTP       SMTPConfig
	// S3 is the object storage of candidates' CVs (SeaweedFS in development, R2 in production).
	S3 S3Config
	// AI is the language model behind the writing assistant (Groq's free tier).
	AI       AIConfig
	LogLevel slog.Level
}

// SMTPConfig describes the outgoing mail relay (Mailpit in development).
type SMTPConfig struct {
	Host     string
	Port     int
	Username string
	Password string
	// TLS is "none", "starttls" or "tls".
	TLS  string
	From string
}

// S3Config locates the CV bucket of an S3-compatible service. The keys have no default and are
// only needed by the API server (storage.NewS3Store rejects them empty), not by the CLI tools.
type S3Config struct {
	// Endpoint is an http(s) URL: "http://127.0.0.1:8333" (SeaweedFS), "https://<account>.r2.cloudflarestorage.com".
	Endpoint  string
	Region    string
	Bucket    string
	AccessKey string
	SecretKey string
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
	defaultAppBaseURL        = "http://localhost:3000"
	defaultSMTPHost          = "127.0.0.1"
	defaultSMTPPort          = "1025"
	defaultSMTPTLS           = "none"
	defaultMailFrom          = "Dieuliko <no-reply@dieuliko.local>"
	defaultS3Endpoint        = "http://127.0.0.1:8333"
	defaultS3Region          = "us-east-1"
	defaultS3Bucket          = "dieuliko-cvs"
	defaultGroqModel         = "openai/gpt-oss-120b"
	defaultGroqBaseURL       = "https://api.groq.com/openai/v1"
	// Groq's free tier allows 30 requests per minute; staying under it refuses overload before a call.
	defaultAIRequestsPerMinute = "25"
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

	appBaseURL, err := parseHTTPURL("APP_BASE_URL", get("APP_BASE_URL", defaultAppBaseURL))
	if err != nil {
		errs = append(errs, err)
	}
	smtpPort, err := strconv.Atoi(get("SMTP_PORT", defaultSMTPPort))
	if err != nil || smtpPort < 1 || smtpPort > 65535 {
		errs = append(errs, errors.New("SMTP_PORT must be a port number"))
	}
	smtp := SMTPConfig{
		Host:     get("SMTP_HOST", defaultSMTPHost),
		Port:     smtpPort,
		Username: get("SMTP_USERNAME", ""),
		Password: get("SMTP_PASSWORD", ""),
		TLS:      get("SMTP_TLS", defaultSMTPTLS),
		From:     get("MAIL_FROM", defaultMailFrom),
	}

	s3, s3Errs := loadS3(get)
	errs = append(errs, s3Errs...)
	aiConfig, aiErrs := loadAI(get)
	errs = append(errs, aiErrs...)

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
		AppBaseURL:             appBaseURL,
		SMTP:                   smtp,
		S3:                     s3,
		AI:                     aiConfig,
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

// AIConfig locates the language model provider. Without APIKey the writing assistant is disabled.
type AIConfig struct {
	APIKey  string
	Model   string
	BaseURL string
	// RequestsPerMinute is kept under the provider's own limit (30 on Groq's free tier).
	RequestsPerMinute int
}

// loadAI reads the GROQ_* and AI_* variables.
func loadAI(get func(string, string) string) (AIConfig, []error) {
	var errs []error
	baseURL, err := parseHTTPURL("GROQ_BASE_URL", get("GROQ_BASE_URL", defaultGroqBaseURL))
	if err != nil {
		errs = append(errs, err)
	}
	perMinute, err := strconv.Atoi(get("AI_REQUESTS_PER_MINUTE", defaultAIRequestsPerMinute))
	if err != nil || perMinute < 1 {
		errs = append(errs, errors.New("AI_REQUESTS_PER_MINUTE must be a positive integer"))
	}
	return AIConfig{
		APIKey:            get("GROQ_API_KEY", ""),
		Model:             get("GROQ_MODEL", defaultGroqModel),
		BaseURL:           baseURL,
		RequestsPerMinute: perMinute,
	}, errs
}

// loadS3 reads the S3_* variables.
func loadS3(get func(string, string) string) (S3Config, []error) {
	var errs []error
	endpoint, err := parseHTTPURL("S3_ENDPOINT", get("S3_ENDPOINT", defaultS3Endpoint))
	if err != nil {
		errs = append(errs, err)
	}
	return S3Config{
		Endpoint:  endpoint,
		Region:    get("S3_REGION", defaultS3Region),
		Bucket:    get("S3_BUCKET", defaultS3Bucket),
		AccessKey: get("S3_ACCESS_KEY", ""),
		SecretKey: get("S3_SECRET_KEY", ""),
	}, errs
}

// parseHTTPURL accepts an absolute http(s) URL without query and drops any trailing slash.
func parseHTTPURL(name, raw string) (string, error) {
	parsed, err := url.Parse(raw)
	if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") || parsed.Host == "" || parsed.RawQuery != "" {
		return "", fmt.Errorf("%s: %q is not an absolute http(s) URL", name, raw)
	}
	return strings.TrimRight(raw, "/"), nil
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
