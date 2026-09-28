// Package ai writes text with a large language model. Groq's OpenAI-compatible API is the provider; its free
// tier is small, so every call goes through a global budget and overload surfaces as ErrBusy.
package ai

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"golang.org/x/time/rate"
)

// Errors the callers translate into user messages.
var (
	// ErrBusy means the provider (or our own budget of it) is saturated: retry in a minute.
	ErrBusy = errors.New("ai: provider busy")
	// ErrUnavailable means AI writing is not configured or the key is refused.
	ErrUnavailable = errors.New("ai: unavailable")
	// ErrEmptyAnswer means the model answered nothing usable.
	ErrEmptyAnswer = errors.New("ai: empty answer")
)

// Message roles.
const (
	RoleSystem = "system"
	RoleUser   = "user"
)

// statusCapacityExceeded is Groq's custom "flex tier at capacity" status.
const statusCapacityExceeded = 498

// maxErrorBody bounds how much of a failed response is read for the logs.
const maxErrorBody = 4 << 10

// burstShare is the part of the per-minute budget that may be spent at once, so candidates clicking
// together are all served while the sustained rate stays under the provider's limit.
const burstShare = 5

// Message is one turn of the conversation sent to the model.
type Message struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

// Reasoning efforts: more reasoning follows the instructions more closely, at the cost of time and tokens.
const (
	ReasoningLow    = "low"
	ReasoningMedium = "medium"
)

// Request asks for one answer; MaxTokens bounds its length (and the tokens spent, reasoning included).
type Request struct {
	Messages    []Message
	MaxTokens   int
	Temperature float64
	// ReasoningEffort is ReasoningLow when empty.
	ReasoningEffort string
}

// Writer produces text from a conversation.
type Writer interface {
	Write(ctx context.Context, req Request) (string, error)
}

// Config locates the provider and sizes the global budget.
type Config struct {
	APIKey  string
	Model   string
	BaseURL string
	// RequestsPerMinute is our own ceiling, kept under the provider's so overload is refused before a call.
	RequestsPerMinute int
	Timeout           time.Duration
}

// NewWriter returns a Groq-backed writer, or one that always answers ErrUnavailable without an API key.
func NewWriter(cfg Config) Writer {
	if cfg.APIKey == "" {
		return disabled{}
	}
	perMinute := max(cfg.RequestsPerMinute, 1)
	return &groq{
		cfg:     cfg,
		client:  &http.Client{Timeout: cfg.Timeout},
		limiter: rate.NewLimiter(rate.Every(time.Minute/time.Duration(perMinute)), max(perMinute/burstShare, 1)),
	}
}

type disabled struct{}

func (disabled) Write(context.Context, Request) (string, error) {
	return "", fmt.Errorf("%w: GROQ_API_KEY is not set", ErrUnavailable)
}

type groq struct {
	cfg     Config
	client  *http.Client
	limiter *rate.Limiter
}

type chatRequest struct {
	Model           string    `json:"model"`
	Messages        []Message `json:"messages"`
	Temperature     float64   `json:"temperature"`
	MaxTokens       int       `json:"max_completion_tokens"`
	ReasoningFormat string    `json:"reasoning_format"`
	ReasoningEffort string    `json:"reasoning_effort"`
}

type chatResponse struct {
	Choices []struct {
		FinishReason string `json:"finish_reason"`
		Message      struct {
			Content string `json:"content"`
		} `json:"message"`
	} `json:"choices"`
}

// errReasoningRanOut marks an empty answer cut at the token limit: the hidden reasoning used the whole budget.
var errReasoningRanOut = fmt.Errorf("%w: reasoning used the whole token budget", ErrEmptyAnswer)

// Write asks once at the requested effort. When reasoning above "low" runs away and leaves no answer (it happens
// about once in three letters at "medium" on Groq), it asks once more at "low", which has always answered.
func (g *groq) Write(ctx context.Context, req Request) (string, error) {
	effort := req.ReasoningEffort
	if effort == "" {
		effort = ReasoningLow
	}
	answer, err := g.attempt(ctx, req, effort)
	if !errors.Is(err, errReasoningRanOut) || effort == ReasoningLow {
		return answer, err
	}
	return g.attempt(ctx, req, ReasoningLow)
}

// attempt makes one call, within the global budget; reasoning stays hidden (only the final text is returned).
func (g *groq) attempt(ctx context.Context, req Request, effort string) (string, error) {
	if !g.limiter.Allow() {
		return "", fmt.Errorf("%w: global budget spent", ErrBusy)
	}
	payload, err := json.Marshal(chatRequest{
		Model: g.cfg.Model, Messages: req.Messages, Temperature: req.Temperature, MaxTokens: req.MaxTokens,
		ReasoningFormat: "hidden", ReasoningEffort: effort,
	})
	if err != nil {
		return "", fmt.Errorf("ai: encode request: %w", err)
	}
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, strings.TrimRight(g.cfg.BaseURL, "/")+"/chat/completions", bytes.NewReader(payload))
	if err != nil {
		return "", fmt.Errorf("ai: build request: %w", err)
	}
	httpReq.Header.Set("Authorization", "Bearer "+g.cfg.APIKey)
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := g.client.Do(httpReq)
	if err != nil {
		return "", fmt.Errorf("%w: %w", ErrBusy, err) // timeouts and network failures: worth retrying later
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		return "", failure(resp)
	}
	var body chatResponse
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		return "", fmt.Errorf("ai: decode response: %w", err)
	}
	if len(body.Choices) == 0 {
		return "", ErrEmptyAnswer
	}
	choice := body.Choices[0]
	content := strings.TrimSpace(choice.Message.Content)
	switch {
	case content == "" && choice.FinishReason == "length":
		return "", errReasoningRanOut
	case content == "":
		return "", ErrEmptyAnswer
	}
	return content, nil
}

// failure maps a non-200 answer to an error; the provider's message is kept for the logs only.
func failure(resp *http.Response) error {
	detail, _ := io.ReadAll(io.LimitReader(resp.Body, maxErrorBody))
	cause := fmt.Errorf("groq answered %d: %s", resp.StatusCode, strings.TrimSpace(string(detail)))
	switch resp.StatusCode {
	case http.StatusTooManyRequests, statusCapacityExceeded, http.StatusServiceUnavailable:
		return fmt.Errorf("%w: %w", ErrBusy, cause)
	case http.StatusUnauthorized, http.StatusForbidden:
		return fmt.Errorf("%w: %w", ErrUnavailable, cause)
	default:
		return cause
	}
}
