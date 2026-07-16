import { describe, it, expect, vi, afterEach } from "vitest";
import { summarizeNapConsistency } from "../services/nap-consistency/summarizer";
import type { UrlAuditSnapshot } from "../services/ai-seo-audit/types";
import {
  executeNapConsistencyAgent,
  dedupeTargetsByLocation,
  NapTarget,
} from "../services/nap-consistency/executor";
import {
  NapConsistencyObservationModel,
  RecordNapObservationInput,
} from "../models/NapConsistencyObservationModel";

/**
 * Alloro Funnel Engine A4 (Citations & NAP Consistency Monitor) proofs. Locks the
 * pure summarizer (only real 'conflicting' counts as a conflict) and the executor
 * (per-location run + persist, no-baseline skip, honest 0-sources record, and
 * per-location failure isolation) — all without network or DB via injected seams.
 */

describe("summarizeNapConsistency", () => {
  it("counts consistent and only 'conflicting' as conflicts, and lists them", () => {
    const s = summarizeNapConsistency([
      { url: "https://yelp.com/x", sourceHost: "yelp.com", entityMatchState: "consistent" },
      { url: "https://healthgrades.com/x", sourceHost: "healthgrades.com", entityMatchState: "conflicting" },
      { url: "https://maps.google.com/x", sourceHost: "maps.google.com", entityMatchState: "ambiguous_entity" },
    ]);
    expect(s.sourcesChecked).toBe(3);
    expect(s.consistentCount).toBe(1);
    expect(s.conflictCount).toBe(1);
    expect(s.conflicts).toEqual([
      { source: "https://healthgrades.com/x", sourceHost: "healthgrades.com", matchState: "conflicting" },
    ]);
  });
  it("does not count weak/uncertain states as conflicts", () => {
    const s = summarizeNapConsistency([
      { url: "a", sourceHost: "a", entityMatchState: "external_candidate" },
      { url: "b", sourceHost: "b", entityMatchState: "missing_on_site" },
    ]);
    expect(s.conflictCount).toBe(0);
  });
  it("empty / nullish → all zeros", () => {
    const zero = { sourcesChecked: 0, consistentCount: 0, conflictCount: 0, conflicts: [] };
    expect(summarizeNapConsistency([])).toEqual(zero);
    expect(summarizeNapConsistency(null)).toEqual(zero);
  });
});

describe("dedupeTargetsByLocation (adversary regression: >1 connection per org)", () => {
  it("keeps one target per locationId (no double SerpApi cost / over-count)", () => {
    const dupes: NapTarget[] = [
      { organizationId: 5, locationId: 50, domain: "a.com" },
      { organizationId: 5, locationId: 50, domain: "a.com" }, // same location via a 2nd connection
      { organizationId: 5, locationId: 51, domain: "b.com" },
    ];
    const out = dedupeTargetsByLocation(dupes);
    expect(out.map((t) => t.locationId)).toEqual([50, 51]);
  });
});

describe("executeNapConsistencyAgent", () => {
  const targets: NapTarget[] = [
    { organizationId: 1, locationId: 10, domain: "a.com" },
    { organizationId: 1, locationId: 11, domain: "b.com" },
    { organizationId: 2, locationId: 20, domain: null }, // no baseline → skip
  ];

  it("records a snapshot per runnable location and skips no-baseline targets", async () => {
    const recorded: RecordNapObservationInput[] = [];
    const res = await executeNapConsistencyAgent({
      targetProvider: async () => targets,
      runner: async (t) =>
        t.domain
          ? {
              status: "ok",
              sources: [
                { url: `https://yelp.com/${t.locationId}`, sourceHost: "yelp.com", entityMatchState: "consistent" },
                { url: `https://hg.com/${t.locationId}`, sourceHost: "hg.com", entityMatchState: "conflicting" },
              ],
            }
          : { status: "skipped", reason: "no domain" },
      record: async (i) => {
        recorded.push(i);
      },
      runDate: "2026-07-15",
      observedAt: new Date("2026-07-15T00:00:00Z"),
    });
    expect(res.summary.targets).toBe(3);
    expect(res.summary.locationsRecorded).toBe(2);
    expect(res.summary.skipped).toBe(1);
    expect(res.summary.totalConflicts).toBe(2);
    expect(recorded).toHaveLength(2);
    expect(recorded[0].conflictCount).toBe(1);
    expect(recorded[0].sourcesChecked).toBe(2);
  });

  it("isolates a location failure — one throw doesn't abort the run", async () => {
    const recorded: RecordNapObservationInput[] = [];
    const res = await executeNapConsistencyAgent({
      targetProvider: async () => [targets[0], targets[1]],
      runner: async (t) => {
        if (t.locationId === 10) throw new Error("fetch failed");
        return { status: "ok", sources: [] }; // ran, found no external sources
      },
      record: async (i) => {
        recorded.push(i);
      },
      runDate: "2026-07-15",
      observedAt: new Date(),
    });
    expect(res.summary.skipped).toBe(1);
    expect(res.summary.locationsRecorded).toBe(1);
    expect(recorded).toHaveLength(1);
    expect(recorded[0].sourcesChecked).toBe(0); // honest "0 sources checked"
  });

  // §3.2 — Dave review #166: the whole point of the typed unavailable state.
  it("does NOT persist an observation when the provider is unavailable", async () => {
    const recorded: RecordNapObservationInput[] = [];
    const res = await executeNapConsistencyAgent({
      targetProvider: async () => [targets[0]],
      runner: async () => ({
        status: "provider_unavailable",
        reason: "all 4 SerpApi queries failed: ETIMEDOUT",
      }),
      record: async (i) => {
        recorded.push(i);
      },
      runDate: "2026-07-15",
      observedAt: new Date(),
    });
    // No row at all — a failed provider call must never land as sources_checked: 0.
    expect(recorded).toHaveLength(0);
    expect(res.summary.locationsRecorded).toBe(0);
    expect(res.summary.providerUnavailable).toBe(1);
    // ...and it is NOT silently folded into the ordinary no-baseline skip count.
    expect(res.summary.skipped).toBe(0);
  });

  it("distinguishes an honest zero-result from a provider outage", async () => {
    const recorded: RecordNapObservationInput[] = [];
    const res = await executeNapConsistencyAgent({
      targetProvider: async () => [targets[0], targets[1]],
      runner: async (t) =>
        t.locationId === 10
          ? { status: "ok", sources: [] } // real measurement, genuinely nothing found
          : { status: "provider_unavailable", reason: "SERPAPI_API_KEY is not configured" },
      record: async (i) => {
        recorded.push(i);
      },
      runDate: "2026-07-15",
      observedAt: new Date(),
    });
    // Exactly one row: the honest zero. The outage recorded nothing.
    expect(recorded).toHaveLength(1);
    expect(recorded[0].locationId).toBe(10);
    expect(recorded[0].sourcesChecked).toBe(0);
    expect(res.summary.providerUnavailable).toBe(1);
  });
});

/**
 * Proves the WIRING the executor tests stub out: that a real SerpApi transport
 * failure actually becomes the typed `provider_unavailable` state rather than an
 * empty array. Without this, the executor's guard could be correct while nothing
 * ever produced the state that triggers it.
 */
describe("collectExternalEntitySourcesWithStatus — a provider outage is typed, not swallowed (§3.2)", () => {
  // Only the fields this code path reads; cast keeps the fixture honest and small.
  const snapshot = {
    finalUrl: "https://example-dental.com",
    externalLinks: [] as string[],
    identity: { name: "Example Dental", phone: "555-0100", address: "1 Main St" },
    text: "",
    title: null,
  } as unknown as UrlAuditSnapshot;
  const baseline = snapshot.identity;

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.doUnmock("axios");
    vi.resetModules();
  });

  it("returns provider_unavailable (not an empty result) when every SerpApi query fails", async () => {
    vi.resetModules();
    vi.stubEnv("SERPAPI_API_KEY", "test-key");
    vi.doMock("axios", () => ({
      default: { get: vi.fn().mockRejectedValue(new Error("ETIMEDOUT")) },
    }));
    const mod = await import("../services/ai-seo-audit/externalEntitySearchService");

    const result = await mod.collectExternalEntitySourcesWithStatus(snapshot, baseline);

    expect(result.status).toBe("provider_unavailable");
    if (result.status === "provider_unavailable") {
      expect(result.reason).toContain("ETIMEDOUT");
    }
  });

  it("returns provider_unavailable when the API key is absent — we never asked the provider", async () => {
    vi.resetModules();
    vi.stubEnv("SERPAPI_API_KEY", "");
    const mod = await import("../services/ai-seo-audit/externalEntitySearchService");

    const result = await mod.collectExternalEntitySourcesWithStatus(snapshot, baseline);

    expect(result.status).toBe("provider_unavailable");
  });

  it("back-compat: the audit wrapper still returns an array and is unaffected by the status", async () => {
    vi.resetModules();
    vi.stubEnv("SERPAPI_API_KEY", "test-key");
    vi.doMock("axios", () => ({
      default: { get: vi.fn().mockRejectedValue(new Error("ETIMEDOUT")) },
    }));
    const mod = await import("../services/ai-seo-audit/externalEntitySearchService");

    // The audit degrades gracefully by design — it must not throw or change shape.
    await expect(
      mod.collectExternalEntitySources(snapshot, baseline)
    ).resolves.toEqual([]);
  });
});

describe("NapConsistencyObservationModel.listForLocation — tenant scoping (§11.7 / §20.2)", () => {
  type MockQb = {
    where: (arg: Record<string, unknown>) => MockQb;
    orderBy: () => MockQb;
    limit: () => Promise<never[]>;
  };

  it("scopes the read by BOTH organization_id and location_id, so one org cannot read another's rows", async () => {
    // The suite is DB-mocked, so this asserts the query SHAPE — the WHERE clause
    // that enforces isolation. A behavioral real-DB test belongs in
    // integration-tests once this read is wired to a production caller (none yet).
    let whereArg: Record<string, unknown> | undefined;
    const qb: MockQb = {
      where(arg) {
        whereArg = arg;
        return qb;
      },
      orderBy() {
        return qb;
      },
      limit() {
        return Promise.resolve([]);
      },
    };
    const tableSpy = vi
      .spyOn(
        NapConsistencyObservationModel as unknown as { table: (trx?: unknown) => MockQb },
        "table"
      )
      .mockReturnValue(qb);

    await NapConsistencyObservationModel.listForLocation(7, 42);

    // Org 7 querying location 42 is scoped to org 7; org 8's rows at the same
    // location_id are excluded by the organization_id filter.
    expect(whereArg).toEqual({ organization_id: 7, location_id: 42 });
    tableSpy.mockRestore();
  });
});
