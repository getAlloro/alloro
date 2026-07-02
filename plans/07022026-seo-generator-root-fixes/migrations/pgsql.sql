-- previous_content: jsonb -> text
-- The column stores raw HTML from posts.content; every reader treats it as a
-- string. Created as jsonb by mistake (20260701000000), which makes the
-- snapshot write crash (Postgres 22P02) and has kept it all-NULL since launch
-- (verified 0 non-null / 553 rows in prod, 2026-07-02) — so the conversion is
-- zero-data-risk.

-- TODO: fill during execution (final reviewed form below)
ALTER TABLE website_builder.posts
  ALTER COLUMN previous_content TYPE text
  USING previous_content #>> '{}';

-- Rollback:
-- ALTER TABLE website_builder.posts
--   ALTER COLUMN previous_content TYPE jsonb
--   USING to_jsonb(previous_content);
