-- +goose Up
-- A candidate's spontaneous application to one company of the directory, kept in the Dieuliko inbox (no email is
-- sent). While sent, it holds a frozen snapshot of what the company will read: identity, profile, letter and a copy of
-- the CV (so later edits or a replaced CV do not change it). Withdrawing erases the snapshot and the CV copy: only the
-- company and the dates stay, for the candidate's history. Limits mirror internal/application.
CREATE TABLE applications (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    -- RESTRICT: removing a company must not silently drop applications (and orphan their CV copies).
    company_id    uuid NOT NULL REFERENCES companies (id) ON DELETE RESTRICT,
    status        text NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'withdrawn')),
    first_name    text CHECK (first_name <> ''),
    last_name     text CHECK (last_name <> ''),
    email         text CHECK (length(email) BETWEEN 3 AND 254),
    -- A guard against absurd sizes, not a business limit (internal/candidate validates the profile): the largest
    -- profile a candidate can save is about 69,000 characters, up to ~415 KB once JSON-escaped.
    profile       jsonb CHECK (octet_length(profile::text) <= 524288),
    letter        text CHECK (char_length(letter) BETWEEN 1 AND 5000),
    cv_object_key text UNIQUE CHECK (cv_object_key <> ''),
    cv_file_name  text CHECK (cv_file_name <> '' AND char_length(cv_file_name) <= 120),
    cv_size_bytes integer CHECK (cv_size_bytes > 0 AND cv_size_bytes <= 5242880),
    created_at    timestamptz NOT NULL DEFAULT now(),
    withdrawn_at  timestamptz,
    CONSTRAINT applications_snapshot_follows_status CHECK (
        (status = 'sent' AND withdrawn_at IS NULL
            AND num_nulls(first_name, last_name, email, profile, letter, cv_object_key, cv_file_name, cv_size_bytes) = 0)
        OR (status = 'withdrawn' AND withdrawn_at IS NOT NULL
            AND num_nonnulls(first_name, last_name, email, profile, letter, cv_object_key, cv_file_name, cv_size_bytes) = 0)
    )
);

-- One live application per candidate and company; withdrawing frees the slot.
CREATE UNIQUE INDEX applications_one_sent_per_company ON applications (user_id, company_id) WHERE status = 'sent';
-- The candidate's history, and the daily cap count.
CREATE INDEX applications_by_user ON applications (user_id, created_at DESC);
-- The company's inbox (future dashboard).
CREATE INDEX applications_sent_by_company ON applications (company_id, created_at DESC) WHERE status = 'sent';

-- +goose Down
DROP TABLE applications;
