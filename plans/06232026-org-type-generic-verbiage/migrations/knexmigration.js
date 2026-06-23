/**
 * Plan scaffold — org-type backfill & value normalization.
 *
 * NOTE: This is the planning scaffold. The real migration is authored during
 * execution (T1) as a TypeScript Knex file in src/database/migrations/.
 * Alloro is PostgreSQL + Knex only (see AGENTS.md) — this JS form mirrors the
 * intent; see pgsql.sql for the raw equivalent. mssql.sql is N/A.
 *
 * What this migration does (DATA only — no schema change; the column already
 * exists from 20260312000002_add_organization_type):
 *   1. Backfill: every organization with organization_type IS NULL -> 'health'
 *      (makes "all existing accounts = health" explicit; behavior already
 *      defaults null -> health in code via resolveOrgType()).
 *   2. Normalize: any organization_type = 'saas' -> 'generic'
 *      (the 'saas' value is renamed to 'generic' platform-wide).
 *
 * Production-safety notes (AGENTS.md):
 *   - Idempotent: re-running is a no-op once values are set.
 *   - No locks of concern: single UPDATE on organizations (small table).
 *   - Reversible? down() is intentionally a NO-OP. We cannot restore which
 *     rows were originally NULL, and it does not matter — NULL and 'health'
 *     are behaviorally identical (resolveOrgType maps NULL -> 'health').
 *     Reverting would be meaningless and the column itself pre-existed.
 *   - Affected rows: organizations table only. No tenant/user data rewrite.
 */

exports.up = async function up(knex) {
  // TODO (execution T1): confirm row counts on dev before/after.
  await knex('organizations')
    .whereNull('organization_type')
    .update({ organization_type: 'health' });

  await knex('organizations')
    .where({ organization_type: 'saas' })
    .update({ organization_type: 'generic' });
};

exports.down = async function down() {
  // Intentional no-op: NULL and 'health' are behaviorally identical and the
  // original NULL/saas state is not recoverable nor meaningful to restore.
};
