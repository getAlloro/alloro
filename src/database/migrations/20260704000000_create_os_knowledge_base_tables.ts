import { Knex } from "knex";

/**
 * Alloro OS → Admin Port — dedicated schema `os` + 16 knowledge-base tables.
 * Plan: plans/07042026-alloro-os-admin-port (master spec D4, Rev 2).
 *
 * All tables live in a DEDICATED SCHEMA `os`, mirroring the existing `minds`
 * schema precedent (20260227000002). Table names inside the schema are
 * unprefixed; models use dot-qualified table names ("os.documents"), exactly
 * like MindBrainChunkModel's "minds.mind_brain_chunks".
 * knex_migrations bookkeeping stays in `public`.
 *
 * Facts verified 2026-07-04:
 *  - pgvector v0.8.0 installed and ACTIVE on both dev and prod (PG 17.9).
 *  - users.id is INTEGER (serial) — all user FKs below are integer → public.users.
 *  - Everything here is additive and confined to the new `os` schema: no locks
 *    on existing tables, no data rewrites, production-safe, reversible down().
 */

export async function up(knex: Knex): Promise<void> {
  await knex.raw("CREATE EXTENSION IF NOT EXISTS vector"); // idempotent safeguard (minds created it)
  await knex.raw("CREATE SCHEMA IF NOT EXISTS os");

  await knex.schema.withSchema("os").createTable("folders", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.text("name").notNullable();
    t.uuid("parent_id").nullable().references("id").inTable("os.folders").onDelete("SET NULL");
    t.integer("created_by").nullable().references("id").inTable("public.users").onDelete("SET NULL");
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.index(["parent_id"], "folders_parent_idx");
  });

  await knex.schema.withSchema("os").createTable("documents", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.uuid("folder_id").nullable().references("id").inTable("os.folders").onDelete("SET NULL");
    t.text("title").notNullable();
    t.text("slug").notNullable().unique();
    t.uuid("current_version_id").nullable(); // app-managed; no FK (circular with versions)
    t.text("status").notNullable().defaultTo("processing");
    t.specificType("search_tsv", "tsvector");
    t.integer("owner_id").nullable().references("id").inTable("public.users").onDelete("SET NULL");
    t.integer("created_by").nullable().references("id").inTable("public.users").onDelete("SET NULL");
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp("archived_at", { useTz: true }).nullable();
    t.index(["status"], "documents_status_idx");
    t.index(["folder_id"], "documents_folder_idx");
    t.index(["owner_id"], "documents_owner_idx");
  });
  await knex.raw(
    "ALTER TABLE os.documents ADD CONSTRAINT documents_status_check CHECK (status IN ('processing','indexed','archived','processing_failed'))"
  );
  await knex.raw("CREATE INDEX documents_tsv_idx ON os.documents USING gin(search_tsv)");

  await knex.schema.withSchema("os").createTable("document_versions", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.uuid("document_id").notNullable().references("id").inTable("os.documents").onDelete("CASCADE");
    t.integer("version_no").notNullable();
    t.text("title");
    t.text("content_md").notNullable().defaultTo("");
    t.jsonb("toc_json");
    t.text("ai_change_summary");
    t.text("human_note");
    t.integer("author_id").nullable().references("id").inTable("public.users").onDelete("SET NULL");
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.unique(["document_id", "version_no"]);
  });

  await knex.schema.withSchema("os").createTable("document_drafts", (t) => {
    t.uuid("document_id").primary().references("id").inTable("os.documents").onDelete("CASCADE");
    t.text("content_md").notNullable().defaultTo("");
    t.integer("base_version");
    t.integer("updated_by").nullable().references("id").inTable("public.users").onDelete("SET NULL");
    t.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.withSchema("os").createTable("document_ai_index", (t) => {
    t.uuid("document_id").primary().references("id").inTable("os.documents").onDelete("CASCADE");
    t.text("summary");
    t.text("category");
    t.jsonb("tags").notNullable().defaultTo("[]");
    t.integer("generated_for");
    t.timestamp("generated_at", { useTz: true });
    t.boolean("meta_locked").notNullable().defaultTo(false);
  });
  await knex.raw("CREATE INDEX document_ai_index_tags_idx ON os.document_ai_index USING gin(tags)");

  await knex.schema.withSchema("os").createTable("document_chunks", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.uuid("document_id").notNullable().references("id").inTable("os.documents").onDelete("CASCADE");
    t.integer("version_no").notNullable();
    t.integer("chunk_index").notNullable();
    t.text("heading_path");
    t.text("content").notNullable();
    t.integer("token_count");
    t.specificType("embedding", "vector(1536)").notNullable();
    t.index(["document_id"], "document_chunks_doc_idx");
  });
  await knex.raw(
    "CREATE INDEX document_chunks_embedding_idx ON os.document_chunks USING hnsw (embedding vector_cosine_ops)"
  );

  await knex.schema.withSchema("os").createTable("document_links", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.uuid("source_document_id").notNullable().references("id").inTable("os.documents").onDelete("CASCADE");
    t.uuid("target_document_id").notNullable().references("id").inTable("os.documents").onDelete("CASCADE");
    t.text("origin").notNullable();
    t.text("status").notNullable().defaultTo("suggested");
    t.integer("created_by").nullable().references("id").inTable("public.users").onDelete("SET NULL");
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.unique(["source_document_id", "target_document_id"]);
  });
  await knex.raw(
    "ALTER TABLE os.document_links ADD CONSTRAINT document_links_origin_check CHECK (origin IN ('manual','ai_suggested','content_parsed'))"
  );
  await knex.raw(
    "ALTER TABLE os.document_links ADD CONSTRAINT document_links_status_check CHECK (status IN ('suggested','accepted','rejected'))"
  );

  await knex.schema.withSchema("os").createTable("document_locks", (t) => {
    t.uuid("document_id").primary().references("id").inTable("os.documents").onDelete("CASCADE");
    t.integer("locked_by").notNullable().references("id").inTable("public.users").onDelete("CASCADE");
    t.timestamp("acquired_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp("heartbeat_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp("expires_at", { useTz: true }).notNullable();
  });

  await knex.schema.withSchema("os").createTable("chat_conversations", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.integer("user_id").notNullable().references("id").inTable("public.users").onDelete("CASCADE");
    t.text("title");
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.index(["user_id"], "chat_conversations_user_idx");
  });

  await knex.schema.withSchema("os").createTable("chat_messages", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.uuid("conversation_id").notNullable().references("id").inTable("os.chat_conversations").onDelete("CASCADE");
    t.text("role").notNullable();
    t.text("content").notNullable();
    t.jsonb("citations").notNullable().defaultTo("[]");
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.index(["conversation_id", "created_at"], "chat_messages_conversation_idx");
  });
  await knex.raw(
    "ALTER TABLE os.chat_messages ADD CONSTRAINT chat_messages_role_check CHECK (role IN ('user','assistant'))"
  );

  await knex.schema.withSchema("os").createTable("chat_context_documents", (t) => {
    t.uuid("conversation_id").notNullable().references("id").inTable("os.chat_conversations").onDelete("CASCADE");
    t.uuid("document_id").notNullable().references("id").inTable("os.documents").onDelete("CASCADE");
    t.text("origin").notNullable().defaultTo("manual");
    t.primary(["conversation_id", "document_id"]);
  });

  await knex.schema.withSchema("os").createTable("document_categories", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.text("name").notNullable();
    t.text("normalized_name").notNullable().unique();
    t.integer("created_by").nullable().references("id").inTable("public.users").onDelete("SET NULL");
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.withSchema("os").createTable("assets", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.uuid("document_id").notNullable().references("id").inTable("os.documents").onDelete("CASCADE");
    t.text("s3_key").notNullable();
    t.text("mime").notNullable();
    t.bigInteger("size_bytes").notNullable().defaultTo(0);
    t.integer("uploaded_by").nullable().references("id").inTable("public.users").onDelete("SET NULL");
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.index(["document_id"], "assets_document_idx");
  });

  await knex.schema.withSchema("os").createTable("document_imports", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.uuid("document_id").notNullable().references("id").inTable("os.documents").onDelete("CASCADE");
    t.text("original_filename").notNullable();
    t.text("source_mime");
    t.text("source_s3_key");
    t.bigInteger("size_bytes");
    t.text("converter");
    t.text("status").notNullable().defaultTo("pending");
    t.jsonb("warnings").notNullable().defaultTo("[]");
    t.integer("imported_by").nullable().references("id").inTable("public.users").onDelete("SET NULL");
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp("converted_at", { useTz: true }).nullable();
    t.index(["document_id"], "document_imports_document_idx");
  });

  await knex.schema.withSchema("os").createTable("comments", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.uuid("document_id").notNullable().references("id").inTable("os.documents").onDelete("CASCADE");
    t.uuid("parent_comment_id").nullable().references("id").inTable("os.comments").onDelete("CASCADE");
    t.integer("author_id").nullable().references("id").inTable("public.users").onDelete("SET NULL");
    t.text("body_md").notNullable();
    t.integer("version_tag");
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp("deleted_at", { useTz: true }).nullable();
    t.index(["document_id"], "comments_document_idx");
  });

  await knex.schema.withSchema("os").createTable("activity", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.integer("actor_id").nullable().references("id").inTable("public.users").onDelete("SET NULL");
    t.text("action").notNullable();
    t.text("target_type").notNullable();
    t.uuid("target_id");
    t.jsonb("metadata").notNullable().defaultTo("{}");
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.index(["target_type", "target_id"], "activity_target_idx");
    t.index(["created_at"], "activity_created_idx");
  });
}

export async function down(knex: Knex): Promise<void> {
  // Reverse-dependency order; the os schema is owned solely by this plan.
  const drop = (name: string) => knex.schema.withSchema("os").dropTableIfExists(name);
  await drop("activity");
  await drop("comments");
  await drop("document_imports");
  await drop("assets");
  await drop("document_categories");
  await drop("chat_context_documents");
  await drop("chat_messages");
  await drop("chat_conversations");
  await drop("document_locks");
  await drop("document_links");
  await drop("document_chunks");
  await drop("document_ai_index");
  await drop("document_drafts");
  await drop("document_versions");
  await drop("documents");
  await drop("folders");
  await knex.raw("DROP SCHEMA IF EXISTS os");
  // Never drop the vector extension — shared with minds.mind_brain_chunks.
}
