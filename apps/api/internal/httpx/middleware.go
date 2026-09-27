package httpx

import (
	"crypto/subtle"
	"fmt"
	"log/slog"
	"net/http"
	"sync"
	"time"

	"github.com/gin-contrib/requestid"
	"github.com/gin-gonic/gin"
	"golang.org/x/time/rate"
)

// AccessLog logs one structured line per request, including handler errors.
func AccessLog(logger *slog.Logger) gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		c.Next()

		status := c.Writer.Status()
		attrs := []any{
			slog.String("request_id", requestid.Get(c)),
			slog.String("method", c.Request.Method),
			slog.String("route", c.FullPath()),
			slog.String("path", c.Request.URL.Path),
			slog.Int("status", status),
			slog.Duration("duration", time.Since(start)),
			slog.String("client_ip", c.ClientIP()),
		}
		if len(c.Errors) > 0 {
			attrs = append(attrs, slog.String("error", c.Errors.String()))
		}

		level := slog.LevelInfo
		if status >= http.StatusInternalServerError {
			level = slog.LevelError
		}
		logger.Log(c.Request.Context(), level, "http request", attrs...)
	}
}

// Recover turns panics into a logged 500 with the standard envelope.
func Recover() gin.HandlerFunc {
	return gin.CustomRecoveryWithWriter(nil, func(c *gin.Context, recovered any) {
		InternalError(c, fmt.Errorf("panic: %v", recovered))
	})
}

// SecurityHeaders sets headers that are always safe for a JSON API.
func SecurityHeaders() gin.HandlerFunc {
	return func(c *gin.Context) {
		header := c.Writer.Header()
		header.Set("X-Content-Type-Options", "nosniff")
		header.Set("X-Frame-Options", "DENY")
		header.Set("Referrer-Policy", "no-referrer")
		c.Next()
	}
}

// RateLimiter is a per-client-IP token bucket. Idle buckets are evicted to bound memory.
type RateLimiter struct {
	limit   rate.Limit
	burst   int
	idleTTL time.Duration
	now     func() time.Time

	mu      sync.Mutex
	clients map[string]*clientBucket
}

type clientBucket struct {
	limiter  *rate.Limiter
	lastSeen time.Time
}

// NewRateLimiter allows `perSecond` requests per client on average, with bursts up to `burst`.
func NewRateLimiter(perSecond float64, burst int, idleTTL time.Duration) *RateLimiter {
	return &RateLimiter{
		limit:   rate.Limit(perSecond),
		burst:   burst,
		idleTTL: idleTTL,
		now:     time.Now,
		clients: make(map[string]*clientBucket),
	}
}

// Allow reports whether the client may make a request now.
func (l *RateLimiter) Allow(client string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()

	now := l.now()
	bucket, ok := l.clients[client]
	if !ok {
		bucket = &clientBucket{limiter: rate.NewLimiter(l.limit, l.burst)}
		l.clients[client] = bucket
	}
	bucket.lastSeen = now
	return bucket.limiter.AllowN(now, 1)
}

// Evict drops buckets idle for longer than the TTL; call it periodically.
func (l *RateLimiter) Evict() {
	l.mu.Lock()
	defer l.mu.Unlock()

	cutoff := l.now().Add(-l.idleTTL)
	for client, bucket := range l.clients {
		if bucket.lastSeen.Before(cutoff) {
			delete(l.clients, client)
		}
	}
}

// InternalTokenHeader carries the shared secret of trusted server-side callers.
const InternalTokenHeader = "X-Internal-Token"

// HasInternalToken reports whether a request presents the internal token (constant-time comparison).
// An empty token disables the check: no request is then considered internal.
func HasInternalToken(token string) func(*gin.Context) bool {
	return func(c *gin.Context) bool {
		presented := c.GetHeader(InternalTokenHeader)
		return token != "" && subtle.ConstantTimeCompare([]byte(presented), []byte(token)) == 1
	}
}

// internalClient is the bucket key shared by every request presenting the internal token.
const internalClient = "internal"

// RateLimit answers 429 to clients over their budget. Public requests get one bucket per client IP;
// requests for which isInternal returns true share a single bucket of the internal limiter.
func RateLimit(public, internal *RateLimiter, isInternal func(*gin.Context) bool) gin.HandlerFunc {
	return func(c *gin.Context) {
		limiter, client := public, c.ClientIP()
		if isInternal(c) {
			limiter, client = internal, internalClient
		}
		if !limiter.Allow(client) {
			c.Header("Retry-After", "1")
			Fail(c, http.StatusTooManyRequests, CodeRateLimited, "Trop de requêtes. Patientez quelques secondes.")
			return
		}
		c.Next()
	}
}
