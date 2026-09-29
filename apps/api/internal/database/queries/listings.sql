-- A listing as its manager (the company account with the approved claim) sees and edits it.

-- name: GetMembership :one
-- The listing an account manages, if its claim is approved.
SELECT c.id, c.slug
FROM company_claims cl
JOIN companies c ON c.id = cl.company_id
WHERE cl.user_id = $1 AND cl.status = 'approved';

-- name: GetManagedListing :one
SELECT slug, name, sector, city, company_type, description, website, email, phone, address, size, social_links,
       logo_key, verified, hidden_at, updated_at
FROM companies
WHERE id = $1;

-- name: LockManagedListing :one
SELECT slug, name, sector, city, company_type, description, website, email, phone, address, size, social_links,
       logo_key, verified, hidden_at, updated_at
FROM companies
WHERE id = $1
FOR UPDATE;

-- name: UpdateManagedListing :exec
-- The fields a company edits; name, sector and city stay with the team (updated_at is set by a trigger).
UPDATE companies
SET company_type = $2, description = $3, website = $4, email = $5, phone = $6, address = $7, size = $8, social_links = $9
WHERE id = $1;

-- name: InsertCompanyActivity :exec
INSERT INTO company_activity (company_id, user_id, action, changed_fields) VALUES ($1, $2, $3, $4);

-- name: CompanyManagedBySlug :one
SELECT EXISTS (
    SELECT 1 FROM company_claims cl JOIN companies c ON c.id = cl.company_id WHERE c.slug = $1 AND cl.status = 'approved'
);
