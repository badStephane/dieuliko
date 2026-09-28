-- name: CreateUser :one
INSERT INTO users (email, password_hash, role, first_name, last_name)
VALUES ($1, $2, $3, $4, $5)
RETURNING id, email::text AS email, role, first_name, last_name, email_verified_at, created_at;

-- name: GetUserCredentialsByEmail :one
SELECT id, email::text AS email, role, first_name, last_name, email_verified_at, created_at, password_hash, suspended_at
FROM users
WHERE email = sqlc.arg(email)::citext;

-- Expiry is computed by PostgreSQL, the clock that also checks it.
-- name: CreateSession :one
INSERT INTO sessions (token_hash, user_id, expires_at)
VALUES ($1, $2, now() + make_interval(secs => sqlc.arg(ttl_seconds)::float8))
RETURNING expires_at;

-- Expired sessions, and those of suspended accounts, never authenticate (even before they are deleted).
-- name: GetSessionUser :one
SELECT u.id, u.email::text AS email, u.role, u.first_name, u.last_name, u.email_verified_at, u.created_at,
       s.expires_at AS session_expires_at
FROM sessions s
JOIN users u ON u.id = s.user_id
WHERE s.token_hash = $1 AND s.expires_at > now() AND u.suspended_at IS NULL;

-- name: DeleteSession :exec
DELETE FROM sessions WHERE token_hash = $1;

-- name: DeleteUserSessions :exec
DELETE FROM sessions WHERE user_id = $1;

-- name: DeleteExpiredSessions :execrows
DELETE FROM sessions WHERE expires_at <= now();

-- name: CreateEmailToken :exec
INSERT INTO email_tokens (token_hash, user_id, purpose, expires_at)
VALUES ($1, $2, $3, now() + make_interval(secs => sqlc.arg(ttl_seconds)::float8));

-- Serializes token issuance per user, so concurrent requests cannot leave two pending links.
-- name: LockUser :exec
SELECT id FROM users WHERE id = $1 FOR UPDATE;

-- Retires every pending token of a purpose, so only the latest email link works.
-- name: RetireEmailTokens :exec
UPDATE email_tokens SET used_at = now()
WHERE user_id = $1 AND purpose = $2 AND used_at IS NULL;

-- Atomic single use: two concurrent clicks on the same link cannot both succeed.
-- name: ConsumeEmailToken :one
UPDATE email_tokens SET used_at = now()
WHERE token_hash = $1 AND purpose = $2 AND used_at IS NULL AND expires_at > now()
RETURNING user_id;

-- name: DeleteExpiredEmailTokens :execrows
DELETE FROM email_tokens WHERE expires_at <= now();

-- name: MarkEmailVerified :exec
UPDATE users SET email_verified_at = now() WHERE id = $1 AND email_verified_at IS NULL;

-- name: UpdatePasswordHash :exec
UPDATE users SET password_hash = $2 WHERE id = $1;

-- name: GetUserByID :one
SELECT id, email::text AS email, role, first_name, last_name, email_verified_at, created_at
FROM users
WHERE id = $1;
