import { randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  composeProjectName,
} from "../config";
import { runCommand } from "../feature-utils/util.command";
import {
  buildMigrationBootstrapSql,
  parsePublishedPort,
} from "../feature-utils/util.migration-bootstrap";
import { validateSchemaMetadata, verifyCommittedSchema } from "../schema/verify";
import type { RuntimeRequest } from "../types";

const POSTGRES_USER = "alloro_worktree";
const POSTGRES_DATABASE = "alloro_worktree";

function combinedError(message: string, errors: unknown[]): Error {
  const details = errors
    .map((error) => (error instanceof Error ? error.message : String(error)))
    .join(" | ");
  return new Error(`${message} ${details}`);
}

export interface DatabaseRuntime {
  postgresPort: number;
  redisPort: number;
  composeProject: string;
  composePath: string;
  composeEnvironment: NodeJS.ProcessEnv;
  applicationEnvironment: NodeJS.ProcessEnv;
}

function dockerEnvironment(overrides: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    TMPDIR: process.env.TMPDIR,
    DOCKER_HOST: process.env.DOCKER_HOST,
    DOCKER_CONTEXT: process.env.DOCKER_CONTEXT,
    ...overrides,
  };
}

async function readSchemaMetadata(schemaDir: string) {
  const text = await readFile(path.join(schemaDir, "metadata.json"), "utf8");
  return validateSchemaMetadata(JSON.parse(text) as unknown);
}

async function composePort(
  request: RuntimeRequest,
  composePath: string,
  environment: NodeJS.ProcessEnv,
  service: "postgres" | "redis",
  containerPort: number,
): Promise<number> {
  const result = await runCommand(
    "docker",
    [
      "compose",
      "-p",
      composeProjectName(request.runtimeId),
      "-f",
      composePath,
      "port",
      service,
      String(containerPort),
    ],
    request.worktree.worktreePath,
    environment,
  );
  return parsePublishedPort(result.stdout);
}

export async function stopDatabaseRuntime(runtime: DatabaseRuntime): Promise<void> {
  await runCommand(
    "docker",
    [
      "compose",
      "-p",
      runtime.composeProject,
      "-f",
      runtime.composePath,
      "down",
      "-v",
      "--remove-orphans",
    ],
    path.dirname(path.dirname(path.dirname(runtime.composePath))),
    runtime.composeEnvironment,
  );
}

export async function startDatabaseRuntime(
  request: RuntimeRequest,
): Promise<DatabaseRuntime> {
  const schemaDir = path.join(
    request.worktree.worktreePath,
    "scripts/test-worktree/schema",
  );
  await verifyCommittedSchema(schemaDir);
  const metadata = await readSchemaMetadata(schemaDir);
  const migrationBootstrapPath = path.join(
    request.runtimeDir,
    "migration-bootstrap.sql",
  );
  await writeFile(
    migrationBootstrapPath,
    buildMigrationBootstrapSql(metadata),
    { encoding: "utf8", mode: 0o600 },
  );

  const composePath = path.join(
    request.worktree.worktreePath,
    "scripts/test-worktree/docker-compose.yml",
  );
  const password = randomBytes(32).toString("hex");
  const composeProject = composeProjectName(request.runtimeId);
  const composeEnvironment = dockerEnvironment({
    ALLORO_POSTGRES_DB: POSTGRES_DATABASE,
    ALLORO_POSTGRES_USER: POSTGRES_USER,
    ALLORO_POSTGRES_PASSWORD: password,
    ALLORO_SCHEMA_BASELINE_PATH: path.join(schemaDir, "baseline.sql"),
    ALLORO_MIGRATION_BOOTSTRAP_PATH: migrationBootstrapPath,
  });

  await runCommand("docker", ["version"], request.worktree.worktreePath, composeEnvironment);
  await runCommand(
    "docker",
    ["compose", "version"],
    request.worktree.worktreePath,
    composeEnvironment,
  );

  try {
    await runCommand(
      "docker",
      [
        "compose",
        "-p",
        composeProject,
        "-f",
        composePath,
        "up",
        "-d",
        "--wait",
        "--wait-timeout",
        "120",
      ],
      request.worktree.worktreePath,
      composeEnvironment,
    );

    const [postgresPort, redisPort] = await Promise.all([
      composePort(request, composePath, composeEnvironment, "postgres", 5432),
      composePort(request, composePath, composeEnvironment, "redis", 6379),
    ]);
    const applicationEnvironment: NodeJS.ProcessEnv = {
      DB_HOST: "127.0.0.1",
      DB_PORT: String(postgresPort),
      DB_USER: POSTGRES_USER,
      DB_PASSWORD: password,
      DB_NAME: POSTGRES_DATABASE,
      DB_SSL: "false",
      REDIS_HOST: "127.0.0.1",
      REDIS_PORT: String(redisPort),
      REDIS_TLS: "false",
    };

    await runCommand(
      "npx",
      ["knex", "migrate:latest"],
      request.worktree.worktreePath,
      {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        TMPDIR: process.env.TMPDIR,
        NODE_ENV: "production",
        ALLORO_WORKTREE_TEST_MODE: "true",
        LOG_LEVEL: "warn",
        ...applicationEnvironment,
      },
    );

    return {
      postgresPort,
      redisPort,
      composeProject,
      composePath,
      composeEnvironment,
      applicationEnvironment,
    };
  } catch (error) {
    let postgresDiagnostics = "";
    try {
      const result = await runCommand(
        "docker",
        [
          "compose",
          "-p",
          composeProject,
          "-f",
          composePath,
          "logs",
          "--no-color",
          "--tail",
          "80",
          "postgres",
        ],
        request.worktree.worktreePath,
        composeEnvironment,
      );
      postgresDiagnostics = result.stdout || result.stderr;
    } catch (diagnosticError) {
      postgresDiagnostics =
        `Postgres diagnostics unavailable: ${
          diagnosticError instanceof Error
            ? diagnosticError.message
            : String(diagnosticError)
        }`;
    }

    try {
      await runCommand(
        "docker",
        [
          "compose",
          "-p",
          composeProject,
          "-f",
          composePath,
          "down",
          "-v",
          "--remove-orphans",
        ],
        request.worktree.worktreePath,
        composeEnvironment,
      );
    } catch (cleanupError) {
      throw combinedError(
        "Database runtime startup and cleanup both failed.",
        [error, cleanupError, postgresDiagnostics],
      );
    }
    throw combinedError(
      "Database runtime startup failed.",
      [error, postgresDiagnostics],
    );
  }
}
