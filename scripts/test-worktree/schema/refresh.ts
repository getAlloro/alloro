import { readdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { runCommand } from "../feature-utils/util.command";
import {
  SCHEMA_METADATA_VERSION,
  type SchemaMetadata,
} from "./types";
import {
  validateSchemaBaseline,
  validateSchemaMetadata,
} from "./verify";

const SOURCE_ALIAS = "alloro-dev";
const CONFIRMATION_FLAG = "--confirm-dev-schema-only";
const REMOTE_ENV_PREFIX = [
  "set -a",
  ". /etc/alloro/dev.env",
  "set +a",
  "export PGPASSWORD=\"$DB_PASSWORD\"",
].join("; ");
const SCHEMA_COMMAND = `${REMOTE_ENV_PREFIX}; ${[
  "exec pg_dump",
  "--host=\"$DB_HOST\"",
  "--port=\"${DB_PORT:-5432}\"",
  "--username=\"$DB_USER\"",
  "--dbname=\"$DB_NAME\"",
  "--schema-only",
  "--no-owner",
  "--no-privileges",
].join(" ")}`;
const MIGRATIONS_COMMAND = `${REMOTE_ENV_PREFIX}; ${[
  "exec psql",
  "--host=\"$DB_HOST\"",
  "--port=\"${DB_PORT:-5432}\"",
  "--username=\"$DB_USER\"",
  "--dbname=\"$DB_NAME\"",
  "--tuples-only",
  "--no-align",
  "--command",
  "\"SELECT name FROM knex_migrations ORDER BY id\"",
].join(" ")}`;

function requireRefreshConfirmation(args: string[]): void {
  const sourceIndex = args.indexOf("--source");
  const source = sourceIndex >= 0 ? args[sourceIndex + 1] : null;
  if (source !== SOURCE_ALIAS || !args.includes(CONFIRMATION_FLAG)) {
    throw new Error(
      `Refusing schema refresh. Use --source ${SOURCE_ALIAS} ${CONFIRMATION_FLAG}.`,
    );
  }
}

async function assertMigrationsBelongToCheckout(
  worktreePath: string,
  appliedMigrations: string[],
): Promise<void> {
  const migrationDir = path.join(worktreePath, "src/database/migrations");
  const checkoutMigrations = new Set(await readdir(migrationDir));
  const unknown = appliedMigrations.filter(
    (migration) => !checkoutMigrations.has(migration),
  );
  if (unknown.length > 0) {
    throw new Error(
      `Dev has migrations absent from this checkout: ${unknown.join(", ")}`,
    );
  }
}

async function writeAtomic(filePath: string, content: string): Promise<void> {
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, content, { encoding: "utf8", mode: 0o644 });
  await rename(temporaryPath, filePath);
}

async function main(): Promise<void> {
  requireRefreshConfirmation(process.argv.slice(2));
  const worktreePath = (
    await runCommand("git", ["rev-parse", "--show-toplevel"], process.cwd())
  ).stdout;
  const checkoutHead = (
    await runCommand("git", ["rev-parse", "HEAD"], worktreePath)
  ).stdout;
  const [schemaResult, migrationResult] = await Promise.all([
    runCommand("ssh", [SOURCE_ALIAS, SCHEMA_COMMAND], worktreePath),
    runCommand("ssh", [SOURCE_ALIAS, MIGRATIONS_COMMAND], worktreePath),
  ]);
  const schema = `${schemaResult.stdout}\n`;
  const appliedMigrations = migrationResult.stdout
    .split("\n")
    .map((migration) => migration.trim())
    .filter(Boolean);

  validateSchemaBaseline(schema);
  await assertMigrationsBelongToCheckout(worktreePath, appliedMigrations);
  const metadata: SchemaMetadata = validateSchemaMetadata({
    schemaVersion: SCHEMA_METADATA_VERSION,
    source: SOURCE_ALIAS,
    generatedAt: new Date().toISOString(),
    checkoutHead,
    appliedMigrations,
  });

  await Promise.all([
    writeAtomic(path.join(__dirname, "baseline.sql"), schema),
    writeAtomic(
      path.join(__dirname, "metadata.json"),
      `${JSON.stringify(metadata, null, 2)}\n`,
    ),
  ]);
  process.stdout.write(
    `Wrote schema-only baseline with ${appliedMigrations.length} applied migrations.\n`,
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
