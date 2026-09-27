package mail

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/wait"
)

// Same image as docker-compose.yml.
const mailpitImage = "axllent/mailpit:v1.27"

func TestNewSMTPMailerValidatesConfig(t *testing.T) {
	valid := SMTPConfig{Host: "127.0.0.1", Port: 1025, TLS: TLSNone, From: "Dieuliko <no-reply@dieuliko.sn>"}
	tests := map[string]func(*SMTPConfig){
		"missing host":     func(c *SMTPConfig) { c.Host = "" },
		"missing port":     func(c *SMTPConfig) { c.Port = 0 },
		"unknown TLS mode": func(c *SMTPConfig) { c.TLS = "ssl" },
		"invalid sender":   func(c *SMTPConfig) { c.From = "not an address" },
	}
	for name, mutate := range tests {
		t.Run(name, func(t *testing.T) {
			cfg := valid
			mutate(&cfg)
			if _, err := NewSMTPMailer(cfg); err == nil {
				t.Fatal("accepted an invalid config")
			}
		})
	}

	for _, mode := range []string{TLSNone, TLSStartTLS, TLSImplicit} {
		cfg := valid
		cfg.TLS, cfg.Username, cfg.Password = mode, "user", "secret"
		if _, err := NewSMTPMailer(cfg); err != nil {
			t.Errorf("TLS %q: %v", mode, err)
		}
	}
}

func TestSMTPMailerDeliversToMailpit(t *testing.T) {
	if testing.Short() {
		t.Skip("integration test (needs Docker); run without -short")
	}
	ctx := context.Background()
	container, err := testcontainers.GenericContainer(ctx, testcontainers.GenericContainerRequest{
		ContainerRequest: testcontainers.ContainerRequest{
			Image:        mailpitImage,
			ExposedPorts: []string{"1025/tcp", "8025/tcp"},
			Env:          map[string]string{"MP_SMTP_DISABLE_RDNS": "true"},
			WaitingFor:   wait.ForHTTP("/livez").WithPort("8025/tcp").WithStartupTimeout(time.Minute),
		},
		Started: true,
	})
	if err != nil {
		t.Fatalf("start mailpit: %v", err)
	}
	t.Cleanup(func() { _ = container.Terminate(ctx) })
	host, err := container.Host(ctx)
	if err != nil {
		t.Fatalf("host: %v", err)
	}
	smtpPort, err := container.MappedPort(ctx, "1025/tcp")
	if err != nil {
		t.Fatalf("smtp port: %v", err)
	}
	apiPort, err := container.MappedPort(ctx, "8025/tcp")
	if err != nil {
		t.Fatalf("api port: %v", err)
	}

	mailer, err := NewSMTPMailer(SMTPConfig{Host: host, Port: int(smtpPort.Num()), TLS: TLSNone, From: "Dieuliko <no-reply@dieuliko.sn>"})
	if err != nil {
		t.Fatalf("NewSMTPMailer: %v", err)
	}
	err = mailer.Send(ctx, Message{To: "awa@example.sn", Subject: "Réinitialisez votre mot de passe", Text: "Bonjour Awa", HTML: "<p>Bonjour Awa</p>"})
	if err != nil {
		t.Fatalf("Send: %v", err)
	}

	got := latestMessage(t, fmt.Sprintf("http://%s:%d", host, apiPort.Num()))
	if got.Subject != "Réinitialisez votre mot de passe" || len(got.To) != 1 || got.To[0].Address != "awa@example.sn" ||
		got.From.Address != "no-reply@dieuliko.sn" || !strings.Contains(got.Snippet, "Bonjour Awa") {
		t.Errorf("delivered message = %+v", got)
	}
}

type mailpitAddress struct {
	Address string `json:"Address"`
}

type mailpitMessage struct {
	Subject string           `json:"Subject"`
	From    mailpitAddress   `json:"From"`
	To      []mailpitAddress `json:"To"`
	Snippet string           `json:"Snippet"`
}

func latestMessage(t *testing.T, apiURL string) mailpitMessage {
	t.Helper()
	resp, err := http.Get(apiURL + "/api/v1/messages?limit=1")
	if err != nil {
		t.Fatalf("mailpit API: %v", err)
	}
	defer resp.Body.Close()
	var body struct {
		Messages []mailpitMessage `json:"messages"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil || len(body.Messages) == 0 {
		t.Fatalf("mailpit messages: %v (%d)", err, len(body.Messages))
	}
	return body.Messages[0]
}
