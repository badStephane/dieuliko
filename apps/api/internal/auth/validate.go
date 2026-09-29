package auth

import (
	"cmp"
	"net/mail"
	"strings"
	"unicode"
	"unicode/utf8"
)

// Input limits.
const (
	MinPasswordLength = 8
	// MaxPasswordLength bounds hashing cost; long passphrases remain possible.
	MaxPasswordLength = 128
	MaxEmailLength    = 254
	MaxNameLength     = 60
)

// normalizeEmail trims and lowercases an address.
func normalizeEmail(email string) string {
	return strings.ToLower(strings.TrimSpace(email))
}

// validateEmail expects a normalized address; the domain must contain a dot ("a@b" is rejected).
func validateEmail(email string) string {
	if email == "" {
		return "Saisissez votre adresse email."
	}
	parsed, err := mail.ParseAddress(email)
	if err != nil || parsed.Address != email || len(email) > MaxEmailLength {
		return "Cette adresse email n’est pas valide."
	}
	domain := email[strings.LastIndex(email, "@")+1:]
	if !strings.Contains(strings.Trim(domain, "."), ".") {
		return "Cette adresse email n’est pas valide."
	}
	return ""
}

func validatePassword(password string) string {
	switch length := utf8.RuneCountInString(password); {
	case length < MinPasswordLength:
		return "Le mot de passe doit contenir au moins 8 caractères."
	case length > MaxPasswordLength:
		return "Le mot de passe ne peut pas dépasser 128 caractères."
	}
	return ""
}

// normalizeName trims and collapses inner whitespace ("  Awa   Diop " → "Awa Diop").
func normalizeName(name string) string {
	return strings.Join(strings.Fields(name), " ")
}

func validateName(name, label string) string {
	if name == "" {
		return "Saisissez votre " + label + "."
	}
	if utf8.RuneCountInString(name) > MaxNameLength {
		return "Ce champ ne peut pas dépasser 60 caractères."
	}
	if strings.ContainsFunc(name, func(r rune) bool { return unicode.IsControl(r) || r == '<' || r == '>' }) {
		return "Ce champ contient des caractères non autorisés."
	}
	return ""
}

// validateRegistration normalizes the input and reports every invalid field.
func validateRegistration(input RegisterInput) (RegisterInput, error) {
	normalized := RegisterInput{
		Email:       normalizeEmail(input.Email),
		Password:    input.Password,
		FirstName:   normalizeName(input.FirstName),
		LastName:    normalizeName(input.LastName),
		AccountType: cmp.Or(input.AccountType, RoleCandidate),
	}
	fields := map[string]string{}
	addField(fields, "email", validateEmail(normalized.Email))
	addField(fields, "password", validatePassword(normalized.Password))
	addField(fields, "firstName", validateName(normalized.FirstName, "prénom"))
	addField(fields, "lastName", validateName(normalized.LastName, "nom"))
	if normalized.AccountType != RoleCandidate && normalized.AccountType != RoleCompany {
		addField(fields, "accountType", "Type de compte inconnu.")
	}
	if len(fields) > 0 {
		return RegisterInput{}, &ValidationError{Fields: fields}
	}
	return normalized, nil
}

// validateNewPassword wraps the password rule as a ValidationError.
func validateNewPassword(password string) error {
	if message := validatePassword(password); message != "" {
		return &ValidationError{Fields: map[string]string{"password": message}}
	}
	return nil
}

func addField(fields map[string]string, name, message string) {
	if message != "" {
		fields[name] = message
	}
}
