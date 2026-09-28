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
    (SELECT count(*) FROM companies WHERE verified) AS companies_verified;

-- Companies that received the most applications in the last 30 days (sent or since withdrawn).
-- name: ListTopCompaniesByApplications :many
SELECT c.slug, c.name, c.city, count(*) AS applications
FROM applications a
JOIN companies c ON c.id = a.company_id
WHERE a.created_at >= now() - interval '30 days'
GROUP BY c.id
ORDER BY applications DESC, c.name
LIMIT 10;

-- Back-office directory search: hidden listings included, filtered by status ('visible' / 'hidden'; NULL = all)
-- and by words that must all appear in search_text (LIKE metacharacters already escaped). Keep both filters identical.
-- name: SearchAdminCompanies :many
SELECT slug, name, sector, city, verified, hidden_at, curated_at, source, updated_at
FROM companies
WHERE (sqlc.narg(status)::text IS NULL OR (sqlc.narg(status)::text = 'hidden') = (hidden_at IS NOT NULL))
  AND search_text LIKE ALL (
      SELECT '%' || normalize_text(word) || '%' FROM unnest(sqlc.arg(words)::text[]) AS word)
ORDER BY name, slug
LIMIT sqlc.arg(row_limit) OFFSET sqlc.arg(row_offset);

-- name: CountAdminCompanies :one
SELECT count(*)
FROM companies
WHERE (sqlc.narg(status)::text IS NULL OR (sqlc.narg(status)::text = 'hidden') = (hidden_at IS NOT NULL))
  AND search_text LIKE ALL (
      SELECT '%' || normalize_text(word) || '%' FROM unnest(sqlc.arg(words)::text[]) AS word);

-- name: GetAdminCompany :one
SELECT slug, name, sector, company_type, description, website, email, phone, city, address, size, social_links,
       verified, hidden_at, curated_at, source, created_at, updated_at
FROM companies
WHERE slug = $1;

-- Locks the listing while an edit compares it with the new values.
-- name: LockAdminCompany :one
SELECT slug, name, sector, company_type, description, website, email, phone, city, address, size, social_links,
       verified, hidden_at, curated_at, source, created_at, updated_at
FROM companies
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

-- name: InsertAdminAudit :exec
INSERT INTO admin_audit (admin_id, action, target_type, target_id, changed_fields)
VALUES ($1, $2, $3, $4, $5);
