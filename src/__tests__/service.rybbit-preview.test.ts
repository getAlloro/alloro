import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * B1 — Instrument the hosted/preview site.
 *
 * Tests provisionPreviewAnalytics: the gated, on-demand, per-project Rybbit
 * provisioning for preview (*.sites.getalloro.com) sites. The real
 * provisionRybbitSite path runs underneath (models + fetch are the only mocks),
 * so these prove the actual reuse, not a re-implementation.
 *
 * Guardrails proven here (the adversary's target class):
 *  - No live beacon: global.fetch is stubbed; a test run never hits Rybbit.
 *  - No PII: the only thing sent to Rybbit is the preview DOMAIN.
 *  - Per-tenant isolation: each project gets its OWN siteId; one project's row
 *    is never mutated by another's provisioning.
 *  - Ships DISABLED: the gate off provisions nothing.
 */

// In-memory model state so the real provisionRybbitSite path can read-back what
// it wrote (mirrors DB round-trips without a database).
const rybbitSiteIdByProject = new Map<string, string | null>();
const integrationByProject = new Map<
  string,
  { id: string; project_id: string; metadata?: { siteId?: string } }
>();

const findPreviewProvisioningContextById = vi.fn<
  (projectId: string) => Promise<
    | {
        id: string;
        hostname: string | null;
        generated_hostname: string | null;
        custom_domain: string | null;
        status: string | null;
        archived_at: Date | null;
      }
    | undefined
  >
>();

const findRybbitSiteIdById = vi.fn(async (projectId: string) => ({
  rybbit_site_id: rybbitSiteIdByProject.get(projectId) ?? null,
}));

const updateRybbitSiteId = vi.fn(
  async (projectId: string, siteId: string | null) => {
    rybbitSiteIdByProject.set(projectId, siteId);
    return 1;
  },
);

const findByProjectAndPlatform = vi.fn(async (projectId: string) =>
  integrationByProject.get(projectId),
);

const createIntegration = vi.fn(
  async (row: { project_id: string; metadata?: { siteId?: string } }) => {
    const created = { id: `int-${row.project_id}`, ...row };
    integrationByProject.set(row.project_id, created);
    return created;
  },
);

const updateIntegration = vi.fn(async () => ({}));

vi.mock("../models/website-builder/ProjectModel", () => ({
  ProjectModel: {
    findPreviewProvisioningContextById,
    findRybbitSiteIdById,
    updateRybbitSiteId,
  },
}));

vi.mock("../models/website-builder/WebsiteIntegrationModel", () => ({
  WebsiteIntegrationModel: {
    findByProjectAndPlatform,
    create: createIntegration,
    update: updateIntegration,
  },
}));

vi.mock("../lib/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// Rybbit's site-create endpoint is stubbed so no test ever creates a real site.
// The stub echoes a siteId derived from the requested domain, so distinct
// preview hostnames deterministically get distinct siteIds.
const fetchMock = vi.fn(
  async (_url: string, opts: { body: string }) => {
    const body = JSON.parse(opts.body) as { domain: string };
    return {
      ok: true,
      status: 200,
      json: async () => ({ siteId: `site-${body.domain}` }),
      text: async () => "",
    };
  },
);

async function loadService() {
  return import(
    "../controllers/admin-websites/feature-services/service.rybbit"
  );
}

const LIVE_PREVIEW = {
  id: "proj-a",
  hostname: null,
  generated_hostname: "smiles-of-austin-123",
  custom_domain: null,
  status: "LIVE",
  archived_at: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  rybbitSiteIdByProject.clear();
  integrationByProject.clear();
  vi.stubGlobal("fetch", fetchMock);
  process.env.RYBBIT_API_URL = "http://rybbit.test";
  process.env.RYBBIT_API_KEY = "test-key";
  process.env.RYBBIT_ORG_ID = "test-org";
  process.env.PREVIEW_ANALYTICS_ENABLED = "true";
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.PREVIEW_ANALYTICS_ENABLED;
});

describe("provisionPreviewAnalytics — gate (ships DISABLED)", () => {
  it("provisions nothing when the master gate is off", async () => {
    process.env.PREVIEW_ANALYTICS_ENABLED = "false";
    const { provisionPreviewAnalytics } = await loadService();

    const result = await provisionPreviewAnalytics("proj-a");

    expect(result).toEqual({
      enabled: false,
      provisioned: false,
      reason: "gate_disabled",
    });
    // No DB read, no site lookup, and above all NO beacon.
    expect(findPreviewProvisioningContextById).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("treats an unset gate as off", async () => {
    delete process.env.PREVIEW_ANALYTICS_ENABLED;
    const { provisionPreviewAnalytics } = await loadService();

    const result = await provisionPreviewAnalytics("proj-a");

    expect(result.enabled).toBe(false);
    expect(result.reason).toBe("gate_disabled");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("provisionPreviewAnalytics — happy path", () => {
  it("provisions a Rybbit site for a LIVE preview project and reports actual state", async () => {
    findPreviewProvisioningContextById.mockResolvedValue(LIVE_PREVIEW);
    const { provisionPreviewAnalytics } = await loadService();

    const result = await provisionPreviewAnalytics("proj-a");

    expect(result).toEqual({
      enabled: true,
      provisioned: true,
      siteId: "site-smiles-of-austin-123.sites.getalloro.com",
      previewDomain: "smiles-of-austin-123.sites.getalloro.com",
    });
    // The active integration row the renderer keys on was created for THIS project.
    expect(createIntegration).toHaveBeenCalledTimes(1);
    const created = createIntegration.mock.calls[0][0];
    expect(created.project_id).toBe("proj-a");
    expect(created.metadata?.siteId).toBe(
      "site-smiles-of-austin-123.sites.getalloro.com",
    );
  });

  it("sends ONLY the preview domain to Rybbit — no PII in the request", async () => {
    findPreviewProvisioningContextById.mockResolvedValue(LIVE_PREVIEW);
    const { provisionPreviewAnalytics } = await loadService();

    await provisionPreviewAnalytics("proj-a");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, opts] = fetchMock.mock.calls[0];
    const body = JSON.parse(opts.body);
    // The payload carries the domain (+ name/blockBots) and nothing patient-identifying.
    expect(body.domain).toBe("smiles-of-austin-123.sites.getalloro.com");
    expect(Object.keys(body).sort()).toEqual(["blockBots", "domain", "name"]);
  });

  it("prefers a set custom hostname over the generated one", async () => {
    findPreviewProvisioningContextById.mockResolvedValue({
      ...LIVE_PREVIEW,
      hostname: "chosen-name",
      generated_hostname: "auto-generated-999",
    });
    const { provisionPreviewAnalytics } = await loadService();

    const result = await provisionPreviewAnalytics("proj-a");

    expect(result.previewDomain).toBe("chosen-name.sites.getalloro.com");
  });
});

describe("provisionPreviewAnalytics — idempotency", () => {
  it("does not create a second Rybbit site on a repeat call", async () => {
    findPreviewProvisioningContextById.mockResolvedValue(LIVE_PREVIEW);
    const { provisionPreviewAnalytics } = await loadService();

    const first = await provisionPreviewAnalytics("proj-a");
    const second = await provisionPreviewAnalytics("proj-a");

    expect(first.provisioned).toBe(true);
    expect(second.provisioned).toBe(true);
    expect(second.siteId).toBe(first.siteId);
    // Only ONE beacon across both calls — the second short-circuits on the existing id.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(createIntegration).toHaveBeenCalledTimes(1);
  });
});

describe("provisionPreviewAnalytics — per-tenant isolation", () => {
  it("gives each project its own siteId and never mixes tenants", async () => {
    const { provisionPreviewAnalytics } = await loadService();

    findPreviewProvisioningContextById.mockResolvedValueOnce({
      ...LIVE_PREVIEW,
      id: "proj-a",
      generated_hostname: "practice-a",
    });
    const a = await provisionPreviewAnalytics("proj-a");

    findPreviewProvisioningContextById.mockResolvedValueOnce({
      ...LIVE_PREVIEW,
      id: "proj-b",
      generated_hostname: "practice-b",
    });
    const b = await provisionPreviewAnalytics("proj-b");

    // Distinct sites.
    expect(a.siteId).toBe("site-practice-a.sites.getalloro.com");
    expect(b.siteId).toBe("site-practice-b.sites.getalloro.com");
    expect(a.siteId).not.toBe(b.siteId);

    // Project A's stored siteId is untouched by provisioning B.
    expect(rybbitSiteIdByProject.get("proj-a")).toBe(
      "site-practice-a.sites.getalloro.com",
    );

    // Each integration row was created for its OWN project, with its OWN siteId.
    const byProject = Object.fromEntries(
      createIntegration.mock.calls.map((c) => [
        c[0].project_id,
        c[0].metadata?.siteId,
      ]),
    );
    expect(byProject).toEqual({
      "proj-a": "site-practice-a.sites.getalloro.com",
      "proj-b": "site-practice-b.sites.getalloro.com",
    });
  });
});

describe("provisionPreviewAnalytics — guards (no provisioning, no beacon)", () => {
  it("skips a project that does not exist", async () => {
    findPreviewProvisioningContextById.mockResolvedValue(undefined);
    const { provisionPreviewAnalytics } = await loadService();

    const result = await provisionPreviewAnalytics("missing");

    expect(result).toEqual({
      enabled: true,
      provisioned: false,
      reason: "not_found",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("skips an archived project", async () => {
    findPreviewProvisioningContextById.mockResolvedValue({
      ...LIVE_PREVIEW,
      archived_at: new Date("2026-01-01"),
    });
    const { provisionPreviewAnalytics } = await loadService();

    const result = await provisionPreviewAnalytics("proj-a");

    expect(result.reason).toBe("archived");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("skips a non-LIVE project", async () => {
    findPreviewProvisioningContextById.mockResolvedValue({
      ...LIVE_PREVIEW,
      status: "DRAFT",
    });
    const { provisionPreviewAnalytics } = await loadService();

    const result = await provisionPreviewAnalytics("proj-a");

    expect(result.reason).toBe("not_live");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("skips a project with no hostname", async () => {
    findPreviewProvisioningContextById.mockResolvedValue({
      ...LIVE_PREVIEW,
      hostname: null,
      generated_hostname: null,
    });
    const { provisionPreviewAnalytics } = await loadService();

    const result = await provisionPreviewAnalytics("proj-a");

    expect(result.reason).toBe("no_hostname");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
