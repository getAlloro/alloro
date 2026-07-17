import { readFile } from "node:fs/promises";
import path from "node:path";
import { SCHEMA_METADATA_VERSION, type SchemaMetadata } from "./types";

const REQUIRED_TABLE_PATTERNS = [
  /CREATE TABLE (?:public\.)?users\b/i,
  /CREATE TABLE (?:public\.)?organizations\b/i,
  /CREATE TABLE (?:public\.)?locations\b/i,
  /CREATE TABLE (?:public\.)?knex_migrations\b/i,
];

const FORBIDDEN_SCHEMA_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /^\s*COPY\s/im, reason: "COPY data statement" },
  { pattern: /^\s*INSERT\s+INTO\s/im, reason: "INSERT data statement" },
  { pattern: /--\s*Data for Name:/i, reason: "pg_dump data section" },
  { pattern: /^\s*(?:GRANT|REVOKE)\s/im, reason: "database privilege statement" },
  { pattern: /^\s*ALTER\b.+\bOWNER TO\b/im, reason: "database owner statement" },
  {
    pattern: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i,
    reason: "email-like value",
  },
  {
    pattern: /\b(?:PASSWORD|SECRET|TOKEN)\s*=\s*'[^']+'/i,
    reason: "credential-like literal",
  },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function validateSchemaBaseline(schema: string): void {
  if (!schema.trim().startsWith("--")) {
    throw new Error("Schema baseline does not look like pg_dump output.");
  }
  for (const forbidden of FORBIDDEN_SCHEMA_PATTERNS) {
    if (forbidden.pattern.test(schema)) {
      throw new Error(`Schema baseline contains forbidden ${forbidden.reason}.`);
    }
  }
  for (const required of REQUIRED_TABLE_PATTERNS) {
    if (!required.test(schema)) {
      throw new Error(`Schema baseline is missing required structure: ${required.source}`);
    }
  }
}

export function validateSchemaMetadata(value: unknown): SchemaMetadata {
  if (
    !isRecord(value)
    || value.schemaVersion !== SCHEMA_METADATA_VERSION
    || value.source !== "alloro-dev"
    || typeof value.generatedAt !== "string"
    || typeof value.checkoutHead !== "string"
    || !Array.isArray(value.appliedMigrations)
  ) {
    throw new Error("Schema metadata is invalid.");
  }
  if (
    value.appliedMigrations.some(
      (migration) =>
        typeof migration !== "string"
        || !/^[A-Za-z0-9_.-]+$/.test(migration),
    )
  ) {
    throw new Error("Schema metadata contains an invalid migration name.");
  }
  return value as unknown as SchemaMetadata;
}

export async function verifyCommittedSchema(schemaDir: string): Promise<void> {
  const [schema, metadataText] = await Promise.all([
    readFile(path.join(schemaDir, "baseline.sql"), "utf8"),
    readFile(path.join(schemaDir, "metadata.json"), "utf8"),
  ]);
  validateSchemaBaseline(schema);
  validateSchemaMetadata(JSON.parse(metadataText) as unknown);
}

async function main(): Promise<void> {
  await verifyCommittedSchema(__dirname);
  process.stdout.write("Worktree schema baseline verified.\n");
}

if (require.main === module) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
