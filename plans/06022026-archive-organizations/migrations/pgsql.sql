-- PostgreSQL scaffold for archive organizations.
-- Production safety:
-- - Nullable columns only.
-- - No destructive data rewrite.
-- - No existing organization is archived by this migration.
-- - Fill implementation during execution after verifying production knex_migrations baseline.

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS archived_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS archived_by_user_id integer NULL,
  ADD COLUMN IF NOT EXISTS archive_reason text NULL,
  ADD COLUMN IF NOT EXISTS archive_metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_organizations_archived_at
  ON organizations (archived_at);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'organizations_archived_by_user_id_foreign'
  ) THEN
    ALTER TABLE organizations
      ADD CONSTRAINT organizations_archived_by_user_id_foreign
      FOREIGN KEY (archived_by_user_id)
      REFERENCES users(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_organizations_archived_by_user_id
  ON organizations (archived_by_user_id);
