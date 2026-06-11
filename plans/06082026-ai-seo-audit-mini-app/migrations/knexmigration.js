// AI SEO Audit Mini App - Knex migration parity copy.
// The repository migration is implemented at:
// src/database/migrations/20260608000000_create_ai_seo_audit_tables.ts

const SCHEMA = "website_builder";
const RUNS_TABLE = "ai_seo_audit_runs";
const TARGETS_TABLE = "ai_seo_audit_targets";
const RESULTS_TABLE = "ai_seo_audit_results";
const EXTERNAL_SOURCES_TABLE = "ai_seo_audit_external_sources";
const EVIDENCE_TABLE = "ai_seo_audit_evidence";

function tableName(table) {
  return `${SCHEMA}.${table}`;
}

exports.up = async function up(knex) {
  await knex.schema.withSchema(SCHEMA).createTable(RUNS_TABLE, (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.text("scope").notNullable();
    table.text("status").notNullable().defaultTo("queued");
    table.integer("organization_id").references("id").inTable("organizations").onDelete("SET NULL");
    table.uuid("project_id").references("id").inTable(tableName("projects")).onDelete("SET NULL");
    table.text("requested_url");
    table.text("normalized_url");
    table.decimal("score", 5, 2);
    table.decimal("data_coverage", 5, 2);
    table.text("confidence");
    table.text("rule_version").notNullable();
    table.jsonb("hard_caps").notNullable().defaultTo("[]");
    table.jsonb("summary").notNullable().defaultTo("{}");
    table.text("error_code");
    table.text("error_message");
    table.integer("created_by_user_id").references("id").inTable("users").onDelete("SET NULL");
    table.timestamp("started_at", { useTz: true });
    table.timestamp("completed_at", { useTz: true });
    table.timestamps(true, true);
    table.index(["organization_id", "created_at"], "idx_ai_seo_runs_org_created");
    table.index(["project_id", "created_at"], "idx_ai_seo_runs_project_created");
    table.index(["scope", "status"], "idx_ai_seo_runs_scope_status");
    table.index(["created_at"], "idx_ai_seo_runs_created");
  });

  await knex.schema.withSchema(SCHEMA).createTable(TARGETS_TABLE, (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.uuid("run_id").notNullable().references("id").inTable(tableName(RUNS_TABLE)).onDelete("CASCADE");
    table.text("target_type").notNullable();
    table.uuid("page_id").references("id").inTable(tableName("pages")).onDelete("SET NULL");
    table.integer("location_id").references("id").inTable("locations").onDelete("SET NULL");
    table.text("url").notNullable();
    table.text("label");
    table.decimal("score", 5, 2);
    table.decimal("data_coverage", 5, 2);
    table.text("confidence");
    table.decimal("mapping_confidence", 5, 2);
    table.jsonb("metadata").notNullable().defaultTo("{}");
    table.timestamps(true, true);
    table.index(["run_id"], "idx_ai_seo_targets_run");
    table.index(["location_id"], "idx_ai_seo_targets_location");
    table.index(["page_id"], "idx_ai_seo_targets_page");
    table.index(["url"], "idx_ai_seo_targets_url");
  });

  await knex.schema.withSchema(SCHEMA).createTable(RESULTS_TABLE, (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.uuid("run_id").notNullable().references("id").inTable(tableName(RUNS_TABLE)).onDelete("CASCADE");
    table.uuid("target_id").references("id").inTable(tableName(TARGETS_TABLE)).onDelete("CASCADE");
    table.text("category").notNullable();
    table.text("check_id").notNullable();
    table.text("status").notNullable();
    table.decimal("weight", 6, 3).notNullable();
    table.decimal("points_awarded", 6, 3).notNullable();
    table.text("method").notNullable();
    table.text("data_scope").notNullable();
    table.text("remediation");
    table.jsonb("details").notNullable().defaultTo("{}");
    table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.index(["run_id"], "idx_ai_seo_results_run");
    table.index(["target_id"], "idx_ai_seo_results_target");
    table.index(["category", "status"], "idx_ai_seo_results_category_status");
    table.index(["check_id"], "idx_ai_seo_results_check");
  });

  await knex.schema.withSchema(SCHEMA).createTable(EXTERNAL_SOURCES_TABLE, (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.uuid("run_id").notNullable().references("id").inTable(tableName(RUNS_TABLE)).onDelete("CASCADE");
    table.uuid("target_id").references("id").inTable(tableName(TARGETS_TABLE)).onDelete("CASCADE");
    table.text("query").notNullable();
    table.text("url").notNullable();
    table.text("title");
    table.text("source_host").notNullable();
    table.text("source_type");
    table.decimal("reliability_score", 5, 2);
    table.text("entity_match_state").notNullable();
    table.jsonb("extracted_fields").notNullable().defaultTo("{}");
    table.jsonb("compared_fields").notNullable().defaultTo("{}");
    table.jsonb("metadata").notNullable().defaultTo("{}");
    table.timestamp("fetched_at", { useTz: true });
    table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.index(["run_id"], "idx_ai_seo_sources_run");
    table.index(["target_id"], "idx_ai_seo_sources_target");
    table.index(["source_host"], "idx_ai_seo_sources_host");
    table.index(["entity_match_state"], "idx_ai_seo_sources_state");
  });

  await knex.schema.withSchema(SCHEMA).createTable(EVIDENCE_TABLE, (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.uuid("result_id").notNullable().references("id").inTable(tableName(RESULTS_TABLE)).onDelete("CASCADE");
    table.text("evidence_type").notNullable();
    table.text("source").notNullable();
    table.text("excerpt");
    table.jsonb("value").notNullable().defaultTo("{}");
    table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.index(["result_id"], "idx_ai_seo_evidence_result");
    table.index(["evidence_type"], "idx_ai_seo_evidence_type");
  });

  await knex.raw(`ALTER TABLE ${tableName(RUNS_TABLE)} ADD CONSTRAINT ai_seo_runs_scope_check CHECK (scope IN ('url_only', 'organization', 'sitewide', 'location'))`);
  await knex.raw(`ALTER TABLE ${tableName(RUNS_TABLE)} ADD CONSTRAINT ai_seo_runs_status_check CHECK (status IN ('queued', 'running', 'completed', 'failed'))`);
  await knex.raw(`ALTER TABLE ${tableName(RUNS_TABLE)} ADD CONSTRAINT ai_seo_runs_confidence_check CHECK (confidence IS NULL OR confidence IN ('low', 'medium', 'high'))`);
  await knex.raw(`ALTER TABLE ${tableName(TARGETS_TABLE)} ADD CONSTRAINT ai_seo_targets_type_check CHECK (target_type IN ('page', 'location', 'site'))`);
  await knex.raw(`ALTER TABLE ${tableName(TARGETS_TABLE)} ADD CONSTRAINT ai_seo_targets_confidence_check CHECK (confidence IS NULL OR confidence IN ('low', 'medium', 'high'))`);
  await knex.raw(`ALTER TABLE ${tableName(RESULTS_TABLE)} ADD CONSTRAINT ai_seo_results_status_check CHECK (status IN ('pass', 'partial', 'fail', 'unavailable', 'not_applicable'))`);
  await knex.raw(`ALTER TABLE ${tableName(RESULTS_TABLE)} ADD CONSTRAINT ai_seo_results_method_check CHECK (method IN ('deterministic', 'llm_assisted', 'integration'))`);
  await knex.raw(`ALTER TABLE ${tableName(RESULTS_TABLE)} ADD CONSTRAINT ai_seo_results_scope_check CHECK (data_scope IN ('url', 'organization', 'location', 'external'))`);
  await knex.raw(`ALTER TABLE ${tableName(EXTERNAL_SOURCES_TABLE)} ADD CONSTRAINT ai_seo_sources_state_check CHECK (entity_match_state IN ('consistent', 'conflicting', 'missing_on_site', 'external_candidate', 'ambiguous_entity', 'unavailable'))`);
};

exports.down = async function down(knex) {
  await knex.schema.withSchema(SCHEMA).dropTableIfExists(EVIDENCE_TABLE);
  await knex.schema.withSchema(SCHEMA).dropTableIfExists(EXTERNAL_SOURCES_TABLE);
  await knex.schema.withSchema(SCHEMA).dropTableIfExists(RESULTS_TABLE);
  await knex.schema.withSchema(SCHEMA).dropTableIfExists(TARGETS_TABLE);
  await knex.schema.withSchema(SCHEMA).dropTableIfExists(RUNS_TABLE);
};
