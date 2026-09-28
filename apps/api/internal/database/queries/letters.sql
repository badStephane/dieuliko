-- name: GetCompanyIDBySlug :one
SELECT id FROM companies WHERE slug = $1;

-- name: GetLetter :one
SELECT c.slug, c.name, c.city, l.content, l.updated_at
FROM cover_letters l
JOIN companies c ON c.id = l.company_id
WHERE l.user_id = $1 AND c.slug = $2;

-- name: ListLetters :many
SELECT c.slug, c.name, c.city, l.content, l.updated_at
FROM cover_letters l
JOIN companies c ON c.id = l.company_id
WHERE l.user_id = $1
ORDER BY l.updated_at DESC
LIMIT 100;

-- name: UpsertLetter :one
INSERT INTO cover_letters (user_id, company_id, content)
VALUES ($1, $2, $3)
ON CONFLICT (user_id, company_id) DO UPDATE SET content = EXCLUDED.content
RETURNING updated_at;

-- name: DeleteLetter :execrows
DELETE FROM cover_letters l
USING companies c
WHERE l.company_id = c.id AND l.user_id = $1 AND c.slug = $2;
