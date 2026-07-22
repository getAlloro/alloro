/**
 * Unit test — processDailyAgent skips a real location that has no mapped GBP
 * property, instead of running the Claude agent on an empty payload and storing
 * a zeros google_data_store row.
 *
 * The account-blob fallback only fires for the org-level/primary run (no
 * locationId); a real location with no mapped GBP listing must NOT fall back to
 * the account's first listing (the C1 double-count guard). Before this fix that
 * left such a location with an empty payload that STILL burned a Claude call and
 * inserted a zeros row. The guard now returns a clean skip BEFORE any fetch or
 * agent call. Models/network are mocked (§20.1/§20.4) so the skip path is proven
 * in isolation.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Seams: keep the processor off the real DB / Google APIs / Claude ──
const findByLocationId = vi.fn();
const fetchAllServiceData = vi.fn();
const runAgent = vi.fn();

vi.mock("../models/GooglePropertyModel", () => ({
  GooglePropertyModel: {
    findByLocationId: (...a: unknown[]) => findByLocationId(...a),
  },
}));
vi.mock("../utils/dataAggregation/dataAggregator", () => ({
  fetchAllServiceData: (...a: unknown[]) => fetchAllServiceData(...a),
}));
vi.mock("../agents/service.llm-runner", () => ({
  runAgent: (...a: unknown[]) => runAgent(...a),
}));
vi.mock("../controllers/agents/feature-utils/agentLogger", () => ({
  log: () => {},
  logError: () => {},
  isValidAgentOutput: () => true,
  logAgentOutput: () => {},
}));

import { processDailyAgent } from "../controllers/agents/feature-services/service.daily-agent-processor";

const DATES = {
  yesterday: "2026-06-10",
  dayBeforeYesterday: "2026-06-09",
} as unknown as Parameters<typeof processDailyAgent>[2];

/** The GBP trailing window — separate from DATES because Rybbit is not lagged. */
const WINDOW = {
  startDate: "2026-06-04",
  endDate: "2026-06-10",
} as unknown as Parameters<typeof processDailyAgent>[3];

const ACCOUNT = {
  id: 1,
  domain_name: "example.com",
  organization_id: 7,
  // The account blob DOES carry a listing — proving the skip is driven by the
  // location being unmapped, NOT by the account having no GBP at all.
  google_property_ids: {
    gbp: [{ accountId: "acc-1", locationId: "loc-1", displayName: "HQ" }],
  },
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("processDailyAgent — unmapped location skip (no wasted Claude call, no zeros row)", () => {
  it("skips a real location with no mapped GBP property before any fetch/agent call", async () => {
    // Location 42 has no google_properties rows → unmapped.
    findByLocationId.mockResolvedValue([]);

    const result = await processDailyAgent(ACCOUNT, {}, DATES, WINDOW, 42);

    expect(result.skipped).toBe(true);
    expect(result.success).toBe(false);
    // No zeros payload to persist — the executor must not insert a raw row.
    expect(result.rawData).toBeUndefined();
    // The whole point of the fix: no data fetch and no Claude call on an empty
    // payload for an unmapped location.
    expect(fetchAllServiceData).not.toHaveBeenCalled();
    expect(runAgent).not.toHaveBeenCalled();
    // It resolved the location's mapping before deciding to skip.
    expect(findByLocationId).toHaveBeenCalledWith(42);
  });
});
