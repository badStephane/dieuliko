-- Key numbers of the back-office dashboard. "With content" mirrors candidate.Profile.HasContent.
-- name: GetAdminStats :one
SELECT
    (SELECT count(*) FROM users WHERE role = 'candidate') AS candidates,
    (SELECT count(*) FROM users WHERE role = 'candidate' AND created_at >= now() - interval '7 days') AS candidates_last_7_days,
    (SELECT count(*) FROM users WHERE role = 'candidate' AND created_at >= now() - interval '30 days') AS candidates_last_30_days,
    (SELECT count(*) FROM users WHERE role = 'candidate' AND email_verified_at IS NOT NULL) AS verified_emails,
    (SELECT count(*) FROM users WHERE role = 'candidate' AND suspended_at IS NOT NULL) AS suspended_candidates,
    (SELECT count(*) FROM candidate_profiles p
     WHERE p.headline <> '' OR cardinality(p.skills) > 0
        OR EXISTS (SELECT 1 FROM candidate_experiences e WHERE e.user_id = p.user_id)
        OR EXISTS (SELECT 1 FROM candidate_educations d WHERE d.user_id = p.user_id)) AS profiles_with_content,
    (SELECT count(*) FROM candidate_cvs) AS cvs,
    (SELECT count(*) FROM cover_letters) AS letters,
    (SELECT count(*) FROM applications WHERE status = 'sent') AS applications_sent,
    (SELECT count(*) FROM applications WHERE status = 'withdrawn') AS applications_withdrawn,
    (SELECT count(*) FROM companies WHERE hidden_at IS NULL) AS companies_visible,
    (SELECT count(*) FROM companies WHERE hidden_at IS NOT NULL) AS companies_hidden,
    (SELECT count(*) FROM companies WHERE verified) AS companies_verified,
    (SELECT count(*) FROM company_claims WHERE status = 'pending') AS pending_claims,
    -- Last 7 days against the 7 before, for the dashboard's trends.
    (SELECT count(*) FROM users WHERE role = 'candidate'
       AND created_at >= now() - interval '14 days' AND created_at < now() - interval '7 days') AS candidates_previous_7_days,
    (SELECT count(*) FROM applications WHERE created_at >= now() - interval '7 days') AS applications_last_7_days,
    (SELECT count(*) FROM applications
      WHERE created_at >= now() - interval '14 days' AND created_at < now() - interval '7 days') AS applications_previous_7_days,
    (SELECT count(*) FROM cover_letters WHERE created_at >= now() - interval '7 days') AS letters_last_7_days,
    (SELECT count(*) FROM cover_letters
      WHERE created_at >= now() - interval '14 days' AND created_at < now() - interval '7 days') AS letters_previous_7_days,
    -- Listings to complete; same rules as the quality filters of SearchAdminCompanies.
    (SELECT count(*) FROM companies WHERE logo_key IS NULL AND coalesce(logo_url, '') = '') AS companies_no_logo,
    (SELECT count(*) FROM companies WHERE coalesce(description, '') = '') AS companies_no_description,
    (SELECT count(*) FROM companies
      WHERE coalesce(email, '') = '' AND coalesce(phone, '') = '' AND coalesce(website, '') = '') AS companies_no_contact;

-- Companies that received the most applications in the last 30 days (sent or since withdrawn).
-- name: ListTopCompaniesByApplications :many
SELECT c.slug, c.name, c.city, count(*) AS applications
FROM applications a
JOIN companies c ON c.id = a.company_id
WHERE a.created_at >= now() - interval '30 days'
GROUP BY c.id
ORDER BY applications DESC, c.name
LIMIT 10;

-- Sign-ups and applications per day over the last 30 days (Dakar dates, today included), oldest first.
-- name: ListDailyActivity :many
SELECT day::date AS day,
       (SELECT count(*) FROM users u
         WHERE u.role = 'candidate' AND (u.created_at AT TIME ZONE 'Africa/Dakar')::date = day::date) AS signups,
       (SELECT count(*) FROM applications a WHERE (a.created_at AT TIME ZONE 'Africa/Dakar')::date = day::date) AS applications
FROM generate_series((now() AT TIME ZONE 'Africa/Dakar')::date - 29, (now() AT TIME ZONE 'Africa/Dakar')::date, interval '1 day') AS day
ORDER BY day;

-- The newest candidate accounts (admins excluded).
-- name: ListRecentCandidates :many
SELECT id, first_name, last_name, created_at FROM users WHERE role = 'candidate' ORDER BY created_at DESC LIMIT 5;

-- The newest applications: to which listing and when, never who or what was written.
-- name: ListRecentApplications :many
SELECT c.slug, c.name, a.created_at
FROM applications a
JOIN companies c ON c.id = a.company_id
ORDER BY a.created_at DESC
LIMIT 5;

-- Back-office directory search: hidden listings included, filtered by status ('visible' / 'hidden'; NULL = all), by
-- a quality gap to fix (see admin.Quality*; NULL = all) and by words that must all appear in search_text (LIKE
-- metacharacters already escaped). Keep the filters of both queries identical. Sorted by name, or most recently
-- updated first.
-- name: SearchAdminCompanies :many
SELECT slug, name, sector, city, logo_key, verified, hidden_at, curated_at, source, updated_at
FROM companies
WHERE (sqlc.narg(status)::text IS NULL OR (sqlc.narg(status)::text = 'hidden') = (hidden_at IS NOT NULL))
  AND (sqlc.narg(quality)::text IS NULL
       OR (sqlc.narg(quality)::text = 'no-logo' AND logo_key IS NULL AND coalesce(logo_url, '') = '')
       OR (sqlc.narg(quality)::text = 'no-description' AND coalesce(description, '') = '')
       OR (sqlc.narg(quality)::text = 'no-contact'
           AND coalesce(email, '') = '' AND coalesce(phone, '') = '' AND coalesce(website, '') = '')
       OR (sqlc.narg(quality)::text = 'unverified' AND NOT verified))
  AND search_text LIKE ALL (
      SELECT '%' || normalize_text(word) || '%' FROM unnest(sqlc.arg(words)::text[]) AS word)
ORDER BY CASE WHEN sqlc.arg(sort)::text = 'updated' THEN updated_at END DESC, name, slug
LIMIT sqlc.arg(row_limit) OFFSET sqlc.arg(row_offset);

-- name: CountAdminCompanies :one
SELECT count(*)
FROM companies
WHERE (sqlc.narg(status)::text IS NULL OR (sqlc.narg(status)::text = 'hidden') = (hidden_at IS NOT NULL))
  AND (sqlc.narg(quality)::text IS NULL
       OR (sqlc.narg(quality)::text = 'no-logo' AND logo_key IS NULL AND coalesce(logo_url, '') = '')
       OR (sqlc.narg(quality)::text = 'no-description' AND coalesce(description, '') = '')
       OR (sqlc.narg(quality)::text = 'no-contact'
           AND coalesce(email, '') = '' AND coalesce(phone, '') = '' AND coalesce(website, '') = '')
       OR (sqlc.narg(quality)::text = 'unverified' AND NOT verified))
  AND search_text LIKE ALL (
      SELECT '%' || normalize_text(word) || '%' FROM unnest(sqlc.arg(words)::text[]) AS word);

-- What refers to the listing is counted: applications block its deletion, letters go with it.
-- name: GetAdminCompany :one
SELECT slug, name, sector, company_type, description, website, email, phone, city, address, size, social_links,
       logo_key, verified, hidden_at, curated_at, source, created_at, updated_at,
       (SELECT count(*) FROM applications a WHERE a.company_id = c.id) AS applications,
       (SELECT count(*) FROM cover_letters l WHERE l.company_id = c.id) AS letters
FROM companies c
WHERE slug = $1;

-- Locks the listing while an edit compares it with the new values.
-- name: LockAdminCompany :one
SELECT slug, name, sector, company_type, description, website, email, phone, city, address, size, social_links,
       logo_key, verified, hidden_at, curated_at, source, created_at, updated_at,
       (SELECT count(*) FROM applications a WHERE a.company_id = c.id) AS applications,
       (SELECT count(*) FROM cover_letters l WHERE l.company_id = c.id) AS letters
FROM companies c
WHERE slug = $1
FOR UPDATE;

-- name: SectorExists :one
SELECT EXISTS (SELECT 1 FROM sectors WHERE slug = $1);

-- name: CompanySlugTaken :one
SELECT EXISTS (SELECT 1 FROM companies WHERE slug = $1);

-- name: InsertAdminCompany :exec
INSERT INTO companies (slug, name, sector, company_type, description, website, email, phone, city, address, size,
                       social_links, source, curated_at)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'admin', now());

-- name: UpdateAdminCompany :exec
UPDATE companies
SET name = $2, sector = $3, company_type = $4, description = $5, website = $6, email = $7, phone = $8, city = $9,
    address = $10, size = $11, social_links = $12, curated_at = now()
WHERE slug = $1;

-- Hiding keeps the first hiding date; showing clears it.
-- name: SetCompanyHidden :execrows
UPDATE companies
SET hidden_at = CASE WHEN sqlc.arg(hidden)::bool THEN coalesce(hidden_at, now()) END
WHERE slug = sqlc.arg(slug);

-- name: SetCompanyVerified :execrows
UPDATE companies SET verified = sqlc.arg(verified)::bool WHERE slug = sqlc.arg(slug);

-- Locks the listing while its logo is replaced; the previous key is returned so its file can be deleted.
-- name: LockCompanyLogo :one
SELECT logo_key FROM companies WHERE slug = $1 FOR UPDATE;

-- A logo is an edit by the team: the listing becomes curated.
-- name: SetCompanyLogo :exec
UPDATE companies SET logo_key = sqlc.narg(logo_key), curated_at = now() WHERE slug = sqlc.arg(slug);

-- Letters written for the listing go with it (ON DELETE CASCADE); applications must have been checked first.
-- name: DeleteAdminCompany :one
DELETE FROM companies WHERE slug = $1 RETURNING logo_key;

-- name: InsertAdminAudit :exec
INSERT INTO admin_audit (admin_id, action, target_type, target_id, changed_fields)
VALUES ($1, $2, $3, $4, $5);

-- Back-office candidate search: status 'active' / 'suspended' (NULL = all), a step of the journey ('unverified',
-- 'no-profile', 'no-cv', 'applied'; NULL = all) and words that must all appear in the name or email (LIKE
-- metacharacters already escaped). Newest first, or by name. Keep the filters of both queries identical; "has
-- profile" mirrors candidate.Profile.HasContent. Admins are never listed, and only facts are read, never content.
-- name: SearchAdminCandidates :many
WITH candidates AS (
    SELECT u.id, u.email::text AS email, u.first_name, u.last_name, u.email_verified_at, u.suspended_at, u.created_at,
           EXISTS (SELECT 1 FROM candidate_profiles p WHERE p.user_id = u.id
                   AND (p.headline <> '' OR cardinality(p.skills) > 0
                        OR EXISTS (SELECT 1 FROM candidate_experiences e WHERE e.user_id = u.id)
                        OR EXISTS (SELECT 1 FROM candidate_educations d WHERE d.user_id = u.id))) AS has_profile,
           EXISTS (SELECT 1 FROM candidate_cvs v WHERE v.user_id = u.id) AS has_cv,
           (SELECT count(*) FROM applications a WHERE a.user_id = u.id AND a.status = 'sent') AS applications_sent
    FROM users u
    WHERE u.role = 'candidate'
)
SELECT id, email, first_name, last_name, email_verified_at, suspended_at, created_at, has_profile, has_cv, applications_sent
FROM candidates
WHERE (sqlc.narg(status)::text IS NULL OR (sqlc.narg(status)::text = 'suspended') = (suspended_at IS NOT NULL))
  AND (sqlc.narg(progress)::text IS NULL
       OR (sqlc.narg(progress)::text = 'unverified' AND email_verified_at IS NULL)
       OR (sqlc.narg(progress)::text = 'no-profile' AND NOT has_profile)
       OR (sqlc.narg(progress)::text = 'no-cv' AND NOT has_cv)
       OR (sqlc.narg(progress)::text = 'applied' AND applications_sent > 0))
  AND normalize_text(first_name || ' ' || last_name || ' ' || email) LIKE ALL (
      SELECT '%' || normalize_text(word) || '%' FROM unnest(sqlc.arg(words)::text[]) AS word)
ORDER BY CASE WHEN sqlc.arg(sort)::text = 'name' THEN normalize_text(last_name || ' ' || first_name) END,
         created_at DESC, id
LIMIT sqlc.arg(row_limit) OFFSET sqlc.arg(row_offset);

-- name: CountAdminCandidates :one
WITH candidates AS (
    SELECT u.first_name, u.last_name, u.email::text AS email, u.email_verified_at, u.suspended_at,
           EXISTS (SELECT 1 FROM candidate_profiles p WHERE p.user_id = u.id
                   AND (p.headline <> '' OR cardinality(p.skills) > 0
                        OR EXISTS (SELECT 1 FROM candidate_experiences e WHERE e.user_id = u.id)
                        OR EXISTS (SELECT 1 FROM candidate_educations d WHERE d.user_id = u.id))) AS has_profile,
           EXISTS (SELECT 1 FROM candidate_cvs v WHERE v.user_id = u.id) AS has_cv,
           (SELECT count(*) FROM applications a WHERE a.user_id = u.id AND a.status = 'sent') AS applications_sent
    FROM users u
    WHERE u.role = 'candidate'
)
SELECT count(*)
FROM candidates
WHERE (sqlc.narg(status)::text IS NULL OR (sqlc.narg(status)::text = 'suspended') = (suspended_at IS NOT NULL))
  AND (sqlc.narg(progress)::text IS NULL
       OR (sqlc.narg(progress)::text = 'unverified' AND email_verified_at IS NULL)
       OR (sqlc.narg(progress)::text = 'no-profile' AND NOT has_profile)
       OR (sqlc.narg(progress)::text = 'no-cv' AND NOT has_cv)
       OR (sqlc.narg(progress)::text = 'applied' AND applications_sent > 0))
  AND normalize_text(first_name || ' ' || last_name || ' ' || email) LIKE ALL (
      SELECT '%' || normalize_text(word) || '%' FROM unnest(sqlc.arg(words)::text[]) AS word);

-- What the back-office may know about a candidate: account status, whether each piece exists, and counts. Never the
-- content of the profile, CV, letters or applications. "Has profile" mirrors candidate.Profile.HasContent.
-- name: GetAdminCandidate :one
SELECT u.id, u.email::text AS email, u.first_name, u.last_name, u.email_verified_at, u.suspended_at, u.created_at,
       EXISTS (SELECT 1 FROM candidate_profiles p WHERE p.user_id = u.id
               AND (p.headline <> '' OR cardinality(p.skills) > 0
                    OR EXISTS (SELECT 1 FROM candidate_experiences e WHERE e.user_id = u.id)
                    OR EXISTS (SELECT 1 FROM candidate_educations d WHERE d.user_id = u.id))) AS has_profile,
       EXISTS (SELECT 1 FROM candidate_cvs cv WHERE cv.user_id = u.id) AS has_cv,
       (SELECT count(*) FROM cover_letters l WHERE l.user_id = u.id) AS letters,
       (SELECT count(*) FROM applications a WHERE a.user_id = u.id AND a.status = 'sent') AS applications_sent,
       (SELECT count(*) FROM applications a WHERE a.user_id = u.id AND a.status = 'withdrawn') AS applications_withdrawn
FROM users u
WHERE u.id = $1 AND u.role = 'candidate';

-- Serializes changes to one candidate account; admins are out of reach.
-- name: LockCandidate :one
SELECT email::text AS email, first_name, suspended_at
FROM users
WHERE id = $1 AND role = 'candidate'
FOR UPDATE;

-- name: SetUserSuspended :exec
UPDATE users
SET suspended_at = CASE WHEN sqlc.arg(suspended)::bool THEN coalesce(suspended_at, now()) END
WHERE id = sqlc.arg(id);

-- Every stored file of a candidate: the current CV and the CV copies of applications.
-- name: ListCandidateObjectKeys :many
SELECT cv.object_key FROM candidate_cvs cv WHERE cv.user_id = sqlc.arg(user_id)::uuid
UNION ALL
SELECT a.cv_object_key FROM applications a WHERE a.user_id = sqlc.arg(user_id)::uuid AND a.cv_object_key IS NOT NULL;

-- Cascades to sessions, tokens, profile, CV metadata, letters and applications.
-- name: DeleteCandidate :execrows
DELETE FROM users WHERE id = $1 AND role = 'candidate';

-- Back-office activity, newest first, optionally for one kind of target ('company' / 'user'). The admin's name and the
-- target's current label are looked up live, empty once the account or listing is gone (nothing personal is kept here).
-- name: ListAdminAudit :many
SELECT a.id, a.action, a.target_type, a.target_id, a.changed_fields, a.created_at,
       coalesce(u.first_name || ' ' || u.last_name, '')::text AS admin_name,
       coalesce(CASE a.target_type
                    WHEN 'company' THEN (SELECT c.name FROM companies c WHERE c.slug = a.target_id)
                    WHEN 'claim' THEN (SELECT c.name FROM company_claims cl JOIN companies c ON c.id = cl.company_id
                                       WHERE cl.id::text = a.target_id)
                    ELSE (SELECT t.first_name || ' ' || t.last_name FROM users t WHERE t.id::text = a.target_id)
                END, '')::text AS target_label
FROM admin_audit a
LEFT JOIN users u ON u.id = a.admin_id
WHERE sqlc.narg(target_type)::text IS NULL OR a.target_type = sqlc.narg(target_type)::text
ORDER BY a.id DESC
LIMIT sqlc.arg(row_limit) OFFSET sqlc.arg(row_offset);

-- name: CountAdminAudit :one
SELECT count(*) FROM admin_audit WHERE sqlc.narg(target_type)::text IS NULL OR target_type = sqlc.narg(target_type)::text;
