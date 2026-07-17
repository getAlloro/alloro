import knex, { type Knex } from "knex";
import { randomBytes } from "node:crypto";
import type { FixtureProfile } from "../types";
import { seedBaselineFixture } from "./baseline";
import { seedGbpPostsFixture } from "./gbp-posts";

export interface FixtureDatabaseConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

function assertLocalFixtureDatabase(config: FixtureDatabaseConfig): void {
  if (
    process.env.ALLORO_WORKTREE_TEST_MODE !== "true"
    || config.host !== "127.0.0.1"
    || config.database !== "alloro_worktree"
  ) {
    throw new Error(
      "Refusing fixture seed: target is not a verified local worktree database.",
    );
  }
}

function knexConfig(config: FixtureDatabaseConfig): Knex.Config {
  return {
    client: "pg",
    connection: {
      host: config.host,
      port: config.port,
      user: config.user,
      password: config.password,
      database: config.database,
      ssl: false,
    },
    pool: { min: 0, max: 2 },
  };
}

export async function seedFixtureProfile(
  config: FixtureDatabaseConfig,
  fixture: FixtureProfile,
): Promise<void> {
  assertLocalFixtureDatabase(config);
  const database = knex(knexConfig(config));
  try {
    await database.transaction(async (trx) => {
      await seedBaselineFixture(trx);
      if (fixture === "gbp-posts") {
        await seedGbpPostsFixture(
          trx,
          `disabled-${randomBytes(24).toString("hex")}`,
        );
      }
    });
  } finally {
    await database.destroy();
  }
}
