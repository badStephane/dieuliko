-- +goose Up
-- Company accounts: a person signs up as a company, then asks to manage a listing of the directory. An admin reviews
-- every request by hand; an approved claim is what makes the account a member of the company (one account manages one
-- listing, and a listing has one manager, in v1).
ALTER TABLE users
    DROP CONSTRAINT users_role_check,
    ADD CONSTRAINT users_role_check CHECK (role IN ('candidate', 'admin', 'company'));

CREATE TABLE company_claims (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    company_id      uuid NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
    status          text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled', 'revoked')),
    -- What the requester says about themselves, for the admin to judge the request.
    job_title       text NOT NULL CHECK (length(job_title) BETWEEN 1 AND 100),
    phone           text NOT NULL DEFAULT '' CHECK (phone = '' OR phone ~ '^\+[1-9][0-9]{7,14}$'),
    message         text NOT NULL DEFAULT '' CHECK (length(message) <= 1000),
    -- Why a request was rejected or a membership revoked; shown to the requester.
    decision_reason text CHECK (length(decision_reason) <= 500),
    reviewed_by     uuid REFERENCES users (id) ON DELETE SET NULL,
    reviewed_at     timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT company_claims_reviewed CHECK (status IN ('pending', 'cancelled') OR reviewed_at IS NOT NULL)
);

-- One open request (pending or approved) per account, and one manager per listing.
CREATE UNIQUE INDEX company_claims_one_open_per_user ON company_claims (user_id) WHERE status IN ('pending', 'approved');
CREATE UNIQUE INDEX company_claims_one_manager_per_company ON company_claims (company_id) WHERE status = 'approved';
-- The back-office queue, oldest request first.
CREATE INDEX company_claims_pending ON company_claims (created_at) WHERE status = 'pending';
CREATE INDEX company_claims_by_company ON company_claims (company_id, created_at DESC);

CREATE TRIGGER company_claims_touch_updated_at
BEFORE UPDATE ON company_claims
FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- Reviews of claims are audited like the other back-office decisions.
ALTER TABLE admin_audit
    DROP CONSTRAINT admin_audit_action_check,
    ADD CONSTRAINT admin_audit_action_check CHECK (action IN (
        'company.create', 'company.update', 'company.hide', 'company.unhide', 'company.verify', 'company.unverify',
        'company.logo_set', 'company.logo_remove', 'company.delete',
        'user.suspend', 'user.unsuspend', 'user.delete',
        'claim.approve', 'claim.reject', 'claim.revoke'
    )),
    DROP CONSTRAINT admin_audit_target_type_check,
    ADD CONSTRAINT admin_audit_target_type_check CHECK (target_type IN ('company', 'user', 'claim'));

-- +goose Down
DELETE FROM admin_audit WHERE target_type = 'claim' OR action LIKE 'claim.%';
ALTER TABLE admin_audit
    DROP CONSTRAINT admin_audit_target_type_check,
    ADD CONSTRAINT admin_audit_target_type_check CHECK (target_type IN ('company', 'user')),
    DROP CONSTRAINT admin_audit_action_check,
    ADD CONSTRAINT admin_audit_action_check CHECK (action IN (
        'company.create', 'company.update', 'company.hide', 'company.unhide', 'company.verify', 'company.unverify',
        'company.logo_set', 'company.logo_remove', 'company.delete',
        'user.suspend', 'user.unsuspend', 'user.delete'
    ));
DROP TABLE company_claims;
DELETE FROM users WHERE role = 'company';
ALTER TABLE users
    DROP CONSTRAINT users_role_check,
    ADD CONSTRAINT users_role_check CHECK (role IN ('candidate', 'admin'));
