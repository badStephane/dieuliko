-- +goose Up
CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE users (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    -- citext: "Awa@Mail.sn" and "awa@mail.sn" are the same account.
    email             citext NOT NULL UNIQUE CHECK (length(email) BETWEEN 3 AND 254),
    -- argon2id PHC string ($argon2id$v=19$m=...,t=...,p=...$salt$hash).
    password_hash     text NOT NULL CHECK (password_hash LIKE '$argon2id$%'),
    role              text NOT NULL CHECK (role IN ('candidate', 'admin')),
    first_name        text NOT NULL CHECK (first_name <> ''),
    last_name         text NOT NULL CHECK (last_name <> ''),
    email_verified_at timestamptz,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now()
);

-- Opaque session tokens: only their SHA-256 is stored, so a database leak does not leak live sessions.
CREATE TABLE sessions (
    token_hash bytea PRIMARY KEY CHECK (length(token_hash) = 32),
    user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL,
    CHECK (expires_at > created_at)
);

CREATE INDEX sessions_user_id_idx ON sessions (user_id);
CREATE INDEX sessions_expires_at_idx ON sessions (expires_at);

-- Single-use tokens sent by email (address verification, password reset); hashed like sessions.
CREATE TABLE email_tokens (
    token_hash bytea PRIMARY KEY CHECK (length(token_hash) = 32),
    user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    purpose    text NOT NULL CHECK (purpose IN ('verify_email', 'reset_password')),
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL,
    used_at    timestamptz,
    CHECK (expires_at > created_at)
);

-- At most one pending link per purpose: issuing a new one retires the previous one.
CREATE UNIQUE INDEX email_tokens_one_pending_idx ON email_tokens (user_id, purpose) WHERE used_at IS NULL;
CREATE INDEX email_tokens_expires_at_idx ON email_tokens (expires_at);

-- +goose StatementBegin
CREATE FUNCTION touch_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;
-- +goose StatementEnd

CREATE TRIGGER users_touch_updated_at
BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- +goose Down
DROP TABLE email_tokens;
DROP TABLE sessions;
DROP TABLE users;
DROP FUNCTION touch_updated_at();
