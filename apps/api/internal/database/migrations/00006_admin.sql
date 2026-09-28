-- +goose Up
-- Back-office moderation. A hidden company leaves the public directory (search, counts, pages) and takes no new
-- letter or application, while those already written stay readable. A curated company was created or edited by an
-- admin: a re-import of scraped data no longer overwrites it.
ALTER TABLE companies
    ADD COLUMN hidden_at  timestamptz,
    ADD COLUMN curated_at timestamptz;

-- A suspended account cannot sign in; its sessions are revoked when it is suspended.
ALTER TABLE users ADD COLUMN suspended_at timestamptz;

-- Who changed what in the back-office. Only field names are kept, never personal data, so deleting an account
-- leaves nothing about the person here (target_id is an opaque id or a company slug).
CREATE TABLE admin_audit (
    id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    admin_id       uuid REFERENCES users (id) ON DELETE SET NULL,
    action         text NOT NULL CHECK (action IN (
        'company.create', 'company.update', 'company.hide', 'company.unhide', 'company.verify', 'company.unverify',
        'user.suspend', 'user.unsuspend', 'user.delete'
    )),
    target_type    text NOT NULL CHECK (target_type IN ('company', 'user')),
    target_id      text NOT NULL CHECK (target_id <> ''),
    changed_fields text[] NOT NULL DEFAULT '{}',
    created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX admin_audit_created_at_idx ON admin_audit (created_at DESC);

-- +goose Down
DROP TABLE admin_audit;
ALTER TABLE users DROP COLUMN suspended_at;
ALTER TABLE companies DROP COLUMN curated_at, DROP COLUMN hidden_at;
