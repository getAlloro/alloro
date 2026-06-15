/**
 * Test app handle for Supertest.
 *
 * Re-exports the importable Express app from src/app.ts. Smoke tests do:
 *   import request from "supertest";
 *   import { app } from "./helpers/app";
 *   await request(app).get("/api/...")...
 *
 * Importing the app does NOT bind a port or run the DB/worker bootstrap — that
 * lives in src/index.ts, which tests never import. This keeps the harness
 * hermetic: the real middleware stack (incl. the default-deny auth guard) and
 * the real routers are exercised, with no live socket.
 */

export { app } from "../../app";
export { default } from "../../app";
