-- PostgreSQL reference equivalent of the Knex migration (this is the live DB engine).
-- Additive nullable columns + partial-unique index. Production-safe, reversible.

-- UP
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_sub text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url text;

CREATE UNIQUE INDEX IF NOT EXISTS users_google_sub_unique
  ON users (google_sub)
  WHERE google_sub IS NOT NULL;

-- DOWN
-- DROP INDEX IF EXISTS users_google_sub_unique;
-- ALTER TABLE users DROP COLUMN IF EXISTS google_sub;
-- ALTER TABLE users DROP COLUMN IF EXISTS avatar_url;
