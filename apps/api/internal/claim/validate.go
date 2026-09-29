package claim

import (
	"fmt"
	"strings"
	"unicode"
	"unicode/utf8"

	"github.com/badStephane/dieuliko/apps/api/internal/candidate"
)

// Limits mirror the CHECK constraints of company_claims.
const (
	maxJobTitleLength = 100
	maxMessageLength  = 1000
	maxSlugLength     = 120
)

// validateRequest trims the input, puts the phone in E.164 and names every invalid field.
func validateRequest(input RequestInput) (RequestInput, error) {
	clean := RequestInput{
		CompanySlug: strings.TrimSpace(input.CompanySlug),
		JobTitle:    strings.TrimSpace(input.JobTitle),
		Message:     strings.TrimSpace(strings.ReplaceAll(input.Message, "\r\n", "\n")),
	}
	fields := map[string]string{}
	if clean.CompanySlug == "" || utf8.RuneCountInString(clean.CompanySlug) > maxSlugLength {
		fields["companySlug"] = "Choisissez la fiche de votre entreprise."
	}
	switch {
	case clean.JobTitle == "":
		fields["jobTitle"] = "Indiquez votre fonction dans l’entreprise."
	case utf8.RuneCountInString(clean.JobTitle) > maxJobTitleLength:
		fields["jobTitle"] = fmt.Sprintf("%d caractères maximum.", maxJobTitleLength)
	case !utf8.ValidString(clean.JobTitle) || strings.ContainsFunc(clean.JobTitle, isForbiddenInLine):
		fields["jobTitle"] = "Ce champ contient des caractères non autorisés."
	}
	phone, isPhoneValid := candidate.NormalizePhone(input.Phone)
	if !isPhoneValid {
		fields["phone"] = "Ce numéro de téléphone n’est pas valide."
	}
	clean.Phone = phone
	switch {
	case utf8.RuneCountInString(clean.Message) > maxMessageLength:
		fields["message"] = fmt.Sprintf("%d caractères maximum.", maxMessageLength)
	case !utf8.ValidString(clean.Message) || strings.ContainsFunc(clean.Message, isForbiddenInText):
		fields["message"] = "Ce message contient des caractères non autorisés."
	}
	if len(fields) > 0 {
		return RequestInput{}, &ValidationError{Fields: fields}
	}
	return clean, nil
}

func isForbiddenInLine(r rune) bool {
	return unicode.IsControl(r) || r == '<' || r == '>'
}

func isForbiddenInText(r rune) bool {
	return unicode.IsControl(r) && r != '\n' && r != '\t'
}
