/**
 * P1 migration integration proof — REAL database, no mocks
 * (plans/07042026-alloro-os-admin-port, phase gate for
 * 20260704000000_create_os_knowledge_base_tables.ts).
 *
 * Target: the database the local .env points at — the disposable pgvector
 * replica (alloro_admin_os_test), never shared dev/prod. All other repo
 * migrations are already applied there, so latest()/rollback() only ever
 * touch this plan's migration (the sole pending batch).
 *
 * Proves programmatically: migrate.latest() → schema `os` with all 16 tables,
 * vector(1536) chunk column, HNSW + GIN indexes → migrate.rollback() → schema
 * gone → migrate.latest() again → present. The DB is left MIGRATED.
 *
 * ts-node/register/transpile-only is loaded first so knex's migrator can
 * require() the .ts migration files inside the vitest fork (Node 20 has no
 * native TS loader; the knex CLI normally registers this itself).
 */

import "ts-node/register/transpile-only";
import { describe, it, expect, afterAll } from "vitest";
import { db } from "../../database/connection";

const OS_TABLES = [
  "activity",
  "assets",
  "chat_context_documents",
  "chat_conversations",
  "chat_messages",
  "comments",
  "document_ai_index",
  "document_categories",
  "document_chunks",
  "document_drafts",
  "document_imports",
  "document_links",
  "document_locks",
  "document_versions",
  "documents",
  "folders",
];

async function listOsTables(): Promise<string[]> {
  const result = await db.raw(
    `SELECT table_name
     FROM information_schema.tables
     WHERE table_schema = 'os'
     ORDER BY table_name`
  );
  return result.rows.map((row: { table_name: string }) => row.table_name);
}

async function osSchemaExists(): Promise<boolean> {
  const result = await db.raw(
    `SELECT 1 FROM information_schema.schemata WHERE schema_name = 'os'`
  );
  return result.rows.length > 0;
}

describe("P1 migration — schema os (latest → rollback → latest)", () => {
  afterAll(async () => {
    await db.destroy();
  });

  it("migrate.latest() creates schema os with all 16 tables", async () => {
    await db.migrate.latest();

    expect(await osSchemaExists()).toBe(true);
    expect(await listOsTables()).toEqual(OS_TABLES);
  });

  it("document_chunks has vector(1536) + HNSW index; documents has the GIN tsv index", async () => {
    const columnType = await db.raw(
      `SELECT format_type(a.atttypid, a.atttypmod) AS type
       FROM pg_attribute a
       JOIN pg_class c ON c.oid = a.attrelid
       JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'os'
         AND c.relname = 'document_chunks'
         AND a.attname = 'embedding'`
    );
    expect(columnType.rows[0]?.type).toBe("vector(1536)");

    const hnswIndex = await db.raw(
      `SELECT indexdef FROM pg_indexes
       WHERE schemaname = 'os'
         AND tablename = 'document_chunks'
         AND indexname = 'document_chunks_embedding_idx'`
    );
    expect(hnswIndex.rows[0]?.indexdef ?? "").toContain("hnsw");

    const ginIndex = await db.raw(
      `SELECT indexdef FROM pg_indexes
       WHERE schemaname = 'os'
         AND tablename = 'documents'
         AND indexname = 'documents_tsv_idx'`
    );
    expect(ginIndex.rows[0]?.indexdef ?? "").toContain("gin");
  });

  it("rollback() drops tables then the schema; latest() re-creates; DB left migrated", async () => {
    await db.migrate.rollback();
    expect(await osSchemaExists()).toBe(false);

    await db.migrate.latest();
    expect(await osSchemaExists()).toBe(true);
    expect(await listOsTables()).toEqual(OS_TABLES);
  });
});
