-- Company accounts asking to manage a listing (see migration 00008).

-- name: GetLatestClaim :one
-- The account's most recent request, with the listing it is about.
SELECT cl.id, cl.status, cl.job_title, cl.phone, cl.message, cl.decision_reason, cl.reviewed_at, cl.created_at,
       c.slug, c.name, c.city, c.logo_key
FROM company_claims cl
JOIN companies c ON c.id = cl.company_id
WHERE cl.user_id = $1
ORDER BY cl.created_at DESC
LIMIT 1;

-- name: CompanyHasManager :one
SELECT EXISTS (SELECT 1 FROM company_claims WHERE company_id = $1 AND status = 'approved');

-- name: InsertClaim :one
INSERT INTO company_claims (user_id, company_id, job_title, phone, message)
VALUES ($1, $2, $3, $4, $5)
RETURNING id;

-- name: CancelPendingClaim :execrows
UPDATE company_claims SET status = 'cancelled' WHERE user_id = $1 AND status = 'pending';

-- Back-office review of claims.

-- name: ListAdminClaims :many
-- Pending requests oldest first (the queue); reviewed ones most recent first.
SELECT cl.id, cl.status, cl.job_title, cl.created_at, cl.reviewed_at,
       u.first_name, u.last_name, u.email::text AS email, (u.email_verified_at IS NOT NULL)::boolean AS email_verified,
       c.slug, c.name, c.city
FROM company_claims cl
JOIN users u ON u.id = cl.user_id
JOIN companies c ON c.id = cl.company_id
WHERE cl.status = sqlc.arg(status)
ORDER BY CASE WHEN cl.status = 'pending' THEN cl.created_at END ASC,
         coalesce(cl.reviewed_at, cl.created_at) DESC
LIMIT sqlc.arg(row_limit) OFFSET sqlc.arg(row_offset);

-- name: CountAdminClaims :one
SELECT count(*) FROM company_claims WHERE status = $1;

-- name: GetAdminClaim :one
SELECT cl.id, cl.status, cl.job_title, cl.phone, cl.message, cl.decision_reason, cl.created_at, cl.reviewed_at,
       u.id AS user_id, u.first_name, u.last_name, u.email::text AS email, (u.email_verified_at IS NOT NULL)::boolean AS email_verified,
       u.created_at AS user_created_at,
       c.id AS company_id, c.slug, c.name, c.city, c.website, c.email AS company_email, c.verified, c.hidden_at
FROM company_claims cl
JOIN users u ON u.id = cl.user_id
JOIN companies c ON c.id = cl.company_id
WHERE cl.id = $1;

-- name: ListOtherClaimsOfCompany :many
-- The other requests on the same listing, for the admin to compare.
SELECT cl.id, cl.status, cl.created_at, u.first_name, u.last_name, u.email::text AS email
FROM company_claims cl
JOIN users u ON u.id = cl.user_id
WHERE cl.company_id = $1 AND cl.id <> $2
ORDER BY cl.created_at DESC
LIMIT 20;

-- name: LockClaim :one
SELECT id, user_id, company_id, status FROM company_claims WHERE id = $1 FOR UPDATE;

-- name: SetClaimReview :exec
UPDATE company_claims
SET status = sqlc.arg(status), decision_reason = sqlc.narg(decision_reason), reviewed_by = sqlc.arg(reviewed_by), reviewed_at = now()
WHERE id = sqlc.arg(id);

-- name: RejectOtherPendingClaims :many
-- Once a listing has its manager, the other pending requests on it are rejected; their authors are told why.
WITH rejected AS (
    UPDATE company_claims AS pending
    SET status = 'rejected', decision_reason = sqlc.arg(decision_reason), reviewed_by = sqlc.arg(reviewed_by), reviewed_at = now()
    WHERE pending.company_id = sqlc.arg(company_id) AND pending.id <> sqlc.arg(approved_id) AND pending.status = 'pending'
    RETURNING pending.id, pending.user_id
)
SELECT r.id, u.email::text AS email, u.first_name
FROM rejected r
JOIN users u ON u.id = r.user_id;

-- name: MarkCompanyVerifiedByClaim :exec
UPDATE companies SET verified = true, curated_at = now() WHERE id = $1;
