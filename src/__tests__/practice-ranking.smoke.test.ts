/**
 * Smoke test — practice-ranking latest read.
 *
 * Target: GET /api/practice-ranking/latest (client dashboard).
 *
 * Note: /api/practice-ranking is on the PUBLIC allowlist (client + admin mounts
 * share the prefix; trigger/status routes are externally triggered), so a
 * missing token does NOT 401 here. The auth-boundary assertion for this domain
 * is therefore the validation 400 (missing required param — needs no DB).
 *
 * MOCK-BLOCKED at the models/ seam: getLatestRankings queries
 * `db("practice_rankings")` directly (no model layer). The happy path mocks the
 * shared `db` (helpers/db.ts). Recorded in vitest.config.ts's mock-blocked list.
 *
 * Asserts:
 *   • missing googleAccountId → 400 + error shape (no DB)
 *   • valid params + mocked legacy ranking row → 200 + { success, rankings:[...] }
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { z } from "zod";

import { mockDb, setTableResult, resetTableResults } from "./helpers/db";

vi.mock("../database/connection", () => mockDb());

import { app } from "./helpers/app";

const latestShape = z.object({
  success: z.literal(true),
  rankings: z.array(
    z.object({
      id: z.number(),
      status: z.string(),
    }),
  ),
});

const errorShape = z.object({
  success: z.literal(false),
  error: z.string(),
  message: z.string(),
});

beforeEach(() => {
  vi.clearAllMocks();
  resetTableResults();
});

describe("GET /api/practice-ranking/latest", () => {
  it("returns 400 + error shape when googleAccountId is missing", async () => {
    const res = await request(app).get("/api/practice-ranking/latest");

    expect(res.status).toBe(400);
    expect(() => errorShape.parse(res.body)).not.toThrow();
  });

  it("returns 200 + rankings array for a mocked legacy ranking", async () => {
    // batch query .first() sees batch_id null → controller falls to the legacy
    // branch; the legacy .first() returns this same row → formatted into rankings.
    setTableResult("practice_rankings", {
      id: 555,
      organization_id: 7,
      batch_id: null,
      status: "completed",
      specialty: "endodontics",
      location: "Austin, TX",
      observed_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const res = await request(app)
      .get("/api/practice-ranking/latest")
      .query({ googleAccountId: 7 });

    expect(res.status).toBe(200);
    expect(() => latestShape.parse(res.body)).not.toThrow();
    expect(res.body.rankings[0].id).toBe(555);
  });
});
