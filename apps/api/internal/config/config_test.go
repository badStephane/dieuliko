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

func TestLoadAppliesDefaults(t *testing.T) {
	cfg, err := Load(env(map[string]string{"DATABASE_URL": "postgres://localhost/db"}))
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
	if cfg.LogLevel != slog.LevelDebug {
		t.Errorf("LogLevel = %v", cfg.LogLevel)
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
	}))
	if err == nil {
		t.Fatal("Load succeeded, want an error")
	}

	for _, want := range []string{"DATABASE_URL", "CORS_ORIGINS", "RATE_LIMIT_RPS", "RATE_LIMIT_BURST", "INTERNAL_API_TOKEN", "INTERNAL_RATE_LIMIT_BURST", "LOG_LEVEL"} {
		if !strings.Contains(err.Error(), want) {
			t.Errorf("error %q does not mention %s", err, want)
		}
	}
}

func TestLoadRejectsOriginsWithAPath(t *testing.T) {
	_, err := Load(env(map[string]string{"DATABASE_URL": "postgres://db", "CORS_ORIGINS": "https://dieuliko.sn/app"}))
	if err == nil || !strings.Contains(err.Error(), "CORS_ORIGINS") {
		t.Fatalf("err = %v, want a CORS_ORIGINS error", err)
	}
}

func TestLoadRejectsCatchAllTrustedProxies(t *testing.T) {
	for _, proxy := range []string{"0.0.0.0/0", "::/0"} {
		t.Run(proxy, func(t *testing.T) {
			_, err := Load(env(map[string]string{"DATABASE_URL": "postgres://db", "TRUSTED_PROXIES": "10.0.0.1," + proxy}))
			if err == nil || !strings.Contains(err.Error(), "TRUSTED_PROXIES") {
				t.Fatalf("err = %v, want a TRUSTED_PROXIES error", err)
			}
		})
	}
}
