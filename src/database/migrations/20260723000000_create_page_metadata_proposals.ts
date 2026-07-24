import type { Knex } from "knex";

/**
 * Page metadata proposals — the persistence "brick 3" of the CTR self-optimization
 * loop (diagnose → educated hypothesis → REVIEWED PROPOSAL → publish).
 *
 * service.ctr-hypothesis already PRODUCES a title/meta-description rewrite proposal
 * (before-vs-proposed + a cited rationale), but says so itself: "Brick 3 owns the
 * table; there is no persistence here." This table is that home. A row records one
 * proposed rewrite for one page so a reviewer can see current-vs-suggested with the
 * plain rationale and approve or reject it. Approving RECORDS AN APPROVAL;
 * publishing to the live page is a separate step.
 *
 * SCOPE: this table only records and stages a decision. Publishing the approved
 * title/description to the live page's `seo_data` is a SEPARATE, already-gated step
 * (the existing SEO write path) and is intentionally NOT driven from here.
 *
 * PRODUCTION SAFETY
 *  - Additive only. Creates ONE new table in the `website_builder` schema. No
 *    existing table is altered, no row is read, rewritten, or backfilled, so
 *    there is no data-loss risk and no long-running lock on a hot table.
 *  - The FKs to `website_builder.projects`, `website_builder.pages`, and `users`
 *    make Postgres take a brief lock on each referenced table to validate the
 *    constraint. The referencing table is empty, so there is nothing to check and
 *    the lock is held for microseconds.
 *  - `up()` is idempotent (hasTable guard) — re-running is a no-op.
 *  - `down()` is a real, complete reversal: it drops the table and, with it,
 *    every index and constraint this migration created.
 *  - Rows affected by a rollback: every row of
 *    `website_builder.page_metadata_proposals`, and NO other table. Those rows
 *    are staged review decisions; nothing else reads them and no live page
 *    content is derived from them, so a rollback changes no published website.
 *    Re-running `up()` recreates an empty table.
 */
export async function up(knex: Knex): Promise<void> {
  const exists = await knex.schema
    .withSchema("website_builder")
    .hasTable("page_metadata_proposals");
  if (exists) return;

  await knex.schema
    .withSchema("website_builder")
    .createTable("page_metadata_proposals", (t) => {
      t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
      t.uuid("project_id")
        .notNullable()
        .references("id")
        .inTable("website_builder.projects")
        .onDelete("CASCADE");
      t.uuid("page_id")
        .notNullable()
        .references("id")
        .inTable("website_builder.pages")
        .onDelete("CASCADE");
      t.text("page_path").notNullable();
      // Current metadata captured at propose time, so the review shows the exact
      // before-state even if the page changes afterward. Both nullable — a page may
      // carry no title/description yet.
      t.text("before_title");
      t.text("before_description");
      // The proposed rewrite.
      t.text("proposed_title").notNullable();
      t.text("proposed_description").notNullable();
      // The reviewer's evidence: the CTR-hypothesis rationale, prediction, and the
      // diagnosed opportunity — stored verbatim so the "why" survives with the row.
      t.jsonb("rationale").notNullable().defaultTo("{}");
      t.text("status").notNullable().defaultTo("pending");
      // `integer`, matching users.id and every other FK to users in this repo.
      // NOT bigInteger: Postgres would allow the cross-width FK, but node-postgres
      // returns int8 as a JavaScript STRING to avoid precision loss, so
      // `reviewed_by` would come back as "7" while the model's type says number.
      // TypeScript cannot catch that — the value crosses the driver boundary
      // untyped — and `proposal.reviewed_by === currentUser.id` would be false
      // for the very user who approved it.
      t.integer("reviewed_by").references("id").inTable("users").onDelete("SET NULL");
      t.timestamp("reviewed_at", { useTz: true });
      t.timestamps(true, true);
    });

  await knex.schema
    .withSchema("website_builder")
    .alterTable("page_metadata_proposals", (t) => {
      t.index("project_id", "idx_page_meta_proposal_project");
      t.index(["project_id", "status"], "idx_page_meta_proposal_project_status");
      t.index(["page_id", "status"], "idx_page_meta_proposal_page_status");
    });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema
    .withSchema("website_builder")
    .dropTableIfExists("page_metadata_proposals");
}
