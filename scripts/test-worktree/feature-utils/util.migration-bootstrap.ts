import type { SchemaMetadata } from "../schema/types";

function quoteLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

export function buildMigrationBootstrapSql(metadata: SchemaMetadata): string {
  const rows = metadata.appliedMigrations.map(
    (name) =>
      `(${quoteLiteral(name)}, 1, TIMESTAMPTZ '2000-01-01T00:00:00Z')`,
  );
  const insert = rows.length > 0
    ? [
        'INSERT INTO public.knex_migrations ("name", "batch", "migration_time")',
        `VALUES\n  ${rows.join(",\n  ")};`,
      ].join("\n")
    : "";

  return [
    "-- Generated for one disposable worktree runtime. Contains migration names only.",
    insert,
    'INSERT INTO public.knex_migrations_lock ("is_locked")',
    "SELECT 0",
    "WHERE NOT EXISTS (SELECT 1 FROM public.knex_migrations_lock);",
    "",
  ].join("\n");
}

export function parsePublishedPort(output: string): number {
  const match = output.trim().match(/:(\d+)$/);
  if (!match) {
    throw new Error(`Docker returned an invalid published port: ${output.trim()}`);
  }
  const port = Number(match[1]);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`Docker returned an out-of-range port: ${match[1]}`);
  }
  return port;
}
