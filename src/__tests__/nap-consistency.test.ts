import { describe, it, expect, vi, afterEach } from "vitest";
import { summarizeNapConsistency } from "../services/nap-consistency/summarizer";
import type { UrlAuditSnapshot } from "../services/ai-seo-audit/types";
import {
  executeNapConsistencyAgent,
  dedupeTargetsByLocation,
  NapPersistenceError,
  NapTarget,
} from "../services/nap-consistency/executor";
import {
  NapConsistencyObservationModel,
  RecordNapObservationInput,
} from "../models/NapConsistencyObservationModel";
import { BaseModel } from "../models/BaseModel";

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
        return true;
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
        return true;
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
        return true;
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
        return true;
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

  // §3.2 — Dave review #166 (round 2, item 1): partial coverage is not a
  // finished measurement and must not reach the time series.
  it("does NOT persist an observation when provider coverage is only partial", async () => {
    const recorded: RecordNapObservationInput[] = [];
    const res = await executeNapConsistencyAgent({
      targetProvider: async () => [targets[0]],
      runner: async () => ({
        status: "partial_coverage",
        reason: "3 of 4 SerpApi queries failed: ETIMEDOUT",
        attempted: 4,
        failed: 3,
      }),
      record: async (i) => {
        recorded.push(i);
        return true;
      },
      runDate: "2026-07-16",
      observedAt: new Date(),
    });
    // The exact defect Dave named: one empty response + three timeouts must not
    // land as a completed zero.
    expect(recorded).toHaveLength(0);
    expect(res.summary.locationsRecorded).toBe(0);
    expect(res.summary.partialCoverage).toBe(1);
    // ...and it is folded into NEITHER the no-baseline skip count NOR the outage count.
    expect(res.summary.skipped).toBe(0);
    expect(res.summary.providerUnavailable).toBe(0);
  });

  it("keeps partial coverage distinct from a complete zero and a total outage", async () => {
    const recorded: RecordNapObservationInput[] = [];
    const res = await executeNapConsistencyAgent({
      targetProvider: async () => [
        { organizationId: 1, locationId: 10, domain: "a.com" },
        { organizationId: 1, locationId: 11, domain: "b.com" },
        { organizationId: 1, locationId: 12, domain: "c.com" },
      ],
      runner: async (t) => {
        if (t.locationId === 10) return { status: "ok", sources: [] };
        if (t.locationId === 11)
          return {
            status: "partial_coverage",
            reason: "1 of 4 failed",
            attempted: 4,
            failed: 1,
          };
        return { status: "provider_unavailable", reason: "all 4 failed" };
      },
      record: async (i) => {
        recorded.push(i);
        return true;
      },
      runDate: "2026-07-16",
      observedAt: new Date(),
    });
    // Only the complete zero is data. The other two are absences of data, of
    // two different kinds, counted separately.
    expect(recorded).toHaveLength(1);
    expect(recorded[0].locationId).toBe(10);
    expect(res.summary.locationsRecorded).toBe(1);
    expect(res.summary.partialCoverage).toBe(1);
    expect(res.summary.providerUnavailable).toBe(1);
  });

  // §3.2 — Dave review #166 (round 2, item 2): a dropped write is not a skip.
  it("FAILS the run when a write is rejected — a persistence failure is not a skip", async () => {
    await expect(
      executeNapConsistencyAgent({
        targetProvider: async () => [targets[0]],
        runner: async () => ({ status: "ok", sources: [] }),
        record: async () => {
          throw new Error("deadlock detected");
        },
        runDate: "2026-07-16",
        observedAt: new Date(),
      })
    ).rejects.toThrow(NapPersistenceError);
  });

  it("attempts every location before failing, and reports what did land", async () => {
    const recorded: RecordNapObservationInput[] = [];
    let error: NapPersistenceError | null = null;
    try {
      await executeNapConsistencyAgent({
        targetProvider: async () => [targets[0], targets[1], targets[2]],
        runner: async (t) =>
          t.domain
            ? { status: "ok", sources: [] }
            : { status: "skipped", reason: "no domain" },
        record: async (i) => {
          // Location 10's write fails; location 11's must still be attempted.
          if (i.locationId === 10) throw new Error("connection terminated");
          recorded.push(i);
          return true;
        },
        runDate: "2026-07-16",
        observedAt: new Date(),
      });
    } catch (err) {
      error = err as NapPersistenceError;
    }
    // The run failed visibly...
    expect(error).toBeInstanceOf(NapPersistenceError);
    expect(error?.code).toBe("NAP_PERSISTENCE_FAILED");
    expect(error?.failedLocationIds).toEqual([10]);
    // ...but one bad write did not cost the other location its observation.
    expect(recorded.map((r) => r.locationId)).toEqual([11]);
    expect(error?.summary.persistenceFailures).toBe(1);
    expect(error?.summary.locationsRecorded).toBe(1);
    expect(error?.summary.skipped).toBe(1);
  });

  // Dave review #166 (round 2, item 3): the metric must mean what it says.
  it("counts locationsRecorded only when a row was ACTUALLY inserted", async () => {
    const res = await executeNapConsistencyAgent({
      targetProvider: async () => [targets[0], targets[1]],
      runner: async () => ({
        status: "ok",
        sources: [
          { url: "https://hg.com/x", sourceHost: "hg.com", entityMatchState: "conflicting" },
        ],
      }),
      // Location 10 inserts; location 11 already has a row for this run day, so
      // the model ignores the write and returns false.
      record: async (i) => i.locationId === 10,
      runDate: "2026-07-16",
      observedAt: new Date(),
    });
    expect(res.summary.locationsRecorded).toBe(1);
    expect(res.summary.locationsAlreadyRecorded).toBe(1);
    // The ignored write contributed no row, so it contributes no conflicts —
    // otherwise the run would report conflicts from rows it did not write.
    expect(res.summary.totalConflicts).toBe(1);
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

  // §3.2 — Dave review #166 (round 2, item 1). These are the mixed
  // success/failure cases: the provider ANSWERED, just not completely.
  it("returns partial_coverage with attempted/failed counts when SOME queries fail", async () => {
    vi.resetModules();
    vi.stubEnv("SERPAPI_API_KEY", "test-key");
    let call = 0;
    vi.doMock("axios", () => ({
      default: {
        get: vi.fn().mockImplementation(() => {
          call++;
          // First query answers with an empty organic list; the rest time out.
          // This is Dave's exact scenario: "one empty response plus three
          // timeouts can persist a completed zero".
          if (call === 1) return Promise.resolve({ data: { organic_results: [] } });
          return Promise.reject(new Error("ETIMEDOUT"));
        }),
      },
    }));
    const mod = await import("../services/ai-seo-audit/externalEntitySearchService");

    const result = await mod.collectExternalEntitySourcesWithStatus(snapshot, baseline);

    // NOT "ok" — the zero here is not a finished measurement.
    expect(result.status).toBe("partial_coverage");
    if (result.status === "partial_coverage") {
      expect(result.attempted).toBe(4);
      expect(result.failed).toBe(3);
      expect(result.reason).toContain("ETIMEDOUT");
    }
  });

  it("returns partial_coverage when ONE query succeeds with hits — the count is knowably short", async () => {
    vi.resetModules();
    vi.stubEnv("SERPAPI_API_KEY", "test-key");
    let call = 0;
    vi.doMock("axios", () => ({
      default: {
        get: vi.fn().mockImplementation((url: string) => {
          // The candidate fetch (a non-SerpApi URL) must not count as a query.
          if (!url.includes("serpapi.com")) {
            return Promise.reject(new Error("candidate fetch blocked"));
          }
          call++;
          if (call === 1) {
            return Promise.resolve({
              data: { organic_results: [{ link: "https://yelp.com/biz/x", title: "X" }] },
            });
          }
          return Promise.reject(new Error("ETIMEDOUT"));
        }),
      },
    }));
    const mod = await import("../services/ai-seo-audit/externalEntitySearchService");

    const result = await mod.collectExternalEntitySourcesWithStatus(snapshot, baseline);

    // Dave: "one successful query can persist an unlabeled partial conflict
    // count". The sources are real and still returned for display — but the
    // status labels them incomplete so the monitor will not persist them.
    expect(result.status).toBe("partial_coverage");
    if (result.status === "partial_coverage") {
      expect(result.failed).toBeGreaterThan(0);
      expect(result.attempted).toBeGreaterThan(result.failed);
      expect(result.sources.length).toBeGreaterThan(0);
    }
  });

  it("returns ok only when EVERY query answered — a complete zero stays recordable", async () => {
    vi.resetModules();
    vi.stubEnv("SERPAPI_API_KEY", "test-key");
    vi.doMock("axios", () => ({
      default: {
        get: vi.fn().mockResolvedValue({ data: { organic_results: [] } }),
      },
    }));
    const mod = await import("../services/ai-seo-audit/externalEntitySearchService");

    const result = await mod.collectExternalEntitySourcesWithStatus(snapshot, baseline);

    // Every query ran and found nothing: an honest zero, and the ONLY zero the
    // monitor is allowed to write.
    expect(result.status).toBe("ok");
    expect(result.sources).toEqual([]);
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

/**
 * Model-level proofs (§20.1: every model has tests). The executor suite above
 * injects a `record` seam, so without these the model itself — including the
 * `onConflict(...).ignore()` idempotency the whole "a log, not a score" design
 * leans on — would never be exercised by anything.
 *
 * HONEST LIMIT (applies to every test in this block): there is no live database
 * here. These drive the model against an in-memory fake that applies the WHERE
 * clause and the conflict target itself, so they prove the model's OWN logic —
 * the filter it builds and the contract it returns. They do NOT prove Postgres
 * semantics, and would not catch a BaseModel-level bug that drops the WHERE.
 * The real-DB behavioural proof is the pending item in test-results.json.
 */
describe("NapConsistencyObservationModel.record — idempotency contract (§20.1)", () => {
  type RecordedCall = {
    payload: Record<string, unknown>;
    conflictTarget?: string[];
    ignored: boolean;
    returned?: string;
  };

  /** A fake insert chain that records what the model built and returns rows per
   * the `existingKeys` set — i.e. it simulates ON CONFLICT DO NOTHING. */
  const fakeInsertChain = (existingKeys: Set<string>, call: RecordedCall) => {
    const chain = {
      insert(payload: Record<string, unknown>) {
        call.payload = payload;
        return chain;
      },
      onConflict(target: string[]) {
        call.conflictTarget = target;
        return chain;
      },
      ignore() {
        call.ignored = true;
        return chain;
      },
      returning(col: string) {
        call.returned = col;
        const key = `${call.payload.location_id}|${call.payload.run_date}`;
        // DO NOTHING → zero rows returned. A fresh key → one row.
        return Promise.resolve(existingKeys.has(key) ? [] : [{ id: "row-1" }]);
      },
    };
    return chain;
  };

  const input: RecordNapObservationInput = {
    organizationId: 7,
    locationId: 42,
    runDate: "2026-07-16",
    sourcesChecked: 3,
    consistentCount: 2,
    conflictCount: 1,
    conflicts: [{ source: "https://hg.com/x" }],
    observedAt: new Date("2026-07-16T00:00:00Z"),
  };

  it("inserts on a fresh (location, run_date) and reports TRUE — a row landed", async () => {
    const call = {} as RecordedCall;
    const spy = vi
      .spyOn(
        NapConsistencyObservationModel as unknown as { table: (trx?: unknown) => unknown },
        "table"
      )
      .mockReturnValue(fakeInsertChain(new Set(), call));

    const inserted = await NapConsistencyObservationModel.record(input);

    expect(inserted).toBe(true);
    // The idempotency key the whole design leans on.
    expect(call.conflictTarget).toEqual(["location_id", "run_date"]);
    expect(call.ignored).toBe(true);
    expect(call.returned).toBe("id");
    // Tenant column is persisted, so the scoped read below has something to filter on.
    expect(call.payload.organization_id).toBe(7);
    expect(call.payload.conflicts).toBe(JSON.stringify(input.conflicts));
    spy.mockRestore();
  });

  it("reports FALSE when the same run day is written twice — the write was ignored", async () => {
    const call = {} as RecordedCall;
    // This (location, run_date) already has a row: ON CONFLICT DO NOTHING.
    const existing = new Set(["42|2026-07-16"]);
    const spy = vi
      .spyOn(
        NapConsistencyObservationModel as unknown as { table: (trx?: unknown) => unknown },
        "table"
      )
      .mockReturnValue(fakeInsertChain(existing, call));

    const inserted = await NapConsistencyObservationModel.record(input);

    // Dave review #166 (round 2, item 3): the executor counts on this boolean —
    // if it lied, locationsRecorded would report rows that do not exist.
    expect(inserted).toBe(false);
    spy.mockRestore();
  });
});

describe("NapConsistencyObservationModel.listForLocation — tenant isolation (§11.7 / §20.2)", () => {
  /** Rows for TWO tenants that share a location_id — the exact collision the
   * organization_id filter exists to defend against. */
  const allRows = [
    {
      id: "a",
      organization_id: 7,
      location_id: 42,
      conflicts: [{ source: "org7-listing" }],
      observed_at: new Date("2026-07-16T00:00:00Z"),
    },
    {
      id: "b",
      organization_id: 8,
      location_id: 42,
      conflicts: [{ source: "org8-listing" }],
      observed_at: new Date("2026-07-16T00:00:00Z"),
    },
  ];

  /** A fake that APPLIES the where-clause, so this is a behavioural check of the
   * model's filter rather than a restatement of the code. */
  const fakeSelectChain = (rows: Record<string, unknown>[], capture: { where?: Record<string, unknown> }) => {
    let filtered = rows;
    const chain = {
      where(arg: Record<string, unknown>) {
        capture.where = arg;
        filtered = filtered.filter((r) => Object.entries(arg).every(([k, v]) => r[k] === v));
        return chain;
      },
      orderBy() {
        return chain;
      },
      limit() {
        return Promise.resolve(filtered);
      },
    };
    return chain;
  };

  it("returns ONLY the caller's org rows when two tenants share a location_id (§20.2)", async () => {
    const capture: { where?: Record<string, unknown> } = {};
    const spy = vi
      .spyOn(
        NapConsistencyObservationModel as unknown as { table: (trx?: unknown) => unknown },
        "table"
      )
      .mockReturnValue(fakeSelectChain(allRows, capture));

    const rows = await NapConsistencyObservationModel.listForLocation(7, 42);

    // Org 8 also has a row at location 42. It must not appear.
    expect(rows).toHaveLength(1);
    expect(rows[0].organization_id).toBe(7);
    expect(rows.some((r) => r.organization_id === 8)).toBe(false);
    expect(capture.where).toEqual({ organization_id: 7, location_id: 42 });
    spy.mockRestore();
  });

  it("the OTHER tenant reads its own row at the same location_id — isolation cuts both ways", async () => {
    const capture: { where?: Record<string, unknown> } = {};
    const spy = vi
      .spyOn(
        NapConsistencyObservationModel as unknown as { table: (trx?: unknown) => unknown },
        "table"
      )
      .mockReturnValue(fakeSelectChain(allRows, capture));

    const rows = await NapConsistencyObservationModel.listForLocation(8, 42);

    // Proves the filter is really keyed on the passed org, not a constant that
    // happens to match the first assertion.
    expect(rows).toHaveLength(1);
    expect(rows[0].organization_id).toBe(8);
    spy.mockRestore();
  });

  it("an org that owns no row at that location reads nothing — not another org's row", async () => {
    const capture: { where?: Record<string, unknown> } = {};
    const spy = vi
      .spyOn(
        NapConsistencyObservationModel as unknown as { table: (trx?: unknown) => unknown },
        "table"
      )
      .mockReturnValue(fakeSelectChain(allRows, capture));

    const rows = await NapConsistencyObservationModel.listForLocation(9, 42);

    // A guessed/reused location_id yields an empty read, never a leak.
    expect(rows).toEqual([]);
    spy.mockRestore();
  });
});

/**
 * Dave review #166 (round 3): the SEALED unscoped surface (§11.7 / §5.5 / §20.2).
 *
 * `listForLocation` being tenant-scoped is worth nothing if a caller can reach
 * the same rows through an inherited `BaseModel` method that carries no
 * organization predicate. These prove the seals BEHAVIOURALLY, to the same bar
 * as the isolation block above — §20.2: "proven here, not assumed".
 *
 * The non-vacuousness argument is built into the block itself: `UnsealedControl`
 * is the same table with the seals REMOVED. Each test first shows that the
 * unsealed inheritance really does hand back another tenant's row (the hole is
 * real, not hypothetical), then shows the sealed model refuses. If a seal were
 * deleted, the paired assertion flips from "throws" to "returns org 8's row".
 */
describe("NapConsistencyObservationModel — sealed unscoped surface (§11.7 / §20.2)", () => {
  /** Two tenants, one shared location_id — the collision the scope defends. */
  const allRows = [
    { id: "row-org7", organization_id: 7, location_id: 42, run_date: "2026-07-16" },
    { id: "row-org8", organization_id: 8, location_id: 42, run_date: "2026-07-16" },
  ];

  /** A fake that APPLIES the where-clause, so a leak shows up as real data. */
  const fakeChain = (rows: Record<string, unknown>[]) => {
    let filtered = rows;
    const chain = {
      where(arg: Record<string, unknown>) {
        filtered = filtered.filter((r) =>
          Object.entries(arg).every(([k, v]) => r[k] === v)
        );
        return chain;
      },
      first: () => Promise.resolve(filtered[0]),
      then: (res: (v: unknown) => unknown) => Promise.resolve(filtered).then(res),
      update: () => Promise.resolve(filtered.length),
      del: () => Promise.resolve(filtered.length),
      orderBy: () => chain,
      limit: () => Promise.resolve(filtered),
    };
    return chain;
  };

  /**
   * The CONTROL: the same tenant table with NO seals — i.e. exactly what
   * `NapConsistencyObservationModel` would be if the seals were reverted.
   * Its job is to demonstrate that the inherited methods are genuinely unscoped,
   * so the sealed assertions below are not vacuous.
   */
  class UnsealedControl extends BaseModel {
    protected static tableName = "nap_consistency_observation";
  }

  afterEach(() => vi.restoreAllMocks());

  const mockTable = (target: unknown) =>
    vi
      .spyOn(target as { table: (trx?: unknown) => unknown }, "table")
      .mockImplementation(() => fakeChain(allRows));

  it("CONTROL: unsealed inheritance really does leak org 8's row by id — the hole is real", async () => {
    mockTable(UnsealedControl);

    // Org 7 is the caller; it asks for a row id that belongs to org 8.
    const leaked = await UnsealedControl.findById("row-org8");

    // No organization predicate anywhere: the row comes back. This is the
    // vulnerability the seals close — proven, not asserted.
    expect(leaked).toBeDefined();
    expect(leaked.organization_id).toBe(8);
  });

  it("findById is sealed — the same call that leaked above now throws (§11.7)", async () => {
    mockTable(NapConsistencyObservationModel);

    // Cast mirrors an untyped/JS caller: TS callers get TS2554 at compile time
    // (proven separately below). Nothing is returned — the seal fires before
    // any query is built.
    await expect(
      (NapConsistencyObservationModel as unknown as { findById: (id: string) => Promise<unknown> })
        .findById("row-org8")
    ).rejects.toThrow(/findById is unscoped and disabled/);
  });

  it("CONTROL: unsealed findOne leaks by condition, findMany leaks EVERY tenant", async () => {
    mockTable(UnsealedControl);
    const one = await UnsealedControl.findOne({ location_id: 42 });
    expect(one.organization_id).toBe(7); // whichever matched first — not the caller's choice

    mockTable(UnsealedControl);
    const many = await UnsealedControl.findMany({ location_id: 42 });
    // Both tenants' rows in one read.
    expect(many).toHaveLength(2);
    expect(many.map((r: { organization_id: number }) => r.organization_id).sort()).toEqual([7, 8]);
  });

  it("findOne and findMany are sealed — no cross-tenant read survives (§11.7)", async () => {
    mockTable(NapConsistencyObservationModel);
    await expect(
      (NapConsistencyObservationModel as unknown as { findOne: (c: unknown) => Promise<unknown> })
        .findOne({ location_id: 42 })
    ).rejects.toThrow(/findOne is unscoped and disabled/);

    await expect(
      (NapConsistencyObservationModel as unknown as { findMany: (c: unknown) => Promise<unknown> })
        .findMany({})
    ).rejects.toThrow(/findMany is unscoped and disabled/);
  });

  it("CONTROL: unsealed updateById/deleteById really do mutate another tenant's row", async () => {
    mockTable(UnsealedControl);
    // Matches org 8's row with no organization predicate — a cross-tenant write.
    expect(await UnsealedControl.updateById("row-org8", { conflict_count: 99 })).toBe(1);

    mockTable(UnsealedControl);
    expect(await UnsealedControl.deleteById("row-org8")).toBe(1);
  });

  it("the write surface is sealed — create, createReturningId, updateById, deleteById (§11.7)", async () => {
    mockTable(NapConsistencyObservationModel);
    const m = NapConsistencyObservationModel as unknown as Record<
      string,
      (...a: unknown[]) => Promise<unknown>
    >;

    // create/createReturningId would also skip the (location_id, run_date)
    // conflict target that record()'s idempotency contract depends on.
    await expect(m.create({ organization_id: 8 })).rejects.toThrow(
      /create bypasses the tenant scope and the per-\(location, run_date\) idempotency contract/
    );
    await expect(m.createReturningId({ organization_id: 8 })).rejects.toThrow(
      /createReturningId bypasses the tenant scope/
    );
    await expect(m.updateById("row-org8", { conflict_count: 99 })).rejects.toThrow(
      /updateById is unscoped and disabled/
    );
    await expect(m.deleteById("row-org8")).rejects.toThrow(
      /deleteById is unscoped and disabled/
    );
  });

  it("paginate and count are sealed — no paged read, no cross-tenant size leak (§11.7)", async () => {
    mockTable(NapConsistencyObservationModel);
    const m = NapConsistencyObservationModel as unknown as Record<
      string,
      (...a: unknown[]) => Promise<unknown>
    >;

    await expect(m.paginate((qb: unknown) => qb, {})).rejects.toThrow(
      /paginate is unscoped and disabled/
    );

    // count() is the RUNTIME-only seal (all-optional args ⇒ TS2554 can't fire).
    // Called exactly as a TS caller legally would — bare, no cast needed.
    await expect(NapConsistencyObservationModel.count()).rejects.toThrow(
      /count is unscoped and disabled/
    );
  });

  it("record and listForLocation still work — the seals did not brick the model", async () => {
    // Guards against a seal that "passes" by breaking the real path: the two
    // sanctioned entry points must remain callable.
    expect(typeof NapConsistencyObservationModel.record).toBe("function");
    expect(typeof NapConsistencyObservationModel.listForLocation).toBe("function");
    mockTable(NapConsistencyObservationModel);
    const rows = await NapConsistencyObservationModel.listForLocation(7, 42);
    expect(rows).toHaveLength(1);
    expect(rows[0].organization_id).toBe(7);
  });

  /**
   * THE CLASS-LEVEL GUARD (§11.7). Every test above names one method — which is
   * the "fix the instance" trap. This one fixes the CLASS: it enumerates
   * `BaseModel`'s public static surface at runtime and asserts that each member
   * is either sealed on this model or explicitly, reasonedly exempt.
   *
   * If someone adds a new unscoped read/write to `BaseModel`, this test FAILS on
   * the NAP model until that method is sealed or consciously exempted — the
   * enumeration stops being a one-time act of diligence and becomes a check.
   */
  it("CLASS GUARD: every table-touching BaseModel public static is sealed here (§11.7)", () => {
    // TS `protected` is erased at runtime, so the internals are listed explicitly.
    const PROTECTED_OR_INTERNAL = new Set([
      "length", "name", "prototype", "tableName", "jsonFields",
      "table", "parseJson", "toJson", "serializeJsonFields", "deserializeJsonFields",
    ]);

    /**
     * Reasoned exemptions — NOT oversights. Neither touches this table; both
     * return a transaction handle. Sealing them would be theater (the same
     * handle is one `AnyOtherModel.transaction()` away) and would break the
     * §6.1 pattern that `record(input, trx?)` / `listForLocation(…, trx?)` rely
     * on. See the class docblock for the full reasoning and residual.
     */
    const REASONED_EXEMPTIONS = new Set(["transaction", "beginTransaction"]);

    const publicStatics = Object.getOwnPropertyNames(BaseModel).filter(
      (k) =>
        !PROTECTED_OR_INTERNAL.has(k) &&
        typeof (BaseModel as unknown as Record<string, unknown>)[k] === "function"
    );

    // Sanity: the enumeration must actually find the surface. If BaseModel is
    // refactored such that this comes back empty, the guard would pass
    // vacuously — so assert it found the 11 we reviewed.
    expect(publicStatics.length).toBe(11);

    const unsealed = publicStatics.filter((method) => {
      if (REASONED_EXEMPTIONS.has(method)) return false;
      // Sealed == overridden as an OWN property of this model.
      return !Object.prototype.hasOwnProperty.call(
        NapConsistencyObservationModel,
        method
      );
    });

    expect(unsealed).toEqual([]);
  });

  /**
   * COMPILE-TIME seal proof (§11.7). Each `@ts-expect-error` below asserts the
   * call on the next line does NOT type-check. This is self-invalidating: if a
   * seal is removed, the call starts compiling, the directive becomes unused,
   * and `tsc --noEmit` FAILS with TS2578 ("Unused '@ts-expect-error'"). So the
   * compile-time guarantee is enforced by CI, not by a comment claiming it.
   *
   * `count` is absent on purpose — it is the runtime-only seal (all-optional
   * args), covered by the runtime test above. Adding a directive for it here
   * would itself fail to compile, which is the honest tell.
   */
  it("COMPILE GUARD: sealed methods reject their real call signatures (TS2554)", () => {
    const calls = [
      // @ts-expect-error §11.7 findById(id) must not type-check — seal is compile-time.
      () => NapConsistencyObservationModel.findById("row-org8"),
      // @ts-expect-error §11.7 findOne(conditions) must not type-check.
      () => NapConsistencyObservationModel.findOne({ location_id: 42 }),
      // @ts-expect-error §11.7 findMany(conditions) must not type-check.
      () => NapConsistencyObservationModel.findMany({}),
      // @ts-expect-error §11.7 create(data) must not type-check.
      () => NapConsistencyObservationModel.create({ organization_id: 8 }),
      // @ts-expect-error §11.7 createReturningId(data) must not type-check.
      () => NapConsistencyObservationModel.createReturningId({ organization_id: 8 }),
      // @ts-expect-error §11.7 updateById(id, data) must not type-check.
      () => NapConsistencyObservationModel.updateById("row-org8", { conflict_count: 99 }),
      // @ts-expect-error §11.7 deleteById(id) must not type-check.
      () => NapConsistencyObservationModel.deleteById("row-org8"),
      // @ts-expect-error §11.7 paginate(buildQuery, params) must not type-check.
      () => NapConsistencyObservationModel.paginate((qb) => qb, {}),
    ];
    // The proof is the directives above surviving `tsc`; this keeps the block
    // executable (and unreferenced-variable-free) without invoking the seals.
    expect(calls).toHaveLength(8);
  });
});
