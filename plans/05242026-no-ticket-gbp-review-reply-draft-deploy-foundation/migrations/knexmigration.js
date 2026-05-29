/**
 * Execution parity copy for:
 * src/database/migrations/20260524000000_create_gbp_automation_tables.ts
 *
 * Production safety:
 * - Additive tables, checks, and indexes only.
 * - No existing organization, location, Google, user, or review rows are rewritten.
 * - Down migration drops only the new GBP automation tables in reverse dependency order.
 */

const SETTINGS_TABLE = "gbp_automation_settings";
const WORK_ITEMS_TABLE = "gbp_work_items";
const ATTEMPTS_TABLE = "gbp_deployment_attempts";
const EVENTS_TABLE = "gbp_work_events";

exports.up = async function up(knex) {
  await knex.schema.createTable(SETTINGS_TABLE, (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.integer("organization_id").notNullable().references("id").inTable("organizations").onDelete("CASCADE");
    table.integer("location_id").references("id").inTable("locations").onDelete("CASCADE");
    table.boolean("review_reply_enabled").notNullable().defaultTo(false);
    table.text("review_reply_customizations");
    table.text("local_post_customizations");
    table.boolean("local_post_generation_enabled").notNullable().defaultTo(false);
    table.string("local_post_frequency", 50).notNullable().defaultTo("twice_monthly");
    table.timestamp("next_post_generation_at", { useTz: true });
    table.text("default_featured_image_url");
    table.jsonb("metadata").notNullable().defaultTo("{}");
    table.timestamps(true, true);
    table.index(["organization_id", "location_id"]);
  });

  await knex.raw(`CREATE UNIQUE INDEX gbp_automation_settings_org_default_unique ON ${SETTINGS_TABLE}(organization_id) WHERE location_id IS NULL`);
  await knex.raw(`CREATE UNIQUE INDEX gbp_automation_settings_org_location_unique ON ${SETTINGS_TABLE}(organization_id, location_id) WHERE location_id IS NOT NULL`);

  await knex.schema.createTable(WORK_ITEMS_TABLE, (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.integer("organization_id").notNullable().references("id").inTable("organizations").onDelete("CASCADE");
    table.integer("location_id").notNullable().references("id").inTable("locations").onDelete("CASCADE");
    table.integer("google_property_id").notNullable().references("id").inTable("google_properties").onDelete("RESTRICT");
    table.string("content_type", 50).notNullable();
    table.uuid("source_review_id").references("id").inTable("website_builder.reviews").onDelete("SET NULL");
    table.string("status", 50).notNullable().defaultTo("draft");
    table.text("draft_content").notNullable();
    table.text("approved_content");
    table.text("published_content");
    table.jsonb("local_post_payload");
    table.text("featured_image_url");
    table.text("google_resource_name");
    table.jsonb("google_response");
    table.string("generation_prompt_key", 120);
    table.jsonb("generation_input");
    table.text("generation_customizations");
    table.integer("created_by_user_id").references("id").inTable("users").onDelete("SET NULL");
    table.integer("approved_by_user_id").references("id").inTable("users").onDelete("SET NULL");
    table.integer("published_by_user_id").references("id").inTable("users").onDelete("SET NULL");
    table.integer("rejected_by_user_id").references("id").inTable("users").onDelete("SET NULL");
    table.timestamp("approved_at", { useTz: true });
    table.timestamp("published_at", { useTz: true });
    table.timestamp("rejected_at", { useTz: true });
    table.timestamp("last_deploy_failed_at", { useTz: true });
    table.timestamp("next_retry_at", { useTz: true });
    table.string("last_error_code", 120);
    table.text("last_error_message");
    table.integer("retry_count").notNullable().defaultTo(0);
    table.jsonb("metadata").notNullable().defaultTo("{}");
    table.timestamps(true, true);
    table.index(["organization_id", "location_id", "status"]);
    table.index(["source_review_id"]);
    table.index(["content_type", "status"]);
    table.index(["next_retry_at"]);
  });

  await knex.raw(`ALTER TABLE ${WORK_ITEMS_TABLE} ADD CONSTRAINT gbp_work_items_content_type_check CHECK (content_type IN ('review_reply', 'local_post'))`);
  await knex.raw(`ALTER TABLE ${WORK_ITEMS_TABLE} ADD CONSTRAINT gbp_work_items_status_check CHECK (status IN ('draft', 'awaiting_approval', 'approved', 'deploying', 'published', 'rejected'))`);
  await knex.raw(`CREATE UNIQUE INDEX gbp_work_items_active_review_reply_unique ON ${WORK_ITEMS_TABLE}(source_review_id) WHERE content_type = 'review_reply' AND source_review_id IS NOT NULL AND status IN ('draft', 'awaiting_approval', 'approved', 'deploying')`);

  await knex.schema.createTable(ATTEMPTS_TABLE, (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.uuid("work_item_id").notNullable().references("id").inTable(WORK_ITEMS_TABLE).onDelete("CASCADE");
    table.integer("attempt_number").notNullable();
    table.string("status", 50).notNullable().defaultTo("pending");
    table.integer("requested_by_user_id").references("id").inTable("users").onDelete("SET NULL");
    table.timestamp("started_at", { useTz: true });
    table.timestamp("completed_at", { useTz: true });
    table.jsonb("request_payload");
    table.jsonb("response_payload");
    table.string("error_code", 120);
    table.text("error_message");
    table.timestamps(true, true);
    table.unique(["work_item_id", "attempt_number"]);
    table.index(["work_item_id", "created_at"]);
    table.index(["status", "created_at"]);
  });

  await knex.raw(`ALTER TABLE ${ATTEMPTS_TABLE} ADD CONSTRAINT gbp_deployment_attempts_status_check CHECK (status IN ('pending', 'running', 'succeeded', 'failed'))`);

  await knex.schema.createTable(EVENTS_TABLE, (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.uuid("work_item_id").notNullable().references("id").inTable(WORK_ITEMS_TABLE).onDelete("CASCADE");
    table.integer("actor_user_id").references("id").inTable("users").onDelete("SET NULL");
    table.string("event_type", 120).notNullable();
    table.jsonb("metadata").notNullable().defaultTo("{}");
    table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.index(["work_item_id", "created_at"]);
    table.index(["event_type", "created_at"]);
  });
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists(EVENTS_TABLE);
  await knex.schema.dropTableIfExists(ATTEMPTS_TABLE);
  await knex.schema.dropTableIfExists(WORK_ITEMS_TABLE);
  await knex.schema.dropTableIfExists(SETTINGS_TABLE);
};
