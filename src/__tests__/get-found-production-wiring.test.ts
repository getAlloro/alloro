import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Locks the Slice 1a production integration point.
 *
 * The first implementation shipped `runGetFoundChecker()` with NO caller
 * outside the test suite, so the checker and its observability hook never ran
 * in the application. This proves the real per-page audit path invokes it on
 * the snapshot it already fetched, and that an advisory failure can never fail
 * a real audit run.
 */

const runGetFoundChecker = vi.fn();
const scoreAuditTarget = vi.fn();
const collectUrlAuditSnapshot = vi.fn();
const createTarget = vi.fn();
const updateTarget = vi.fn();
const persistResults = vi.fn();
const getAuditRunDetail = vi.fn();

vi.mock("../services/ai-seo-audit/getFoundChecker", () => ({
  runGetFoundChecker: (...args: unknown[]) => runGetFoundChecker(...args),
}));

vi.mock("../models/website-builder/AiSeoAuditTargetModel", () => ({
  AiSeoAuditTargetModel: {
    createTarget: (...args: unknown[]) => createTarget(...args),
    updateTarget: (...args: unknown[]) => updateTarget(...args),
    transaction: async (fn: (trx: unknown) => Promise<unknown>) => fn({}),
  },
}));

vi.mock("../services/ai-seo-audit/urlCollectorService", () => ({
  collectUrlAuditSnapshot: (...args: unknown[]) => collectUrlAuditSnapshot(...args),
}));

vi.mock("../services/ai-seo-audit/externalEntitySearchService", () => ({
  collectExternalEntitySources: vi.fn(async () => []),
}));

vi.mock("../services/ai-seo-audit/scoringEngine", () => ({
  scoreAuditTarget: (...args: unknown[]) => scoreAuditTarget(...args),
  AI_SEO_RULE_VERSION: "test",
}));

vi.mock("../services/ai-seo-audit/auditPersistenceService", () => ({
  persistResults: (...args: unknown[]) => persistResults(...args),
  persistExternalSources: vi.fn(async () => undefined),
  getAuditRunDetail: (...args: unknown[]) => getAuditRunDetail(...args),
}));

const SNAPSHOT_HTML =
  "<!doctype html><html><body><h1>Are you open today?</h1><p>Yes.</p></body></html>";

function snapshotFixture() {
  return {
    requestedUrl: "https://example.com/",
    finalUrl: "https://example.com/final",
    finalStatus: 200,
    ok: true,
    headers: {},
    html: SNAPSHOT_HTML,
    text: "Are you open today? Yes.",
    title: "Example",
    metaDescription: null,
    canonicalUrl: null,
    metaRobots: null,
    robotsTxtStatus: null,
    robotsTxt: null,
    isBlockedByRobots: false,
    sitemapUrls: [],
    isInSitemap: null,
    schemaTypes: [],
    schemaItems: [],
    internalLinks: [],
    externalLinks: [],
    identity: { name: "Example" },
  };
}

const TARGET_INPUT = {
  target_type: "page" as const,
  page_id: "page-1",
  location_id: null,
  url: "https://example.com/",
  label: "Home",
  mapping_confidence: null,
  metadata: {},
};

async function importExecuteTargets() {
  const mod = await import("../services/ai-seo-audit/auditTargetExecutionService");
  return mod.executeTargets;
}

describe("get-found checker — production integration point", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createTarget.mockResolvedValue({ id: "target-1", url: "https://example.com/", metadata: {} });
    collectUrlAuditSnapshot.mockResolvedValue(snapshotFixture());
    scoreAuditTarget.mockReturnValue({
      summary: { score: 80, dataCoverage: 100, confidence: "high", hardCaps: [], categories: [] },
      results: [],
    });
    getAuditRunDetail.mockResolvedValue({
      run: { hard_caps: [] },
      results: [],
      targets: [],
    });
  });

  it("runs the checker on every fetched page, reusing the audit's own snapshot", async () => {
    const executeTargets = await importExecuteTargets();
    await executeTargets("run-1", [TARGET_INPUT], null, null);

    expect(runGetFoundChecker).toHaveBeenCalledTimes(1);
    // Reuses the already-fetched snapshot — no second network request.
    expect(runGetFoundChecker).toHaveBeenCalledWith({
      url: "https://example.com/final",
      html: SNAPSHOT_HTML,
    });
  });

  it("skips the checker for a page that could not be fetched", async () => {
    collectUrlAuditSnapshot.mockRejectedValue(new Error("fetch failed"));
    const executeTargets = await importExecuteTargets();
    await executeTargets("run-1", [TARGET_INPUT], null, null);

    expect(runGetFoundChecker).not.toHaveBeenCalled();
  });

  it("never fails the audit run when the advisory checker throws", async () => {
    runGetFoundChecker.mockImplementation(() => {
      throw new Error("lint exploded");
    });
    const executeTargets = await importExecuteTargets();

    await expect(
      executeTargets("run-1", [TARGET_INPUT], null, null),
    ).resolves.toBeDefined();
    // The audit still scored and persisted the page.
    expect(scoreAuditTarget).toHaveBeenCalledTimes(1);
    expect(persistResults).toHaveBeenCalledTimes(1);
  });
});
