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
type MockIntegration = {
  id: string;
  project_id: string;
  metadata?: { siteId?: string };
  status?: "active" | "revoked";
  connected_by?: "system" | null;
};
const integrationByProject = new Map<
  string,
  MockIntegration
>();
const transactionContext = { name: "test-transaction" };
let transactionTail = Promise.resolve();
const providerSites: Array<{ siteId: string; domain: string }> = [];

const findPreviewProvisioningContextById = vi.fn<
  (projectId: string) => Promise<
    | {
        id: string;
        hostname: string | null;
        generated_hostname: string | null;
        custom_domain: string | null;
        status: string | null;
        archived_at: Date | null;
        org_archived_at: Date | null;
      }
    | undefined
  >
>();

const findRybbitSiteIdByIdForUpdate = vi.fn(
  async (projectId: string, _trx: unknown) => ({
    rybbit_site_id: rybbitSiteIdByProject.get(projectId) ?? null,
  }),
);

const updateRybbitSiteId = vi.fn(
  async (projectId: string, siteId: string | null, _trx?: unknown) => {
    rybbitSiteIdByProject.set(projectId, siteId);
    return 1;
  },
);

const findByProjectAndPlatform = vi.fn(
  async (projectId: string, _platform: string, _trx?: unknown) =>
    integrationByProject.get(projectId),
);

const createIntegration = vi.fn(
  async (
    row: {
      project_id: string;
      metadata?: { siteId?: string };
      status?: "active";
      connected_by?: "system";
    },
    _trx?: unknown,
  ) => {
    const created: MockIntegration = {
      id: `int-${row.project_id}`,
      ...row,
    };
    integrationByProject.set(row.project_id, created);
    return created;
  },
);

const updateIntegration = vi.fn(
  async (
    id: string,
    data: Partial<MockIntegration>,
    _trx?: unknown,
  ): Promise<MockIntegration | undefined> => {
    const entry = Array.from(integrationByProject.entries()).find(
      ([, integration]) => integration.id === id,
    );
    if (!entry) return undefined;
    const [projectId, existing] = entry;
    const updated = { ...existing, ...data };
    integrationByProject.set(projectId, updated);
    return updated;
  },
);

function restoreMap<K, V>(target: Map<K, V>, snapshot: Map<K, V>): void {
  target.clear();
  snapshot.forEach((value, key) => target.set(key, value));
}

const transaction = vi.fn(
  async <T>(callback: (trx: typeof transactionContext) => Promise<T>) => {
    const previous = transactionTail;
    let releaseTransaction: () => void = () => undefined;
    transactionTail = new Promise<void>((resolve) => {
      releaseTransaction = resolve;
    });
    await previous;

    const projectSnapshot = new Map(rybbitSiteIdByProject);
    const integrationSnapshot = new Map(integrationByProject);
    try {
      return await callback(transactionContext);
    } catch (error) {
      restoreMap(rybbitSiteIdByProject, projectSnapshot);
      restoreMap(integrationByProject, integrationSnapshot);
      throw error;
    } finally {
      releaseTransaction();
    }
  },
);

vi.mock("../models/website-builder/ProjectModel", () => ({
  ProjectModel: {
    findPreviewProvisioningContextById,
    findRybbitSiteIdByIdForUpdate,
    updateRybbitSiteId,
  },
}));

vi.mock("../models/website-builder/WebsiteIntegrationModel", () => ({
  WebsiteIntegrationModel: {
    findByProjectAndPlatform,
    create: createIntegration,
    update: updateIntegration,
    transaction,
  },
}));

vi.mock("../lib/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// Rybbit's organization-site list/create endpoints are stubbed so no test ever
// reaches the provider. Provider state survives a local transaction rollback,
// matching the real failure boundary.
function jsonResponse(payload: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  } as Response;
}

async function defaultProviderFetch(
  _url: string,
  opts: RequestInit,
): Promise<Response> {
  if (opts.method === "GET") {
    return jsonResponse({ sites: [...providerSites] });
  }

  const body = JSON.parse(String(opts.body)) as { domain: string };
  const siteId = `site-${body.domain}`;
  providerSites.push({ siteId, domain: body.domain });
  return jsonResponse({ siteId }, 201);
}

const fetchMock = vi.fn(defaultProviderFetch);

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
  org_archived_at: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  rybbitSiteIdByProject.clear();
  integrationByProject.clear();
  providerSites.length = 0;
  transactionTail = Promise.resolve();
  fetchMock.mockImplementation(defaultProviderFetch);
  vi.stubGlobal("fetch", fetchMock);
  process.env.RYBBIT_API_URL = "http://rybbit.test";
  process.env.RYBBIT_API_KEY = "test-key";
  process.env.RYBBIT_ORG_ID = "test-org";
  process.env.PREVIEW_ANALYTICS_ENABLED = "true";
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.PREVIEW_ANALYTICS_ENABLED;
  delete process.env.RYBBIT_API_URL;
  delete process.env.RYBBIT_API_KEY;
  delete process.env.RYBBIT_ORG_ID;
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

    const postCall = fetchMock.mock.calls.find(
      ([, opts]) => opts.method === "POST",
    );
    expect(postCall).toBeDefined();
    expect(
      fetchMock.mock.calls.map(([url, opts]) => [url, opts.method]),
    ).toEqual([
      [
        "http://rybbit.test/api/organizations/test-org/sites",
        "GET",
      ],
      [
        "http://rybbit.test/api/organizations/test-org/sites",
        "POST",
      ],
    ]);
    const [, opts] = postCall as [string, RequestInit];
    const body = JSON.parse(String(opts.body));
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
    // One provider lookup + one creation. The repeat call short-circuits locally.
    expect(
      fetchMock.mock.calls.filter(([, opts]) => opts.method === "POST"),
    ).toHaveLength(1);
    expect(createIntegration).toHaveBeenCalledTimes(1);
  });

  it("serializes concurrent calls and creates only one provider site", async () => {
    findPreviewProvisioningContextById.mockResolvedValue(LIVE_PREVIEW);
    const { provisionPreviewAnalytics } = await loadService();

    const [first, second] = await Promise.all([
      provisionPreviewAnalytics("proj-a"),
      provisionPreviewAnalytics("proj-a"),
    ]);

    expect(first.siteId).toBe(second.siteId);
    expect(first.provisioned).toBe(true);
    expect(second.provisioned).toBe(true);
    expect(
      fetchMock.mock.calls.filter(([, opts]) => opts.method === "POST"),
    ).toHaveLength(1);
    expect(providerSites).toHaveLength(1);
    expect(createIntegration).toHaveBeenCalledTimes(1);
    expect(transaction).toHaveBeenCalledTimes(2);
    expect(findRybbitSiteIdByIdForUpdate).toHaveBeenNthCalledWith(
      1,
      "proj-a",
      transactionContext,
    );
    expect(findRybbitSiteIdByIdForUpdate).toHaveBeenNthCalledWith(
      2,
      "proj-a",
      transactionContext,
    );
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
  it("throws a typed 404 when the project does not exist", async () => {
    findPreviewProvisioningContextById.mockResolvedValue(undefined);
    const { provisionPreviewAnalytics } = await loadService();

    await expect(provisionPreviewAnalytics("missing")).rejects.toMatchObject({
      status: 404,
      code: "PROJECT_NOT_FOUND",
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

  it("defers a project that has a custom domain to the custom-domain path", async () => {
    findPreviewProvisioningContextById.mockResolvedValue({
      ...LIVE_PREVIEW,
      custom_domain: "smilesofaustin.com",
    });
    const { provisionPreviewAnalytics } = await loadService();

    const result = await provisionPreviewAnalytics("proj-a");

    expect(result.reason).toBe("has_custom_domain");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("skips a project under an archived organization", async () => {
    findPreviewProvisioningContextById.mockResolvedValue({
      ...LIVE_PREVIEW,
      org_archived_at: new Date("2026-01-01"),
    });
    const { provisionPreviewAnalytics } = await loadService();

    const result = await provisionPreviewAnalytics("proj-a");

    expect(result.reason).toBe("org_archived");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("falls back to the generated hostname when hostname is an empty string", async () => {
    findPreviewProvisioningContextById.mockResolvedValue({
      ...LIVE_PREVIEW,
      hostname: "",
      generated_hostname: "fallback-999",
    });
    const { provisionPreviewAnalytics } = await loadService();

    const result = await provisionPreviewAnalytics("proj-a");

    expect(result.previewDomain).toBe("fallback-999.sites.getalloro.com");
    expect(result.provisioned).toBe(true);
  });
});

describe("provisionPreviewAnalytics — active-row invariant (no false success)", () => {
  it("refuses a project whose rybbit integration was revoked, and does not re-sync it", async () => {
    findPreviewProvisioningContextById.mockResolvedValue(LIVE_PREVIEW);
    // An admin previously revoked this project's rybbit integration.
    integrationByProject.set("proj-a", {
      id: "int-proj-a",
      project_id: "proj-a",
      status: "revoked",
      metadata: { siteId: "old-site" },
    } as never);
    const { provisionPreviewAnalytics } = await loadService();

    const result = await provisionPreviewAnalytics("proj-a");

    expect(result).toEqual({
      enabled: true,
      provisioned: false,
      reason: "integration_revoked",
    });
    // No provisioning fired, and the deliberate revoke was NOT undone.
    expect(fetchMock).not.toHaveBeenCalled();
    expect(updateRybbitSiteId).not.toHaveBeenCalled();
    expect(rybbitSiteIdByProject.has("proj-a")).toBe(false);
  });

  it("throws a typed provider error when Rybbit returns no site ID", async () => {
    findPreviewProvisioningContextById.mockResolvedValue(LIVE_PREVIEW);
    fetchMock.mockImplementation(async (_url, opts) =>
      opts.method === "GET"
        ? jsonResponse({ sites: [] })
        : jsonResponse({}, 201),
    );
    const { provisionPreviewAnalytics } = await loadService();

    await expect(provisionPreviewAnalytics("proj-a")).rejects.toMatchObject({
      status: 502,
      code: "RYBBIT_PROVIDER_INVALID_RESPONSE",
    });
    expect(rybbitSiteIdByProject.has("proj-a")).toBe(false);
    expect(integrationByProject.has("proj-a")).toBe(false);
  });

  it("fails closed when the provider site list is malformed", async () => {
    findPreviewProvisioningContextById.mockResolvedValue(LIVE_PREVIEW);
    fetchMock.mockResolvedValue(jsonResponse({ unexpected: [] }));
    const { provisionPreviewAnalytics } = await loadService();

    await expect(provisionPreviewAnalytics("proj-a")).rejects.toMatchObject({
      status: 502,
      code: "RYBBIT_PROVIDER_INVALID_RESPONSE",
    });
    expect(
      fetchMock.mock.calls.filter(([, opts]) => opts.method === "POST"),
    ).toHaveLength(0);
    expect(rybbitSiteIdByProject.has("proj-a")).toBe(false);
    expect(integrationByProject.has("proj-a")).toBe(false);
  });

  it("fails with typed 503 before provider I/O when configuration is absent", async () => {
    findPreviewProvisioningContextById.mockResolvedValue(LIVE_PREVIEW);
    delete process.env.RYBBIT_API_URL;
    delete process.env.RYBBIT_API_KEY;
    delete process.env.RYBBIT_ORG_ID;
    const { provisionPreviewAnalytics } = await loadService();

    await expect(provisionPreviewAnalytics("proj-a")).rejects.toMatchObject({
      status: 503,
      code: "RYBBIT_PROVIDER_UNAVAILABLE",
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(rybbitSiteIdByProject.has("proj-a")).toBe(false);
    expect(integrationByProject.has("proj-a")).toBe(false);
  });

  it("throws a typed provider error when Rybbit returns non-2xx", async () => {
    findPreviewProvisioningContextById.mockResolvedValue(LIVE_PREVIEW);
    fetchMock.mockImplementation(async (_url, opts) =>
      opts.method === "GET"
        ? jsonResponse({ sites: [] })
        : jsonResponse({}, 503),
    );
    const { provisionPreviewAnalytics } = await loadService();

    await expect(provisionPreviewAnalytics("proj-a")).rejects.toMatchObject({
      status: 502,
      code: "RYBBIT_PROVIDER_ERROR",
    });
    expect(rybbitSiteIdByProject.has("proj-a")).toBe(false);
    expect(integrationByProject.has("proj-a")).toBe(false);
  });

  it("rolls back local writes and adopts the provider site on retry", async () => {
    findPreviewProvisioningContextById.mockResolvedValue(LIVE_PREVIEW);
    createIntegration.mockRejectedValueOnce(new Error("insert failed"));
    const { provisionPreviewAnalytics } = await loadService();

    await expect(provisionPreviewAnalytics("proj-a")).rejects.toMatchObject({
      status: 500,
      code: "RYBBIT_PERSISTENCE_FAILED",
    });
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(updateRybbitSiteId).toHaveBeenCalledWith(
      "proj-a",
      "site-smiles-of-austin-123.sites.getalloro.com",
      transactionContext,
    );
    expect(rybbitSiteIdByProject.has("proj-a")).toBe(false);
    expect(integrationByProject.has("proj-a")).toBe(false);

    const retry = await provisionPreviewAnalytics("proj-a");

    expect(retry).toMatchObject({
      provisioned: true,
      siteId: "site-smiles-of-austin-123.sites.getalloro.com",
    });
    expect(
      fetchMock.mock.calls.filter(([, opts]) => opts.method === "POST"),
    ).toHaveLength(1);
    expect(
      fetchMock.mock.calls.filter(([, opts]) => opts.method === "GET"),
    ).toHaveLength(2);
    expect(providerSites).toHaveLength(1);
    expect(rybbitSiteIdByProject.get("proj-a")).toBe(retry.siteId);
    expect(integrationByProject.get("proj-a")?.metadata?.siteId).toBe(
      retry.siteId,
    );
  });
});
