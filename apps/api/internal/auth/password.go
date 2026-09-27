package auth

import (
	"fmt"

	"github.com/alexedwards/argon2id"
)

// passwordParams follow the OWASP argon2id recommendation (19 MiB, 2 iterations, 1 lane):
// strong enough while keeping concurrent logins affordable on a small server.
var passwordParams = &argon2id.Params{
	Memory:      19 * 1024,
	Iterations:  2,
	Parallelism: 1,
	SaltLength:  16,
	KeyLength:   32,
}

// HashPassword returns an argon2id PHC string.
func HashPassword(password string) (string, error) {
	hash, err := argon2id.CreateHash(password, passwordParams)
	if err != nil {
		return "", fmt.Errorf("hash password: %w", err)
	}
	return hash, nil
}

// VerifyPassword reports whether password matches the stored hash (constant-time comparison).
func VerifyPassword(password, hash string) (bool, error) {
	match, err := argon2id.ComparePasswordAndHash(password, hash)
	if err != nil {
		return false, fmt.Errorf("verify password: %w", err)
	}
	return match, nil
}
