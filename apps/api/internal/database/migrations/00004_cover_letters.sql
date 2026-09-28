-- +goose Up
-- A candidate's cover letter for one company of the directory: drafted by the assistant, then edited.
-- Limit mirrors internal/assistant/letters.go.
CREATE TABLE cover_letters (
    user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    company_id uuid NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
    content    text NOT NULL CHECK (char_length(content) BETWEEN 1 AND 5000),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, company_id)
);

CREATE TRIGGER cover_letters_touch_updated_at
BEFORE UPDATE ON cover_letters
FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- +goose Down
DROP TABLE cover_letters;
