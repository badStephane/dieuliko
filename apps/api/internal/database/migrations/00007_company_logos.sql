-- +goose Up
-- A logo uploaded in the back-office lives in object storage under logo_key (a new key per upload, so its URL can be
-- cached forever). It takes precedence over logo_url, an external image the import may bring.
ALTER TABLE companies
    ADD COLUMN logo_key text CHECK (logo_key ~ '^logos/[0-9a-f-]{36}\.(png|jpg|webp)$');

-- Logo changes and deletions are audited like the other listing changes.
ALTER TABLE admin_audit
    DROP CONSTRAINT admin_audit_action_check,
    ADD CONSTRAINT admin_audit_action_check CHECK (action IN (
        'company.create', 'company.update', 'company.hide', 'company.unhide', 'company.verify', 'company.unverify',
        'company.logo_set', 'company.logo_remove', 'company.delete',
        'user.suspend', 'user.unsuspend', 'user.delete'
    ));

-- +goose Down
DELETE FROM admin_audit WHERE action IN ('company.logo_set', 'company.logo_remove', 'company.delete');
ALTER TABLE admin_audit
    DROP CONSTRAINT admin_audit_action_check,
    ADD CONSTRAINT admin_audit_action_check CHECK (action IN (
        'company.create', 'company.update', 'company.hide', 'company.unhide', 'company.verify', 'company.unverify',
        'user.suspend', 'user.unsuspend', 'user.delete'
    ));
ALTER TABLE companies DROP COLUMN logo_key;
