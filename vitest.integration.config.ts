/**
 * Vitest config — integration tier (REAL database, no mocks).
 *
 * Runs ONLY the .itest.ts files under src/integration-tests/ against the
 * database the local .env points at — expected to be the disposable local pgvector
 * replica (alloro_admin_os_test), NEVER the shared dev/prod databases.
 *
 * Deliberately separate from vitest.config.ts: `npm test` stays hermetic
 * (mocked db/models, no network), while this tier proves migrations and
 * schema against a live Postgres. Run: npm run test:integration:os
 *
 * No setupFiles: dotenv loads through src/database/config.ts on first import
 * of the connection, and the hermetic suite's setup.ts (which points DB_* at
 * a non-routable host) must NOT run here.
 */
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/integration-tests/**/*.itest.ts"],
    pool: "forks",
    fileParallelism: false,
    testTimeout: 120_000,
    hookTimeout: 120_000,
    // Vitest defaults NODE_ENV to "test", but database/config.ts only defines
    // production/development profiles — pick the local-dev profile explicitly.
    env: { NODE_ENV: "development" },
  },
});
