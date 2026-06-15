/**
 * Vitest config — backend smoke-test harness.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * HOW TO RUN
 *   npm test          → one-shot run (vitest run), used by humans + (later) CI
 *   npm run test:watch→ watch mode while iterating on a test
 * ─────────────────────────────────────────────────────────────────────────────
 * LAYOUT (extend this — do not invent a parallel one)
 *   src/__tests__/<domain>.smoke.test.ts   one smoke file per endpoint domain
 *   src/__tests__/helpers/app.ts           re-exports the importable Express app
 *   src/__tests__/helpers/auth.ts          mints a valid test JWT + Bearer header
 *   src/__tests__/helpers/db.ts            chainable mock for the shared knex `db`
 *   src/__tests__/setup.ts                 deterministic test env (runs first)
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THESE TESTS ARE
 *   A smoke NET, not coverage. Each test asserts HTTP status + response SHAPE
 *   (via zod, already a dep) over the highest-value endpoints, so a refactor
 *   that breaks a route's status or shape fails loudly. No deep business-logic
 *   assertions, no whole-payload snapshots.
 *
 * DATA STRATEGY — Option B (mock the data layer), chosen for this first pass.
 *   The suite runs with NO live Postgres and NO outbound network:
 *     • The shared knex `db` (src/database/connection.ts) is mocked via
 *       helpers/db.ts where a route's middleware/controller hits SQL directly
 *       (rbac, tokenRefresh, and db-bypassing controllers all use raw `db()`).
 *     • Per-model seams are mocked with `vi.mock("../models/XModel", ...)` where
 *       a controller routes cleanly through models/ (e.g. auth → UserModel).
 *     • The email sender (emails/emailService) is mocked so login/OTP never send.
 *   Option A (a real disposable/migrated test DB) is deferred to a later phase,
 *   to be adopted once the db-into-models cleanup pushes real query coverage
 *   behind the models/ seam — see the plan's Pushback section.
 *
 * MOCK-BLOCKED ENDPOINTS (for the db-into-models plan's priority order)
 *   These cannot be isolated at the models/ seam because the request path runs
 *   raw `db("table")` BEFORE the controller (or in the controller itself):
 *     • GET /api/pms/file-manager   — rbacMiddleware + locationScopeMiddleware
 *                                      query organization_users / locations.
 *     • GET /api/gbp/diag/accounts  — rbac + tokenRefreshMiddleware query
 *                                      organization_users / google_connections.
 *     • GET /api/practice-ranking/latest — controller queries practice_rankings
 *                                      directly (no model layer).
 *   For these, the smoke tests mock the shared `db` (helpers/db.ts) for the
 *   authed happy-path and additionally assert the no-token 401 (which needs no
 *   DB at all and proves the app-level default-deny guard).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Node, not jsdom — this is a backend HTTP harness.
    environment: "node",
    // Only pick up the smoke files; ignore source/build dirs.
    include: ["src/__tests__/**/*.{test,spec}.ts"],
    // Deterministic env (JWT_SECRET, NODE_ENV, super-admin) BEFORE app import.
    setupFiles: ["src/__tests__/setup.ts"],
    // Smoke suite is small + hermetic; a single fork keeps mocks isolated and
    // avoids spinning up the (mocked) knex pool in parallel workers.
    pool: "forks",
  },
});
