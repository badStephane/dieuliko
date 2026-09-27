-- +goose Up
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- unaccent() is only STABLE; pinning the dictionary makes it safe to use in generated columns and indexes.
-- +goose StatementBegin
CREATE FUNCTION immutable_unaccent(value text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
RETURN public.unaccent('public.unaccent'::regdictionary, value);
-- +goose StatementEnd

-- Lowercase, accent-free, single-spaced text for tolerant matching ("Thiès" = "thies", "Cœur" = "coeur").
-- +goose StatementBegin
CREATE FUNCTION normalize_text(value text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
RETURN btrim(regexp_replace(lower(immutable_unaccent(value)), '\s+', ' ', 'g'));
-- +goose StatementEnd

-- Human-readable text sorts like the web front (French ICU rules: "Campement" < "CMA" < "École").
CREATE TABLE sectors (
    slug  text PRIMARY KEY CHECK (slug ~ '^[a-z0-9-]+$'),
    label text COLLATE "fr-x-icu" NOT NULL CHECK (label <> '')
);

INSERT INTO sectors (slug, label) VALUES
    ('agro-agroalimentaire', 'Agriculture & agroalimentaire'),
    ('banque-assurance', 'Banque & assurance'),
    ('btp-ingenierie', 'BTP & ingénierie'),
    ('commerce-vente', 'Commerce & vente'),
    ('education-formation', 'Éducation & formation'),
    ('finance-comptabilite', 'Finance & comptabilité'),
    ('hotellerie-tourisme', 'Hôtellerie & tourisme'),
    ('industrie', 'Industrie'),
    ('informatique', 'Informatique & digital'),
    ('juridique', 'Juridique'),
    ('logistique-transport', 'Logistique & transport'),
    ('marketing-communication', 'Marketing & communication'),
    ('medias-audiovisuel', 'Médias & audiovisuel'),
    ('ong-developpement', 'ONG & développement'),
    ('rh', 'Ressources humaines'),
    ('sante', 'Santé'),
    ('telecoms-energie', 'Télécoms & énergie');

CREATE TABLE companies (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    slug                text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9-]+$'),
    name                text COLLATE "fr-x-icu" NOT NULL CHECK (name <> ''),
    sector              text NOT NULL REFERENCES sectors (slug),
    company_type        text,
    description         text,
    website             text,
    email               text,
    phone               text,
    city                text COLLATE "fr-x-icu" NOT NULL CHECK (city <> ''),
    city_key            text NOT NULL GENERATED ALWAYS AS (normalize_text(city)) STORED,
    address             text,
    size                text CHECK (size IN ('startup', 'pme', 'grande_entreprise')),
    logo_url            text,
    social_links        jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(social_links) = 'object'),
    -- NULL = the company has not said yet (unclaimed listing).
    accepts_spontaneous boolean,
    verified            boolean NOT NULL DEFAULT false,
    source              text NOT NULL,
    place_id            text UNIQUE,
    rating              numeric(2, 1) CHECK (rating BETWEEN 0 AND 5),
    rating_count        integer NOT NULL DEFAULT 0 CHECK (rating_count >= 0),
    notes               text,
    -- Maintained by the companies_before_write trigger (needs the sector label).
    search_text         text NOT NULL DEFAULT '',
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX companies_sector_idx ON companies (sector);
CREATE INDEX companies_city_key_idx ON companies (city_key);
CREATE INDEX companies_notoriety_idx ON companies (rating_count DESC, name);
CREATE INDEX companies_search_text_trgm_idx ON companies USING gin (search_text gin_trgm_ops);

-- +goose StatementBegin
CREATE FUNCTION companies_before_write() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    NEW.search_text := normalize_text(concat_ws(' ',
        NEW.name, NEW.company_type, NEW.city, NEW.address,
        (SELECT label FROM sectors WHERE slug = NEW.sector)));
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;
-- +goose StatementEnd

CREATE TRIGGER companies_before_write
BEFORE INSERT OR UPDATE ON companies
FOR EACH ROW EXECUTE FUNCTION companies_before_write();

-- +goose Down
DROP TABLE companies;
DROP FUNCTION companies_before_write();
DROP TABLE sectors;
DROP FUNCTION normalize_text(text);
DROP FUNCTION immutable_unaccent(text);
