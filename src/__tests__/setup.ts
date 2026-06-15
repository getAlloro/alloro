/**
 * Vitest global setup — runs once per test file BEFORE any app/module import,
 * so deterministic env is in place before config/jwt.ts, database/config.ts, and
 * the app factory read process.env.
 *
 * Why each var matters:
 *  - JWT_SECRET: config/jwt.ts now fails CLOSED (throws if unset). Signing and
 *    verifying in tests must use one stable secret so a minted test token is
 *    accepted by authenticateToken. Never rely on a fallback — there isn't one.
 *  - NODE_ENV=production: this repo runs NODE_ENV=production uniformly in every
 *    environment (ecosystem.config.js forces it on dev + prod). Tests match that
 *    so any NODE_ENV-gated branch behaves as it does in the real app.
 *  - SUPER_ADMIN_EMAILS: the admin app-logs smoke test mints a token for this
 *    email so superAdminMiddleware lets the authed happy-path through.
 *  - DB_* : the shared knex `db` is mocked in tests that hit SQL, so these are
 *    only a safety floor. Pointed at a non-routable host so a query that slips
 *    past a mock fails fast instead of touching a real database.
 *
 * The suite asserts no outbound network: external SDKs (Anthropic, Google,
 * Stripe, S3) are never invoked because the model/db/email seams they sit behind
 * are mocked per test. Nothing here starts a server or opens a connection.
 */

process.env.NODE_ENV = "production";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-jwt-secret-deterministic";
process.env.SUPER_ADMIN_EMAILS =
  process.env.SUPER_ADMIN_EMAILS || "superadmin@test.alloro";

// Safety floor only — real queries are mocked. Non-routable host so any
// un-mocked query fails fast rather than reaching a live database.
process.env.DB_HOST = process.env.DB_HOST || "127.0.0.1";
process.env.DB_PORT = process.env.DB_PORT || "1";
process.env.DB_USER = process.env.DB_USER || "test";
process.env.DB_PASSWORD = process.env.DB_PASSWORD || "test";
process.env.DB_NAME = process.env.DB_NAME || "test";
process.env.DB_SSL = process.env.DB_SSL || "false";

// Keep Sentry inert in tests (no DSN → no transport).
delete process.env.SENTRY_DSN;
