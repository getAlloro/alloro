import { describe, it, expect, vi, beforeEach } from "vitest";
import type { OrganizationAuditContext } from "../services/ai-seo-audit/types";

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
    createTarget.mockImplementation(async (input: Record<string, unknown>) => ({
      ...input,
      id: "target-1",
    }));
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

  it("passes the matching location's live GBP profile to the checker", async () => {
    const executeTargets = await importExecuteTargets();
    const organizationContext = organizationContextFixture([
      locationContextFixture(11, "First", {
        profile: { primaryCategory: "Orthodontist" },
      }),
      locationContextFixture(22, "Second", {
        profile: {
          primaryCategory: "Dentist",
          additionalCategories: ["Cosmetic Dentist"],
          websiteUri: "https://second.example",
          phoneNumber: "+1-512-555-0100",
          hasHours: true,
          storefrontAddress: {
            addressLines: ["22 Second St"],
            locality: "Austin",
            administrativeArea: "TX",
            postalCode: "78701",
          },
        },
      }),
    ]);

    await executeTargets(
      "run-1",
      [{ ...TARGET_INPUT, location_id: 22 }],
      organizationContext,
      null,
    );

    expect(runGetFoundChecker).toHaveBeenCalledWith({
      url: "https://example.com/final",
      html: SNAPSHOT_HTML,
      gbpCompleteness: expect.objectContaining({
        primaryCategory: "Dentist",
        categories: ["Dentist", "Cosmetic Dentist"],
        website: "https://second.example",
        phone: "+1-512-555-0100",
        address: "22 Second St, Austin, TX, 78701",
        hasHours: true,
      }),
    });
    const checkerInput = runGetFoundChecker.mock.calls[0][0];
    expect(checkerInput.gbpCompleteness.primaryCategory).not.toBe("Orthodontist");
    expect(checkerInput.gbpCompleteness.gradableFields).not.toContain("photos");
  });

  it("does not borrow a GBP profile for an unmapped multi-location page", async () => {
    const executeTargets = await importExecuteTargets();
    const organizationContext = organizationContextFixture([
      locationContextFixture(11, "First", {
        profile: { primaryCategory: "Orthodontist" },
      }),
      locationContextFixture(22, "Second", {
        profile: { primaryCategory: "Dentist" },
      }),
    ]);

    await executeTargets("run-1", [TARGET_INPUT], organizationContext, null);

    expect(runGetFoundChecker).toHaveBeenCalledWith({
      url: "https://example.com/final",
      html: SNAPSHOT_HTML,
    });
  });

  it("uses the only location for an unmapped single-location page", async () => {
    const executeTargets = await importExecuteTargets();
    const organizationContext = organizationContextFixture([
      locationContextFixture(11, "Only", {
        profile: { primaryCategory: "Orthodontist" },
      }),
    ]);

    await executeTargets("run-1", [TARGET_INPUT], organizationContext, null);

    expect(runGetFoundChecker).toHaveBeenCalledWith({
      url: "https://example.com/final",
      html: SNAPSHOT_HTML,
      gbpCompleteness: expect.objectContaining({
        primaryCategory: "Orthodontist",
      }),
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

function locationContextFixture(
  id: number,
  name: string,
  gbpData: Record<string, unknown> | null,
): OrganizationAuditContext["locations"][number] {
  return {
    id,
    name,
    domain: null,
    businessData: null,
    googlePropertyCount: gbpData ? 1 : 0,
    selectedGoogleProperty: null,
    gbpData,
    gbpError: null,
  };
}

function organizationContextFixture(
  locations: OrganizationAuditContext["locations"],
): OrganizationAuditContext {
  return {
    organizationId: 1,
    organizationName: "Example",
    projectId: "project-1",
    projectUrl: "https://example.com",
    projectIdentity: { name: "Example" },
    locations,
    gsc: {
      hasActiveIntegration: false,
      latestReportDate: null,
      rowsForUrls: {},
      error: null,
    },
    pages: [],
    totalPublishedPages: 0,
  };
}
