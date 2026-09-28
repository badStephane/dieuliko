package ai

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"
)

type recordedCall struct {
	path          string
	authorization string
	body          map[string]any
}

// fakeGroq answers every call with status and body, recording what it received.
func fakeGroq(t *testing.T, status int, body string) (*httptest.Server, *[]recordedCall) {
	t.Helper()
	var calls []recordedCall
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var payload map[string]any
		_ = json.NewDecoder(r.Body).Decode(&payload)
		calls = append(calls, recordedCall{path: r.URL.Path, authorization: r.Header.Get("Authorization"), body: payload})
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(status)
		_, _ = w.Write([]byte(body))
	}))
	t.Cleanup(server.Close)
	return server, &calls
}

func testConfig(baseURL string) Config {
	return Config{APIKey: "gsk_test", Model: "openai/gpt-oss-120b", BaseURL: baseURL, RequestsPerMinute: 60, Timeout: 5 * time.Second}
}

const completion = `{"choices":[{"message":{"role":"assistant","content":"  Une lettre soignée.  "}}]}`

var request = Request{
	Messages:  []Message{{Role: RoleSystem, Content: "Tu es un rédacteur."}, {Role: RoleUser, Content: "Écris."}},
	MaxTokens: 500,
}

func TestWriteSendsAChatCompletionAndReturnsTheAnswer(t *testing.T) {
	server, calls := fakeGroq(t, http.StatusOK, completion)

	got, err := NewWriter(testConfig(server.URL)).Write(context.Background(), request)

	if err != nil {
		t.Fatalf("write: %v", err)
	}
	if got != "Une lettre soignée." {
		t.Errorf("answer = %q, want it trimmed", got)
	}
	call := (*calls)[0]
	if call.path != "/chat/completions" || call.authorization != "Bearer gsk_test" {
		t.Errorf("call = %s with %q", call.path, call.authorization)
	}
	for key, want := range map[string]any{
		"model": "openai/gpt-oss-120b", "reasoning_format": "hidden", "reasoning_effort": "low", "max_completion_tokens": float64(500),
	} {
		if call.body[key] != want {
			t.Errorf("body[%s] = %v, want %v", key, call.body[key], want)
		}
	}
	if messages, _ := call.body["messages"].([]any); len(messages) != 2 {
		t.Errorf("messages = %v", call.body["messages"])
	}
}

func TestWriteMapsProviderFailures(t *testing.T) {
	tests := []struct {
		name   string
		status int
		body   string
		want   error
	}{
		{"rate limited", http.StatusTooManyRequests, `{"error":{"message":"rate limit"}}`, ErrBusy},
		{"capacity exceeded", 498, `{"error":{"message":"capacity"}}`, ErrBusy},
		{"overloaded", http.StatusServiceUnavailable, `{"error":{"message":"overloaded"}}`, ErrBusy},
		{"key refused", http.StatusUnauthorized, `{"error":{"message":"invalid api key"}}`, ErrUnavailable},
		{"empty answer", http.StatusOK, `{"choices":[{"message":{"content":"   "}}]}`, ErrEmptyAnswer},
		{"no choice", http.StatusOK, `{"choices":[]}`, ErrEmptyAnswer},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			server, _ := fakeGroq(t, tt.status, tt.body)

			_, err := NewWriter(testConfig(server.URL)).Write(context.Background(), request)

			if !errors.Is(err, tt.want) {
				t.Errorf("err = %v, want %v", err, tt.want)
			}
		})
	}
}

func TestWriteReportsOtherFailuresAsPlainErrors(t *testing.T) {
	server, _ := fakeGroq(t, http.StatusBadRequest, `{"error":{"message":"bad request"}}`)

	_, err := NewWriter(testConfig(server.URL)).Write(context.Background(), request)

	if err == nil || errors.Is(err, ErrBusy) || errors.Is(err, ErrUnavailable) {
		t.Errorf("err = %v, want a plain error", err)
	}
}

func TestWriteStaysUnderTheGlobalBudgetWithoutCallingTheProvider(t *testing.T) {
	var hits atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		hits.Add(1)
		_, _ = w.Write([]byte(completion))
	}))
	t.Cleanup(server.Close)
	cfg := testConfig(server.URL)
	cfg.RequestsPerMinute = 1
	writer := NewWriter(cfg)

	_, first := writer.Write(context.Background(), request)
	_, second := writer.Write(context.Background(), request)

	if first != nil || !errors.Is(second, ErrBusy) || hits.Load() != 1 {
		t.Errorf("first = %v, second = %v, provider hit %d times", first, second, hits.Load())
	}
}

func TestWriteAllowsAFewCallsAtOnceWithinTheBudget(t *testing.T) {
	server, calls := fakeGroq(t, http.StatusOK, completion)
	cfg := testConfig(server.URL)
	cfg.RequestsPerMinute = 25
	writer := NewWriter(cfg)

	for i := range 5 {
		if _, err := writer.Write(context.Background(), request); err != nil {
			t.Fatalf("call %d refused: %v (two candidates clicking at once must both be served)", i+1, err)
		}
	}

	if len(*calls) != 5 {
		t.Errorf("provider called %d times, want 5", len(*calls))
	}
}

func TestWriterWithoutKeyIsUnavailable(t *testing.T) {
	cfg := testConfig("http://unused.test")
	cfg.APIKey = ""

	_, err := NewWriter(cfg).Write(context.Background(), request)

	if !errors.Is(err, ErrUnavailable) {
		t.Errorf("err = %v, want ErrUnavailable", err)
	}
}
