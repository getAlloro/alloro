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
vi.mock("../agents/service.prompt-loader", () => ({ loadPrompt: () => "SYS" }));
vi.mock("../agents/service.prompt-substituter", () => ({
  substitutePromptPlaceholders: (s: string) => s,
}));
vi.mock("../config/orgLabels", () => ({ resolveOrgType: () => "dental" }));
vi.mock("../models/OrganizationModel", () => ({
  OrganizationModel: { findById: async () => ({ organization_type: "dental" }) },
}));
vi.mock("../utils/rybbit/service.rybbit-data", () => ({
  fetchRybbitDailyComparison: async () => null,
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

/**
 * Pins the metric-family split AT THE PROCESSOR (spec Rev 2's known gap).
 *
 * The selector-level tests prove families resolve independently, but they call
 * the selector directly — so collapsing the two families back together inside
 * the processor's wiring passed the suite. This drives the real processor with
 * a skewed API response (interactions published two days ahead of impressions)
 * and asserts the STORED row resolves impressions on the impressions' own newest
 * day. If the processor stops passing IMPRESSION_METRICS / INTERACTION_METRICS
 * separately, the stored impressions date jumps to the interactions-only day and
 * this fails.
 */
describe("processDailyAgent — metric families resolve on their own dates (Rev 2)", () => {
  const dv = (date: string, n: number) => {
    const [year, month, day] = date.split("-").map(Number);
    return { date: { year, month, day }, value: String(n) };
  };
  // impressions published through 07-18; interactions two days ahead, through 07-20.
  const skewed = {
    gbpData: {
      locations: [
        {
          data: {
            performance: {
              series: [
                {
                  dailyMetricTimeSeries: [
                    {
                      dailyMetric: "BUSINESS_IMPRESSIONS_DESKTOP_MAPS",
                      timeSeries: { datedValues: [dv("2026-07-17", 55), dv("2026-07-18", 63)] },
                    },
                    {
                      dailyMetric: "CALL_CLICKS",
                      timeSeries: { datedValues: [dv("2026-07-19", 3), dv("2026-07-20", 4)] },
                    },
                  ],
                },
              ],
            },
            profile: { title: "Test Practice" },
            reviews: { allTime: { totalReviewCount: 10, averageRating: 4.8 } },
          },
        },
      ],
    },
  };

  it("stores the impressions day, never the interactions-only day, as the row's date", async () => {
    findByLocationId.mockResolvedValue([
      { account_id: "acc-1", external_id: "loc-1", display_name: "HQ" },
    ]);
    fetchAllServiceData.mockResolvedValue(skewed);
    runAgent.mockResolvedValue({ parsed: { verdict: "ok" }, inputTokens: 1, outputTokens: 1 });

    const result = await processDailyAgent(ACCOUNT, {}, DATES, WINDOW, 55);

    expect(result.success).toBe(true);
    const stored = result.rawData.gbp_data;
    // The impressions family resolved to its own newest day...
    expect(stored.yesterday.data_date).toBe("2026-07-18");
    expect(stored.yesterday.visibility.impressions_maps_desktop).toBe(63);
    // ...NOT the interactions-only day. If the processor collapsed the families,
    // this date would be 2026-07-20 with a fabricated zero impressions.
    expect(stored.yesterday.data_date).not.toBe("2026-07-20");
    // The interaction family kept its own later day.
    expect(stored.yesterday.engagement.data_date).toBe("2026-07-20");
    expect(stored.yesterday.engagement.call_clicks).toBe(4);
    // The row's stored end date is the impressions day (the funnel gate).
    expect(result.rawData.date_end).toBe("2026-07-18");
  });
});
