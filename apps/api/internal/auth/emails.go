package auth

import (
	"bytes"
	"fmt"
	htmltemplate "html/template"
	"net/url"
	texttemplate "text/template"

	"github.com/badStephane/dieuliko/apps/api/internal/mail"
)

// Front-end pages that consume the links sent by email (apps/web).
const (
	verifyEmailPath   = "/verifier-email"
	resetPasswordPath = "/reinitialiser-mot-de-passe"
)

type emailData struct {
	FirstName string
	Link      string
	Validity  string
}

type emailTemplate struct {
	subject string
	text    *texttemplate.Template
	html    *htmltemplate.Template
}

const htmlLayout = `<!doctype html>
<html lang="fr"><body style="margin:0;background:#f4f6f8;font-family:Arial,Helvetica,sans-serif;color:#111827">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" style="max-width:520px;background:#ffffff;border-radius:8px;padding:32px">
<tr><td>
<p style="margin:0 0 24px;font-size:22px;font-weight:bold">Dieuliko</p>
<p style="margin:0 0 16px;font-size:16px;line-height:24px">Bonjour {{.FirstName}},</p>
{{block "body" .}}{{end}}
<p style="margin:24px 0 0;font-size:13px;line-height:20px;color:#6b7280">Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :<br><a href="{{.Link}}" style="color:#ef791a;word-break:break-all">{{.Link}}</a></p>
</td></tr></table></td></tr></table></body></html>`

const buttonHTML = `<p style="margin:24px 0"><a href="{{.Link}}" style="display:inline-block;background:#ef791a;color:#ffffff;text-decoration:none;font-weight:bold;padding:14px 24px;border-radius:4px">%s</a></p>`

func newEmailTemplate(subject, text, htmlBody string) emailTemplate {
	layout := htmltemplate.Must(htmltemplate.New("layout").Parse(htmlLayout))
	return emailTemplate{
		subject: subject,
		text:    texttemplate.Must(texttemplate.New("text").Parse(text)),
		html:    htmltemplate.Must(layout.New("body").Parse(htmlBody)),
	}
}

var (
	verifyEmailTemplate = newEmailTemplate(
		"Confirmez votre adresse email",
		`Bonjour {{.FirstName}},

Bienvenue sur Dieuliko ! Confirmez votre adresse email en ouvrant ce lien (valable {{.Validity}}) :
{{.Link}}

Si vous n’avez pas créé de compte, ignorez ce message.
`,
		`<p style="margin:0;font-size:16px;line-height:24px">Bienvenue sur Dieuliko ! Confirmez votre adresse email pour sécuriser votre compte. Ce lien est valable {{.Validity}}.</p>`+
			fmt.Sprintf(buttonHTML, "Confirmer mon adresse")+
			`<p style="margin:0;font-size:14px;line-height:22px;color:#6b7280">Si vous n’avez pas créé de compte, ignorez ce message.</p>`,
	)
	resetPasswordTemplate = newEmailTemplate(
		"Réinitialisez votre mot de passe",
		`Bonjour {{.FirstName}},

Pour choisir un nouveau mot de passe, ouvrez ce lien (valable {{.Validity}}) :
{{.Link}}

Si vous n’êtes pas à l’origine de cette demande, ignorez ce message : votre mot de passe reste inchangé.
`,
		`<p style="margin:0;font-size:16px;line-height:24px">Vous avez demandé à réinitialiser votre mot de passe. Ce lien est valable {{.Validity}}.</p>`+
			fmt.Sprintf(buttonHTML, "Choisir un nouveau mot de passe")+
			`<p style="margin:0;font-size:14px;line-height:22px;color:#6b7280">Si vous n’êtes pas à l’origine de cette demande, ignorez ce message : votre mot de passe reste inchangé.</p>`,
	)
)

// render builds the message; the link carries the token as a query parameter.
func (t emailTemplate) render(to, firstName, appBaseURL, path, token, validity string) (mail.Message, error) {
	data := emailData{
		FirstName: firstName,
		Link:      appBaseURL + path + "?" + url.Values{"token": {token}}.Encode(),
		Validity:  validity,
	}
	var text, html bytes.Buffer
	if err := t.text.Execute(&text, data); err != nil {
		return mail.Message{}, fmt.Errorf("render %q text: %w", t.subject, err)
	}
	if err := t.html.ExecuteTemplate(&html, "layout", data); err != nil {
		return mail.Message{}, fmt.Errorf("render %q html: %w", t.subject, err)
	}
	return mail.Message{To: to, Subject: t.subject, Text: text.String(), HTML: html.String()}, nil
}
