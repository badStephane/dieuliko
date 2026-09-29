-- name: SearchCompanies :many
-- Filters shared with CountCompanies (keep them identical): sector slug, city (compared on
-- normalize_text) and words that must all appear in search_text, LIKE metacharacters already escaped.
-- Hidden companies (back-office) are left out of every public query.
SELECT slug, name, sector, company_type, description, website, email, phone, city, address,
       size, logo_url, logo_key, social_links, accepts_spontaneous, verified, rating, rating_count
FROM companies
WHERE hidden_at IS NULL
  AND (sqlc.narg(sector)::text IS NULL OR sector = sqlc.narg(sector))
  AND (sqlc.narg(city)::text IS NULL OR city_key = normalize_text(sqlc.narg(city)))
  AND search_text LIKE ALL (
      SELECT '%' || normalize_text(word) || '%' FROM unnest(sqlc.arg(words)::text[]) AS word)
ORDER BY rating_count DESC, name, slug
LIMIT sqlc.arg(row_limit) OFFSET sqlc.arg(row_offset);

-- name: CountCompanies :one
SELECT count(*)
FROM companies
WHERE hidden_at IS NULL
  AND (sqlc.narg(sector)::text IS NULL OR sector = sqlc.narg(sector))
  AND (sqlc.narg(city)::text IS NULL OR city_key = normalize_text(sqlc.narg(city)))
  AND search_text LIKE ALL (
      SELECT '%' || normalize_text(word) || '%' FROM unnest(sqlc.arg(words)::text[]) AS word);

-- name: GetCompanyBySlug :one
SELECT slug, name, sector, company_type, description, website, email, phone, city, address,
       size, logo_url, logo_key, social_links, accepts_spontaneous, verified, rating, rating_count
FROM companies
WHERE slug = $1 AND hidden_at IS NULL;

-- name: GetCompanyLogoKey :one
SELECT logo_key FROM companies WHERE slug = $1 AND hidden_at IS NULL;

-- name: ListCompanySlugs :many
SELECT slug FROM companies WHERE hidden_at IS NULL ORDER BY slug;

-- name: ListSectorCounts :many
SELECT s.slug, s.label, count(c.id) AS company_count
FROM sectors s
LEFT JOIN companies c ON c.sector = s.slug AND c.hidden_at IS NULL
GROUP BY s.slug
ORDER BY company_count DESC, s.label;

-- Spelling variants ("Mbodiene" / "Mbodiène") are merged under their most frequent spelling;
-- ties go to the first spelling in French order, like the web front.
-- name: ListCityCounts :many
SELECT city, company_count
FROM (
    SELECT DISTINCT ON (city_key)
           city,
           (sum(count(*)) OVER (PARTITION BY city_key))::bigint AS company_count
    FROM companies
    WHERE hidden_at IS NULL
    GROUP BY city_key, city
    ORDER BY city_key, count(*) DESC, city
) AS merged
ORDER BY company_count DESC, city;

-- Verified (claimed) and curated (edited in the back-office) companies are never overwritten by a re-import.
-- name: UpsertScrapedCompany :exec
INSERT INTO companies (
    slug, name, sector, company_type, description, website, email, phone, city, address,
    size, logo_url, social_links, accepts_spontaneous, verified, source, place_id, rating, rating_count, notes
) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20
)
ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    sector = EXCLUDED.sector,
    company_type = EXCLUDED.company_type,
    description = EXCLUDED.description,
    website = EXCLUDED.website,
    email = EXCLUDED.email,
    phone = EXCLUDED.phone,
    city = EXCLUDED.city,
    address = EXCLUDED.address,
    size = EXCLUDED.size,
    logo_url = EXCLUDED.logo_url,
    social_links = EXCLUDED.social_links,
    accepts_spontaneous = EXCLUDED.accepts_spontaneous,
    source = EXCLUDED.source,
    place_id = EXCLUDED.place_id,
    rating = EXCLUDED.rating,
    rating_count = EXCLUDED.rating_count,
    notes = EXCLUDED.notes
WHERE NOT companies.verified AND companies.curated_at IS NULL;
