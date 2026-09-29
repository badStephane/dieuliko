package admin

import (
	"bytes"
	"fmt"
	htmltemplate "html/template"
	texttemplate "text/template"

	"github.com/badStephane/dieuliko/apps/api/internal/mail"
)

// notice is an email telling someone what the team did to their account or request, with an optional link to act on.
type notice struct {
	subject     string
	lines       []string
	actionLabel string
	actionURL   string
}

var (
	suspendedNotice = notice{
		subject: "Votre compte Dieuliko est suspendu",
		lines: []string{
			"Votre compte Dieuliko a été suspendu par notre équipe : vous ne pouvez plus vous connecter pour le moment.",
			"Pour en savoir plus ou contester cette décision, écrivez-nous depuis la page de contact.",
		},
	}
	reactivatedNotice = notice{
		subject: "Votre compte Dieuliko est réactivé",
		lines:   []string{"Votre compte Dieuliko est de nouveau actif : vous pouvez vous reconnecter."},
	}
	deletedNotice = notice{
		subject: "Votre compte Dieuliko a été supprimé",
		lines: []string{
			"Votre compte Dieuliko a été supprimé par notre équipe, avec votre profil, votre CV, vos lettres et vos candidatures.",
			"Pour toute question, écrivez-nous depuis la page de contact.",
		},
	}
)

// approvedNotice tells the requester they now manage the listing.
func approvedNotice(companyName, spaceURL string) notice {
	return notice{
		subject: "Votre demande pour " + companyName + " est acceptée",
		lines: []string{
			"Bonne nouvelle : vous gérez désormais la fiche " + companyName + " sur Dieuliko.",
			"Depuis votre espace entreprise, vous pouvez lire les candidatures spontanées reçues, y répondre et mettre à jour votre fiche.",
		},
		actionLabel: "Ouvrir mon espace entreprise",
		actionURL:   spaceURL,
	}
}

// rejectedNotice tells the requester their request was turned down, and why.
func rejectedNotice(companyName, reason string) notice {
	return notice{
		subject: "Votre demande pour " + companyName + " n’a pas été acceptée",
		lines: []string{
			"Votre demande pour gérer la fiche " + companyName + " sur Dieuliko n’a pas été acceptée.",
			"Motif : " + reason,
		},
	}
}

// revokedNotice tells the manager they no longer manage the listing, and why.
func revokedNotice(companyName, reason string) notice {
	return notice{
		subject: "Vous ne gérez plus la fiche " + companyName,
		lines: []string{
			"Votre accès à la fiche " + companyName + " sur Dieuliko a été retiré par notre équipe.",
			"Motif : " + reason,
		},
	}
}

const noticeText = `Bonjour {{.FirstName}},
{{range .Lines}}
{{.}}
{{end}}{{if .ActionURL}}
{{.ActionLabel}} : {{.ActionURL}}
{{end}}
Contact : {{.ContactURL}}

L’équipe Dieuliko
`

const noticeHTML = `<!doctype html>
<html lang="fr"><body style="margin:0;background:#f4f6f8;font-family:Arial,Helvetica,sans-serif;color:#111827">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" style="max-width:520px;background:#ffffff;border-radius:8px;padding:32px"><tr><td>
<p style="margin:0 0 24px;font-size:22px;font-weight:bold">Dieuliko</p>
<p style="margin:0 0 16px;font-size:16px;line-height:24px">Bonjour {{.FirstName}},</p>
{{range .Lines}}<p style="margin:0 0 16px;font-size:16px;line-height:24px">{{.}}</p>{{end}}
{{if .ActionURL}}<p style="margin:8px 0 16px"><a href="{{.ActionURL}}" style="display:inline-block;background:#ef791a;color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 20px;border-radius:8px">{{.ActionLabel}}</a></p>{{end}}
<p style="margin:24px 0 0;font-size:16px"><a href="{{.ContactURL}}" style="color:#ef791a">Nous contacter</a></p>
</td></tr></table></td></tr></table></body></html>`

var (
	noticeTextTemplate = texttemplate.Must(texttemplate.New("notice").Parse(noticeText))
	noticeHTMLTemplate = htmltemplate.Must(htmltemplate.New("notice").Parse(noticeHTML))
)

// message renders the notice for one person (the HTML version escapes the name and the lines).
func (n notice) message(to, firstName, contactURL string) (mail.Message, error) {
	data := struct {
		FirstName, ContactURL, ActionLabel, ActionURL string
		Lines                                         []string
	}{firstName, contactURL, n.actionLabel, n.actionURL, n.lines}
	var text, html bytes.Buffer
	if err := noticeTextTemplate.Execute(&text, data); err != nil {
		return mail.Message{}, fmt.Errorf("render %q: %w", n.subject, err)
	}
	if err := noticeHTMLTemplate.Execute(&html, data); err != nil {
		return mail.Message{}, fmt.Errorf("render %q: %w", n.subject, err)
	}
	return mail.Message{To: to, Subject: n.subject, Text: text.String(), HTML: html.String()}, nil
}
