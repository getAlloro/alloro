import { Knex } from "knex";

/**
 * `taste_profiles` — one composed, source-linked Client Taste Profile per
 * business (Slice 2, the true-voice spine of the funnel). Each row is the
 * ONE record the website reads for its content slots. The composition wires
 * together extractors Alloro already has (reviewThemeExtractor,
 * identity-distillation, extractPracticeFacts) — it is NOT a new engine.
 *
 * Honesty (Value #6): every CLAIM inside `profile` carries a `source`
 * reference (a review id / GBP field / page URL / intake ref). Claims with no
 * real source are dropped before write; rank/visibility/guarantee language and
 * invented metrics are rejected. The composition service owns that gate; this
 * table just persists the gated result plus an audit summary.
 *
 * Notes:
 *  - Lives in `public` (no dedicated schema), same precedent as
 *    `practice_facts` and `email_logs`. `gen_random_uuid()` is built in on
 *    PG13+ (dev/prod are PG17).
 *  - `status` is an app-level enum stored as text (draft | approved) — a new
 *    status never needs a migration. Owner approval (Tier 3) is a deferred
 *    frontend surface; the columns are here so it can land without a schema
 *    change.
 *  - Additive, no locks on existing tables, idempotent up() (hasTable guard),
 *    reversible down().
 */

export async function up(knex: Knex): Promise<void> {
  const exists = await knex.schema.hasTable("taste_profiles");
  if (exists) return;

  await knex.schema.createTable("taste_profiles", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.integer("organization_id").notNullable();
    t.integer("location_id").nullable(); // null = organization-level profile
    t.text("status").notNullable().defaultTo("draft"); // draft | approved
    t.text("business_name");
    t.text("business_category");
    // The composed, source-linked TasteProfile payload (every claim = {value, source}).
    t.jsonb("profile").notNullable().defaultTo("{}");
    // Audit: what the honesty gate kept / dropped (no source) / rejected (banned language).
    t.jsonb("source_summary").notNullable().defaultTo("{}");
    t.text("approved_by"); // owner identity at approval (Tier 3, deferred FE)
    t.timestamp("approved_at", { useTz: true });
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());

    t.index(["organization_id"], "taste_profiles_org_idx");
    t.index(["organization_id", "location_id"], "taste_profiles_org_location_idx");
    t.index(["status"], "taste_profiles_status_idx");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("taste_profiles");
}
