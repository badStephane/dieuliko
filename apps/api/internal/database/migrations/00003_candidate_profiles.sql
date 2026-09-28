-- +goose Up
-- +goose StatementBegin
-- True when every item is non-empty and at most max_length characters long.
CREATE FUNCTION items_have_length(items text[], max_length integer) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
    SELECT coalesce(bool_and(char_length(item) BETWEEN 1 AND max_length), true) FROM unnest(items) AS item
$$;
-- +goose StatementEnd

-- Structured candidate profile, replaced as a whole by the candidate (lists are ordered by position).
-- Limits mirror internal/candidate/validate.go, which reports them field by field.
CREATE TABLE candidate_profiles (
    user_id    uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
    headline   text NOT NULL DEFAULT '' CHECK (char_length(headline) <= 100),
    summary    text NOT NULL DEFAULT '' CHECK (char_length(summary) <= 2000),
    -- E.164 ("+221771234567") or empty.
    phone      text NOT NULL DEFAULT '' CHECK (phone = '' OR phone ~ '^\+[1-9][0-9]{7,14}$'),
    city       text NOT NULL DEFAULT '' CHECK (char_length(city) <= 60),
    skills     text[] NOT NULL DEFAULT '{}' CHECK (cardinality(skills) <= 30 AND items_have_length(skills, 50)),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER candidate_profiles_touch_updated_at
BEFORE UPDATE ON candidate_profiles
FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TABLE candidate_desired_sectors (
    user_id  uuid NOT NULL REFERENCES candidate_profiles (user_id) ON DELETE CASCADE,
    position smallint NOT NULL CHECK (position >= 0),
    sector   text NOT NULL REFERENCES sectors (slug),
    PRIMARY KEY (user_id, position),
    UNIQUE (user_id, sector)
);

CREATE TABLE candidate_languages (
    user_id  uuid NOT NULL REFERENCES candidate_profiles (user_id) ON DELETE CASCADE,
    position smallint NOT NULL CHECK (position >= 0),
    language text NOT NULL CHECK (language <> '' AND char_length(language) <= 40),
    level    text NOT NULL CHECK (level IN ('notions', 'intermediaire', 'courant', 'natif')),
    PRIMARY KEY (user_id, position)
);

-- Months are stored as the first day of the month; a NULL end month means "ongoing".
CREATE TABLE candidate_experiences (
    user_id      uuid NOT NULL REFERENCES candidate_profiles (user_id) ON DELETE CASCADE,
    position     smallint NOT NULL CHECK (position >= 0),
    title        text NOT NULL CHECK (title <> '' AND char_length(title) <= 100),
    organization text NOT NULL CHECK (organization <> '' AND char_length(organization) <= 100),
    city         text NOT NULL DEFAULT '' CHECK (char_length(city) <= 60),
    start_month  date NOT NULL CHECK (extract(day FROM start_month) = 1),
    end_month    date CHECK (extract(day FROM end_month) = 1 AND end_month >= start_month),
    description  text NOT NULL DEFAULT '' CHECK (char_length(description) <= 2000),
    PRIMARY KEY (user_id, position)
);

CREATE TABLE candidate_educations (
    user_id     uuid NOT NULL REFERENCES candidate_profiles (user_id) ON DELETE CASCADE,
    position    smallint NOT NULL CHECK (position >= 0),
    degree      text NOT NULL CHECK (degree <> '' AND char_length(degree) <= 100),
    school      text NOT NULL CHECK (school <> '' AND char_length(school) <= 100),
    field       text NOT NULL DEFAULT '' CHECK (char_length(field) <= 100),
    start_month date NOT NULL CHECK (extract(day FROM start_month) = 1),
    end_month   date CHECK (extract(day FROM end_month) = 1 AND end_month >= start_month),
    description text NOT NULL DEFAULT '' CHECK (char_length(description) <= 2000),
    PRIMARY KEY (user_id, position)
);

-- The candidate's current CV (one per candidate); the file lives in object storage under object_key.
CREATE TABLE candidate_cvs (
    user_id     uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
    object_key  text NOT NULL UNIQUE CHECK (object_key <> ''),
    file_name   text NOT NULL CHECK (file_name <> '' AND char_length(file_name) <= 120),
    size_bytes  integer NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 5242880),
    uploaded_at timestamptz NOT NULL DEFAULT now()
);

-- +goose Down
DROP TABLE candidate_cvs;
DROP TABLE candidate_educations;
DROP TABLE candidate_experiences;
DROP TABLE candidate_languages;
DROP TABLE candidate_desired_sectors;
DROP TABLE candidate_profiles;
DROP FUNCTION items_have_length(text[], integer);
