import type { Knex } from "knex";

/**
 * Page metadata proposals — the persistence "brick 3" of the CTR self-optimization
 * loop (diagnose → educated hypothesis → REVIEWED PROPOSAL → publish).
 *
 * service.ctr-hypothesis already PRODUCES a title/meta-description rewrite proposal
 * (before-vs-proposed + a cited rationale), but says so itself: "Brick 3 owns the
 * table; there is no persistence here." This table is that home. A row records one
 * proposed rewrite for one page so a reviewer can see current-vs-suggested with the
 * plain rationale and approve (which STAGES it) or reject it.
 *
 * SCOPE: this table only records and stages a decision. Publishing the approved
 * title/description to the live page's `seo_data` is a SEPARATE, already-gated step
 * (the existing SEO write path) and is intentionally NOT driven from here.
 *
 * Production risk: additive and reversible. New table only — no data rewrite, no
 * lock on a hot table, `down` drops it cleanly.
 */
export async function up(knex: Knex): Promise<void> {
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
      t.bigInteger("reviewed_by").references("id").inTable("users").onDelete("SET NULL");
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
