import { Knex } from "knex";

const SETTINGS_TABLE = "gbp_automation_settings";
const INSIGHTS_TABLE = "gbp_review_insights";
const ESCALATIONS_TABLE = "gbp_review_escalations";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable(SETTINGS_TABLE, (table) => {
    table.jsonb("review_reply_voice_examples").notNullable().defaultTo("[]");
    table.jsonb("local_post_voice_examples").notNullable().defaultTo("[]");
    table.jsonb("reply_rules").notNullable().defaultTo("[]");
    table.jsonb("post_rules").notNullable().defaultTo("[]");
  });

  await knex.schema.createTable(INSIGHTS_TABLE, (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table
      .uuid("review_id")
      .notNullable()
      .references("id")
      .inTable("website_builder.reviews")
      .onDelete("CASCADE");
    table.string("sentiment", 50).notNullable();
    table.jsonb("themes").notNullable().defaultTo("[]");
    table.string("urgency", 50).notNullable().defaultTo("normal");
    table.boolean("post_candidate").notNullable().defaultTo(false);
    table.jsonb("metadata").notNullable().defaultTo("{}");
    table.timestamps(true, true);

    table.unique(["review_id"]);
    table.index(["sentiment"]);
    table.index(["urgency"]);
    table.index(["post_candidate"]);
  });

  await knex.raw(`
    ALTER TABLE ${INSIGHTS_TABLE}
    ADD CONSTRAINT gbp_review_insights_sentiment_check
    CHECK (sentiment IN ('positive', 'neutral', 'negative', 'mixed'))
  `);

  await knex.raw(`
    ALTER TABLE ${INSIGHTS_TABLE}
    ADD CONSTRAINT gbp_review_insights_urgency_check
    CHECK (urgency IN ('normal', 'watch', 'urgent'))
  `);

  await knex.schema.createTable(ESCALATIONS_TABLE, (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table
      .uuid("review_id")
      .notNullable()
      .references("id")
      .inTable("website_builder.reviews")
      .onDelete("CASCADE");
    table
      .integer("organization_id")
      .notNullable()
      .references("id")
      .inTable("organizations")
      .onDelete("CASCADE");
    table
      .integer("location_id")
      .notNullable()
      .references("id")
      .inTable("locations")
      .onDelete("CASCADE");
    table.string("status", 50).notNullable().defaultTo("open");
    table.string("reason", 120).notNullable();
    table.text("note");
    table
      .integer("created_by_user_id")
      .references("id")
      .inTable("users")
      .onDelete("SET NULL");
    table
      .integer("resolved_by_user_id")
      .references("id")
      .inTable("users")
      .onDelete("SET NULL");
    table.timestamp("resolved_at", { useTz: true });
    table.jsonb("metadata").notNullable().defaultTo("{}");
    table.timestamps(true, true);

    table.unique(["review_id"]);
    table.index(["organization_id", "location_id", "status"]);
  });

  await knex.raw(`
    ALTER TABLE ${ESCALATIONS_TABLE}
    ADD CONSTRAINT gbp_review_escalations_status_check
    CHECK (status IN ('open', 'resolved'))
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(ESCALATIONS_TABLE);
  await knex.schema.dropTableIfExists(INSIGHTS_TABLE);

  await knex.schema.alterTable(SETTINGS_TABLE, (table) => {
    table.dropColumn("post_rules");
    table.dropColumn("reply_rules");
    table.dropColumn("local_post_voice_examples");
    table.dropColumn("review_reply_voice_examples");
  });
}
