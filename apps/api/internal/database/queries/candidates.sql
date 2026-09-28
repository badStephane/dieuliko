-- name: GetProfile :one
SELECT headline, summary, phone, city, skills, updated_at
FROM candidate_profiles
WHERE user_id = $1;

-- name: ListDesiredSectors :many
SELECT sector FROM candidate_desired_sectors WHERE user_id = $1 ORDER BY position;

-- name: ListLanguages :many
SELECT language, level FROM candidate_languages WHERE user_id = $1 ORDER BY position;

-- name: ListExperiences :many
SELECT title, organization, city, start_month, end_month, description
FROM candidate_experiences
WHERE user_id = $1
ORDER BY position;

-- name: ListEducations :many
SELECT degree, school, field, start_month, end_month, description
FROM candidate_educations
WHERE user_id = $1
ORDER BY position;

-- Takes the profile row lock first, so concurrent saves of one profile run one after the other.
-- name: UpsertProfile :one
INSERT INTO candidate_profiles (user_id, headline, summary, phone, city, skills)
VALUES ($1, $2, $3, $4, $5, $6)
ON CONFLICT (user_id) DO UPDATE
SET headline = EXCLUDED.headline, summary = EXCLUDED.summary, phone = EXCLUDED.phone,
    city = EXCLUDED.city, skills = EXCLUDED.skills
RETURNING updated_at;

-- name: DeleteProfileLists :exec
WITH sectors AS (DELETE FROM candidate_desired_sectors s WHERE s.user_id = $1),
     languages AS (DELETE FROM candidate_languages l WHERE l.user_id = $1),
     experiences AS (DELETE FROM candidate_experiences x WHERE x.user_id = $1)
DELETE FROM candidate_educations e WHERE e.user_id = $1;

-- name: InsertDesiredSector :exec
INSERT INTO candidate_desired_sectors (user_id, position, sector) VALUES ($1, $2, $3);

-- name: InsertLanguage :exec
INSERT INTO candidate_languages (user_id, position, language, level) VALUES ($1, $2, $3, $4);

-- name: InsertExperience :exec
INSERT INTO candidate_experiences (user_id, position, title, organization, city, start_month, end_month, description)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8);

-- name: InsertEducation :exec
INSERT INTO candidate_educations (user_id, position, degree, school, field, start_month, end_month, description)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8);

-- name: GetCV :one
SELECT object_key, file_name, size_bytes, uploaded_at FROM candidate_cvs WHERE user_id = $1;

-- name: UpsertCV :one
INSERT INTO candidate_cvs (user_id, object_key, file_name, size_bytes)
VALUES ($1, $2, $3, $4)
ON CONFLICT (user_id) DO UPDATE
SET object_key = EXCLUDED.object_key, file_name = EXCLUDED.file_name,
    size_bytes = EXCLUDED.size_bytes, uploaded_at = now()
RETURNING uploaded_at;

-- name: DeleteCV :one
DELETE FROM candidate_cvs WHERE user_id = $1 RETURNING object_key;
