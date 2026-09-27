// Package mail sends transactional emails. Callers depend on Mailer; SMTP is the only transport
// (Mailpit in development, any SMTP provider in production).
package mail

import (
	"context"
	"errors"
	"fmt"
	"time"

	gomail "github.com/wneessen/go-mail"
)

// TLS modes accepted by SMTPConfig.TLS.
const (
	TLSNone     = "none"     // plain SMTP (Mailpit, local relays)
	TLSStartTLS = "starttls" // STARTTLS required (port 587)
	TLSImplicit = "tls"      // TLS from the first byte (port 465)
)

const sendTimeout = 15 * time.Second

// Message is one email with a plain-text body and an optional HTML alternative.
type Message struct {
	To      string
	Subject string
	Text    string
	HTML    string
}

// Mailer sends messages.
type Mailer interface {
	Send(ctx context.Context, msg Message) error
}

// SMTPConfig describes the SMTP relay.
type SMTPConfig struct {
	Host     string
	Port     int
	Username string
	Password string
	TLS      string
	// From is the sender, e.g. "Dieuliko <no-reply@dieuliko.sn>".
	From string
}

// SMTPMailer sends through an SMTP relay, one connection per message (low volume).
type SMTPMailer struct {
	host string
	from string
	opts []gomail.Option
}

// NewSMTPMailer validates the configuration.
func NewSMTPMailer(cfg SMTPConfig) (*SMTPMailer, error) {
	if cfg.Host == "" || cfg.Port <= 0 || cfg.From == "" {
		return nil, errors.New("mail: host, port and from are required")
	}
	opts := []gomail.Option{gomail.WithPort(cfg.Port), gomail.WithTimeout(sendTimeout)}
	switch cfg.TLS {
	case TLSNone:
		opts = append(opts, gomail.WithTLSPolicy(gomail.NoTLS))
	case TLSStartTLS:
		opts = append(opts, gomail.WithTLSPolicy(gomail.TLSMandatory))
	case TLSImplicit:
		opts = append(opts, gomail.WithSSL())
	default:
		return nil, fmt.Errorf("mail: unknown TLS mode %q (want %s, %s or %s)", cfg.TLS, TLSNone, TLSStartTLS, TLSImplicit)
	}
	if cfg.Username != "" {
		opts = append(opts,
			gomail.WithSMTPAuth(gomail.SMTPAuthPlain),
			gomail.WithUsername(cfg.Username),
			gomail.WithPassword(cfg.Password),
		)
	}
	// Validate the sender once, at startup.
	if err := gomail.NewMsg().From(cfg.From); err != nil {
		return nil, fmt.Errorf("mail: invalid from address: %w", err)
	}
	return &SMTPMailer{host: cfg.Host, from: cfg.From, opts: opts}, nil
}

// Send delivers one message.
func (m *SMTPMailer) Send(ctx context.Context, msg Message) error {
	email := gomail.NewMsg()
	if err := email.From(m.from); err != nil {
		return fmt.Errorf("mail: from: %w", err)
	}
	if err := email.To(msg.To); err != nil {
		return fmt.Errorf("mail: to: %w", err)
	}
	email.Subject(msg.Subject)
	email.SetBodyString(gomail.TypeTextPlain, msg.Text)
	if msg.HTML != "" {
		email.AddAlternativeString(gomail.TypeTextHTML, msg.HTML)
	}

	client, err := gomail.NewClient(m.host, m.opts...)
	if err != nil {
		return fmt.Errorf("mail: client: %w", err)
	}
	if err := client.DialAndSendWithContext(ctx, email); err != nil {
		return fmt.Errorf("mail: send to %s: %w", msg.To, err)
	}
	return nil
}
