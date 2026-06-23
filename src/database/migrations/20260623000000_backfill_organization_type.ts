import { Knex } from "knex";

/**
 * Backfill organization_type and normalize the renamed value.
 *
 * DATA only — the organization_type column already exists (added by
 * 20260312000002_add_organization_type). No schema change here.
 *
 *   1. NULL    -> 'health'   (existing accounts are healthcare by default)
 *   2. 'saas'  -> 'generic'  (the 'saas' value is renamed to 'generic')
 *
 * Idempotent; safe to re-run. Affects the organizations table only — no
 * tenant/user data rewrite, no locks of concern (small table).
 *
 * down() is intentionally a no-op: NULL and 'health' are behaviorally
 * identical (the app resolves NULL -> 'health' via config/orgLabels.resolveOrgType),
 * so the original NULL/saas state is neither recoverable nor meaningful to restore.
 */
export async function up(knex: Knex): Promise<void> {
  await knex("organizations")
    .whereNull("organization_type")
    .update({ organization_type: "health" });

  await knex("organizations")
    .where({ organization_type: "saas" })
    .update({ organization_type: "generic" });
}

export async function down(): Promise<void> {
  // Intentional no-op — see migration header.
}
