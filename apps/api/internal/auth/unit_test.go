package auth

import (
	"errors"
	"strings"
	"testing"
)

func TestTokens(t *testing.T) {
	token, hash, err := newToken()
	if err != nil {
		t.Fatalf("newToken: %v", err)
	}
	other, _, _ := newToken()

	if !isWellFormedToken(token) || token == other {
		t.Errorf("token %q should be well formed and unique", token)
	}
	if string(hash) != string(hashToken(token)) || len(hash) != 32 {
		t.Error("hash must be the SHA-256 of the token")
	}
	for _, bad := range []string{"", "short", strings.Repeat("!", tokenLength), token + "x"} {
		if isWellFormedToken(bad) {
			t.Errorf("isWellFormedToken(%q) = true", bad)
		}
	}
}

func TestPasswords(t *testing.T) {
	hash, err := HashPassword("correct horse")
	if err != nil || !strings.HasPrefix(hash, "$argon2id$") {
		t.Fatalf("HashPassword = %q, %v", hash, err)
	}

	if ok, err := VerifyPassword("correct horse", hash); !ok || err != nil {
		t.Errorf("right password: %v, %v", ok, err)
	}
	if ok, _ := VerifyPassword("wrong horse", hash); ok {
		t.Error("wrong password accepted")
	}
	if _, err := VerifyPassword("x", "not a hash"); err == nil {
		t.Error("malformed hash should error")
	}
}

func TestValidateEmail(t *testing.T) {
	valid := []string{"awa@example.sn", "a.b+tag@mail.co.sn"}
	invalid := []string{"", "awa", "awa@localhost", "Awa <awa@example.sn>", "awa@@example.sn", strings.Repeat("a", 250) + "@x.sn"}

	for _, email := range valid {
		if message := validateEmail(email); message != "" {
			t.Errorf("validateEmail(%q) = %q, want valid", email, message)
		}
	}
	for _, email := range invalid {
		if validateEmail(email) == "" {
			t.Errorf("validateEmail(%q) accepted", email)
		}
	}
}

func TestValidateRegistrationNormalizes(t *testing.T) {
	got, err := validateRegistration(RegisterInput{Email: " AWA@Example.SN ", Password: "  8 chars", FirstName: " Awa  Marie ", LastName: "Diop"})
	if err != nil {
		t.Fatalf("validateRegistration: %v", err)
	}

	want := RegisterInput{Email: "awa@example.sn", Password: "  8 chars", FirstName: "Awa Marie", LastName: "Diop", AccountType: RoleCandidate}
	if got != want {
		t.Errorf("got %+v, want %+v (password must be kept verbatim)", got, want)
	}
}

func TestValidateRegistrationAcceptsCandidateAndCompanyAccountsOnly(t *testing.T) {
	base := RegisterInput{Email: "a@b.sn", Password: "long enough", FirstName: "A", LastName: "B"}
	tests := []struct {
		accountType, want string
		isValid           bool
	}{
		{"", RoleCandidate, true},
		{"candidate", RoleCandidate, true},
		{"company", RoleCompany, true},
		{"admin", "", false},
		{"entreprise", "", false},
	}
	for _, tt := range tests {
		input := base
		input.AccountType = tt.accountType
		got, err := validateRegistration(input)
		var validation *ValidationError
		switch {
		case tt.isValid && (err != nil || got.AccountType != tt.want):
			t.Errorf("accountType %q: got %q, %v", tt.accountType, got.AccountType, err)
		case !tt.isValid && (!errors.As(err, &validation) || validation.Fields["accountType"] == ""):
			t.Errorf("accountType %q: err = %v, want an accountType error", tt.accountType, err)
		}
	}
}

func TestValidateRegistrationRejectsBadNamesAndPasswords(t *testing.T) {
	tests := map[string]RegisterInput{
		"password too long": {Email: "a@b.sn", Password: strings.Repeat("x", MaxPasswordLength+1), FirstName: "A", LastName: "B"},
		"name too long":     {Email: "a@b.sn", Password: "long enough", FirstName: strings.Repeat("é", MaxNameLength+1), LastName: "B"},
		"markup in name":    {Email: "a@b.sn", Password: "long enough", FirstName: "<script>", LastName: "B"},
		"control character": {Email: "a@b.sn", Password: "long enough", FirstName: "A", LastName: "B\x00"},
	}
	for name, input := range tests {
		t.Run(name, func(t *testing.T) {
			if _, err := validateRegistration(input); err == nil {
				t.Fatal("accepted")
			}
		})
	}
}

func TestEmailTemplatesEscapeUserData(t *testing.T) {
	msg, err := verifyEmailTemplate.render("a@b.sn", `<b>Awa</b>`, "https://dieuliko.sn", verifyEmailPath, "tok+en/=", "48 heures")
	if err != nil {
		t.Fatalf("render: %v", err)
	}

	if !strings.Contains(msg.Text, "https://dieuliko.sn/verifier-email?token=tok%2Ben%2F%3D") {
		t.Errorf("text link not found or not escaped:\n%s", msg.Text)
	}
	if strings.Contains(msg.HTML, "<b>Awa</b>") || !strings.Contains(msg.HTML, "&lt;b&gt;Awa&lt;/b&gt;") {
		t.Error("first name must be HTML-escaped")
	}
	if msg.To != "a@b.sn" || msg.Subject != "Confirmez votre adresse email" || !strings.Contains(msg.HTML, "48 heures") {
		t.Errorf("message = %+v", msg)
	}
}
