package auth

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"fmt"
)

// tokenBytes of randomness: 256 bits, unguessable.
const tokenBytes = 32

// tokenLength is the base64url (unpadded) length of a token.
var tokenLength = base64.RawURLEncoding.EncodedLen(tokenBytes)

// newToken returns a random opaque token and the SHA-256 digest to store instead of it.
func newToken() (string, []byte, error) {
	raw := make([]byte, tokenBytes)
	if _, err := rand.Read(raw); err != nil {
		return "", nil, fmt.Errorf("generate token: %w", err)
	}
	token := base64.RawURLEncoding.EncodeToString(raw)
	return token, hashToken(token), nil
}

func hashToken(token string) []byte {
	sum := sha256.Sum256([]byte(token))
	return sum[:]
}

// isWellFormedToken rejects obviously invalid tokens before any database lookup.
func isWellFormedToken(token string) bool {
	if len(token) != tokenLength {
		return false
	}
	_, err := base64.RawURLEncoding.DecodeString(token)
	return err == nil
}
