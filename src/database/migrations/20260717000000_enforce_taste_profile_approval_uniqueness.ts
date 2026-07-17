import type { Knex } from "knex";

const ORG_APPROVAL_INDEX =
  "taste_profiles_one_org_level_approved_unique";
const LOCATION_APPROVAL_INDEX =
  "taste_profiles_one_location_approved_unique";

/**
 * Enforces the current Taste Profile invariant at the database boundary:
 * at most one `approved` row per organization + location scope.
 *
 * PostgreSQL treats NULL values as distinct in a normal composite unique index,
 * so the organization-level (`location_id IS NULL`) case needs its own partial
 * unique index. This stays additive to preserve the original, still-unmerged
 * table-creation migration as immutable deployment history.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE UNIQUE INDEX IF NOT EXISTS ${ORG_APPROVAL_INDEX}
      ON taste_profiles (organization_id)
      WHERE status = 'approved' AND location_id IS NULL
  `);

  await knex.raw(`
    CREATE UNIQUE INDEX IF NOT EXISTS ${LOCATION_APPROVAL_INDEX}
      ON taste_profiles (organization_id, location_id)
      WHERE status = 'approved' AND location_id IS NOT NULL
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP INDEX IF EXISTS ${LOCATION_APPROVAL_INDEX}`);
  await knex.raw(`DROP INDEX IF EXISTS ${ORG_APPROVAL_INDEX}`);
}
