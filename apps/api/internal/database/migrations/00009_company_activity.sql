-- +goose Up
-- What a company changed on its own listing, for the back-office to see. Like admin_audit, only field names are kept.
CREATE TABLE company_activity (
    id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    company_id     uuid NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
    -- NULL once the account is gone.
    user_id        uuid REFERENCES users (id) ON DELETE SET NULL,
    action         text NOT NULL CHECK (action IN ('listing.update', 'listing.logo_set', 'listing.logo_remove')),
    changed_fields text[] NOT NULL DEFAULT '{}',
    created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX company_activity_by_company ON company_activity (company_id, created_at DESC);

-- +goose Down
DROP TABLE company_activity;
