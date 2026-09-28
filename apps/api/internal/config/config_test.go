package config

import (
	"log/slog"
	"slices"
	"strings"
	"testing"
)

func env(values map[string]string) func(string) (string, bool) {
	return func(key string) (string, bool) {
		value, ok := values[key]
		return value, ok
	}
}

// requiredEnv holds the variables without default; tests extend it.
func requiredEnv(extra map[string]string) func(string) (string, bool) {
	values := map[string]string{"DATABASE_URL": "postgres://localhost/db"}
	for key, value := range extra {
		values[key] = value
	}
	return env(values)
}

func TestLoadAppliesDefaults(t *testing.T) {
	cfg, err := Load(requiredEnv(nil))
	if err != nil {
		t.Fatalf("Load: %v", err)
	}

	if cfg.HTTPAddr != ":8080" {
		t.Errorf("HTTPAddr = %q, want :8080", cfg.HTTPAddr)
	}
	if !slices.Equal(cfg.CORSOrigins, []string{"http://localhost:3000"}) {
		t.Errorf("CORSOrigins = %v", cfg.CORSOrigins)
	}
	if cfg.TrustedProxies != nil {
		t.Errorf("TrustedProxies = %v, want none", cfg.TrustedProxies)
	}
	if cfg.RateLimitRPS != 20 || cfg.RateLimitBurst != 40 {
		t.Errorf("rate limit = %v/%d, want 20/40", cfg.RateLimitRPS, cfg.RateLimitBurst)
	}
	if cfg.InternalRateLimitRPS != 200 || cfg.InternalRateLimitBurst != 400 {
		t.Errorf("internal rate limit = %v/%d, want 200/400", cfg.InternalRateLimitRPS, cfg.InternalRateLimitBurst)
	}
	if cfg.LogLevel != slog.LevelInfo {
		t.Errorf("LogLevel = %v, want info", cfg.LogLevel)
	}
	if cfg.AppBaseURL != "http://localhost:3000" {
		t.Errorf("AppBaseURL = %q", cfg.AppBaseURL)
	}
	wantSMTP := SMTPConfig{Host: "127.0.0.1", Port: 1025, TLS: "none", From: "Dieuliko <no-reply@dieuliko.local>"}
	if cfg.SMTP != wantSMTP {
		t.Errorf("SMTP = %+v, want Mailpit defaults %+v", cfg.SMTP, wantSMTP)
	}
	// The keys have no default: only the API needs them, and storage.NewS3Store rejects them empty.
	wantS3 := S3Config{Endpoint: "http://127.0.0.1:8333", Region: "us-east-1", Bucket: "dieuliko-cvs"}
	if cfg.S3 != wantS3 {
		t.Errorf("S3 = %+v, want SeaweedFS defaults %+v", cfg.S3, wantS3)
	}
	// Without a key the API still starts; the writing assistant then answers "unavailable".
	wantAI := AIConfig{Model: "openai/gpt-oss-120b", BaseURL: "https://api.groq.com/openai/v1", RequestsPerMinute: 25}
	if cfg.AI != wantAI {
		t.Errorf("AI = %+v, want Groq defaults %+v", cfg.AI, wantAI)
	}
}

func TestLoadReadsEveryVariable(t *testing.T) {
	cfg, err := Load(env(map[string]string{
		"DATABASE_URL":              " postgres://db ",
		"HTTP_ADDR":                 "127.0.0.1:9000",
		"CORS_ORIGINS":              "https://dieuliko.sn, https://www.dieuliko.sn",
		"TRUSTED_PROXIES":           "10.0.0.1, 10.0.0.0/8",
		"RATE_LIMIT_RPS":            "5.5",
		"RATE_LIMIT_BURST":          "10",
		"INTERNAL_API_TOKEN":        "0123456789abcdef0123456789abcdef",
		"INTERNAL_RATE_LIMIT_RPS":   "50",
		"INTERNAL_RATE_LIMIT_BURST": "60",
		"LOG_LEVEL":                 "debug",
		"APP_BASE_URL":              "https://dieuliko.sn/",
		"SMTP_HOST":                 "smtp-relay.example",
		"SMTP_PORT":                 "587",
		"SMTP_USERNAME":             "user",
		"SMTP_PASSWORD":             "secret",
		"SMTP_TLS":                  "starttls",
		"MAIL_FROM":                 "Dieuliko <no-reply@dieuliko.sn>",
		"S3_ENDPOINT":               "https://account.r2.cloudflarestorage.com",
		"S3_REGION":                 "auto",
		"S3_BUCKET":                 "cvs",
		"S3_ACCESS_KEY":             "key",
		"S3_SECRET_KEY":             "s3-secret",
		"GROQ_API_KEY":              "gsk_key",
		"GROQ_MODEL":                "llama-3.3-70b-versatile",
		"GROQ_BASE_URL":             "https://groq.test/openai/v1/",
		"AI_REQUESTS_PER_MINUTE":    "10",
	}))
	if err != nil {
		t.Fatalf("Load: %v", err)
	}

	if cfg.DatabaseURL != "postgres://db" {
		t.Errorf("DatabaseURL = %q, want trimmed value", cfg.DatabaseURL)
	}
	if cfg.HTTPAddr != "127.0.0.1:9000" {
		t.Errorf("HTTPAddr = %q", cfg.HTTPAddr)
	}
	if !slices.Equal(cfg.CORSOrigins, []string{"https://dieuliko.sn", "https://www.dieuliko.sn"}) {
		t.Errorf("CORSOrigins = %v", cfg.CORSOrigins)
	}
	if !slices.Equal(cfg.TrustedProxies, []string{"10.0.0.1", "10.0.0.0/8"}) {
		t.Errorf("TrustedProxies = %v", cfg.TrustedProxies)
	}
	if cfg.RateLimitRPS != 5.5 || cfg.RateLimitBurst != 10 {
		t.Errorf("rate limit = %v/%d", cfg.RateLimitRPS, cfg.RateLimitBurst)
	}
	if cfg.InternalRateLimitRPS != 50 || cfg.InternalRateLimitBurst != 60 {
		t.Errorf("internal rate limit = %v/%d", cfg.InternalRateLimitRPS, cfg.InternalRateLimitBurst)
	}
	if cfg.InternalToken != "0123456789abcdef0123456789abcdef" {
		t.Errorf("InternalToken = %q", cfg.InternalToken)
	}
	if cfg.AppBaseURL != "https://dieuliko.sn" {
		t.Errorf("AppBaseURL = %q, want trailing slash removed", cfg.AppBaseURL)
	}
	wantSMTP := SMTPConfig{Host: "smtp-relay.example", Port: 587, Username: "user", Password: "secret", TLS: "starttls", From: "Dieuliko <no-reply@dieuliko.sn>"}
	if cfg.SMTP != wantSMTP {
		t.Errorf("SMTP = %+v", cfg.SMTP)
	}
	if cfg.LogLevel != slog.LevelDebug {
		t.Errorf("LogLevel = %v", cfg.LogLevel)
	}
	wantS3 := S3Config{Endpoint: "https://account.r2.cloudflarestorage.com", Region: "auto", Bucket: "cvs", AccessKey: "key", SecretKey: "s3-secret"}
	if cfg.S3 != wantS3 {
		t.Errorf("S3 = %+v", cfg.S3)
	}
	wantAI := AIConfig{APIKey: "gsk_key", Model: "llama-3.3-70b-versatile", BaseURL: "https://groq.test/openai/v1", RequestsPerMinute: 10}
	if cfg.AI != wantAI {
		t.Errorf("AI = %+v", cfg.AI)
	}
}

func TestLoadReportsEveryInvalidVariable(t *testing.T) {
	_, err := Load(env(map[string]string{
		"CORS_ORIGINS":              "localhost:3000",
		"RATE_LIMIT_RPS":            "0",
		"RATE_LIMIT_BURST":          "many",
		"INTERNAL_API_TOKEN":        "short",
		"INTERNAL_RATE_LIMIT_BURST": "-1",
		"LOG_LEVEL":                 "loud",
		"APP_BASE_URL":              "dieuliko.sn",
		"SMTP_PORT":                 "70000",
		"S3_ENDPOINT":               "127.0.0.1:8333",
		"GROQ_BASE_URL":             "groq",
		"AI_REQUESTS_PER_MINUTE":    "0",
	}))
	if err == nil {
		t.Fatal("Load succeeded, want an error")
	}

	for _, want := range []string{"DATABASE_URL", "CORS_ORIGINS", "RATE_LIMIT_RPS", "RATE_LIMIT_BURST", "INTERNAL_API_TOKEN", "INTERNAL_RATE_LIMIT_BURST", "LOG_LEVEL", "APP_BASE_URL", "SMTP_PORT", "S3_ENDPOINT", "GROQ_BASE_URL", "AI_REQUESTS_PER_MINUTE"} {
		if !strings.Contains(err.Error(), want) {
			t.Errorf("error %q does not mention %s", err, want)
		}
	}
}

func TestLoadRejectsOriginsWithAPath(t *testing.T) {
	_, err := Load(requiredEnv(map[string]string{"CORS_ORIGINS": "https://dieuliko.sn/app"}))
	if err == nil || !strings.Contains(err.Error(), "CORS_ORIGINS") {
		t.Fatalf("err = %v, want a CORS_ORIGINS error", err)
	}
}

func TestLoadRejectsCatchAllTrustedProxies(t *testing.T) {
	for _, proxy := range []string{"0.0.0.0/0", "::/0"} {
		t.Run(proxy, func(t *testing.T) {
			_, err := Load(requiredEnv(map[string]string{"TRUSTED_PROXIES": "10.0.0.1," + proxy}))
			if err == nil || !strings.Contains(err.Error(), "TRUSTED_PROXIES") {
				t.Fatalf("err = %v, want a TRUSTED_PROXIES error", err)
			}
		})
	}
}
