-- name: CountApplicationsSince :one
SELECT count(*) FROM applications WHERE user_id = $1 AND created_at >= $2;

-- name: InsertApplication :one
INSERT INTO applications (user_id, company_id, first_name, last_name, email, profile, letter, cv_object_key, cv_file_name, cv_size_bytes)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
RETURNING id, created_at;

-- name: ListApplications :many
SELECT a.id, c.slug, c.name, c.city, a.status, a.created_at, a.withdrawn_at
FROM applications a
JOIN companies c ON c.id = a.company_id
WHERE a.user_id = $1
ORDER BY a.created_at DESC
LIMIT 100;

-- name: GetApplication :one
SELECT a.id, c.slug, c.name, c.city, a.status, a.created_at, a.withdrawn_at,
       a.first_name, a.last_name, a.email, a.profile, a.letter, a.cv_file_name, a.cv_size_bytes
FROM applications a
JOIN companies c ON c.id = a.company_id
WHERE a.id = $1 AND a.user_id = $2;

-- Erases the snapshot and returns the CV copy's key (read before the update), so the caller deletes the file.
-- No row when the application is unknown, someone else's, or already withdrawn.
-- name: WithdrawApplication :one
UPDATE applications AS a
SET status = 'withdrawn', withdrawn_at = now(),
    first_name = NULL, last_name = NULL, email = NULL, profile = NULL, letter = NULL,
    cv_object_key = NULL, cv_file_name = NULL, cv_size_bytes = NULL
FROM applications AS old
WHERE a.id = old.id AND a.id = $1 AND a.user_id = $2 AND a.status = 'sent'
RETURNING old.cv_object_key;
