import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const mocks = vi.hoisted(() => ({
  findRybbitConfigByOrganizationId: vi.fn(),
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("../models/website-builder/ProjectModel", () => ({
  ProjectModel: {
    findRybbitConfigByOrganizationId:
      mocks.findRybbitConfigByOrganizationId,
  },
}));

vi.mock("../lib/logger", () => ({ default: mocks.logger }));

const fetchMock = vi.fn<typeof fetch>();
const ORGANIZATION_ID = 39;
const START_DATE = "2026-04-01";
const END_DATE = "2026-06-30";
const TIMEOUT_MS = 6_000;

async function loadSubject() {
  vi.resetModules();
  return import("../utils/rybbit/service.rybbit-data");
}

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.stubEnv("RYBBIT_API_URL", "https://rybbit.test");
  vi.stubEnv("RYBBIT_API_KEY", "test-api-key");
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  mocks.findRybbitConfigByOrganizationId.mockReset().mockResolvedValue({
    rybbit_site_id: "site-123",
    rybbit_time_zone: "America/Chicago",
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("fetchRybbitPeriodUsers", () => {
  it("returns deduplicated users rather than sessions", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ users: 17, sessions: 91 }));
    const { fetchRybbitPeriodUsers } = await loadSubject();

    const result = await fetchRybbitPeriodUsers(
      ORGANIZATION_ID,
      START_DATE,
      END_DATE
    );

    expect(result).toEqual({ status: "ok", users: 17 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [requestUrl, requestInit] = fetchMock.mock.calls[0];
    const url = new URL(String(requestUrl));
    expect(url.pathname).toBe("/api/sites/site-123/overview");
    expect(url.searchParams.get("start_date")).toBe(START_DATE);
    expect(url.searchParams.get("end_date")).toBe(END_DATE);
    expect(url.searchParams.get("time_zone")).toBe("America/Chicago");
    expect(requestInit).toMatchObject({
      headers: { Authorization: "Bearer test-api-key" },
    });
    expect(requestInit?.signal).toBeInstanceOf(AbortSignal);
  });

  it("keeps a wrapped real zero available", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: { users: 0 } }));
    const { fetchRybbitPeriodUsers } = await loadSubject();

    await expect(
      fetchRybbitPeriodUsers(ORGANIZATION_ID, START_DATE, END_DATE)
    ).resolves.toEqual({ status: "ok", users: 0 });
  });

  it.each([
    ["missing project", undefined],
    ["missing site ID", { rybbit_site_id: null, rybbit_time_zone: null }],
    ["blank site ID", { rybbit_site_id: "   ", rybbit_time_zone: null }],
  ])("returns not_connected for %s", async (_label, project) => {
    mocks.findRybbitConfigByOrganizationId.mockResolvedValue(project);
    const { fetchRybbitPeriodUsers } = await loadSubject();

    await expect(
      fetchRybbitPeriodUsers(ORGANIZATION_ID, START_DATE, END_DATE)
    ).resolves.toEqual({ status: "not_connected" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns source_unavailable when the project lookup fails", async () => {
    mocks.findRybbitConfigByOrganizationId.mockRejectedValue(
      new Error("lookup failed")
    );
    const { fetchRybbitPeriodUsers } = await loadSubject();

    await expect(
      fetchRybbitPeriodUsers(ORGANIZATION_ID, START_DATE, END_DATE)
    ).resolves.toEqual({ status: "source_unavailable" });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mocks.logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: ORGANIZATION_ID }),
      "[Rybbit] Receipts site configuration lookup failed"
    );
  });

  it("returns source_unavailable when API configuration is missing", async () => {
    vi.stubEnv("RYBBIT_API_URL", "");
    vi.stubEnv("RYBBIT_API_KEY", "");
    const { fetchRybbitPeriodUsers } = await loadSubject();

    await expect(
      fetchRybbitPeriodUsers(ORGANIZATION_ID, START_DATE, END_DATE)
    ).resolves.toEqual({ status: "source_unavailable" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([401, 404, 500])(
    "returns source_unavailable for HTTP %i",
    async (status) => {
      fetchMock.mockResolvedValue(new Response(null, { status }));
      const { fetchRybbitPeriodUsers } = await loadSubject();

      await expect(
        fetchRybbitPeriodUsers(ORGANIZATION_ID, START_DATE, END_DATE)
      ).resolves.toEqual({ status: "source_unavailable" });
    }
  );

  it("returns source_unavailable for a network failure", async () => {
    fetchMock.mockRejectedValue(new Error("network failed"));
    const { fetchRybbitPeriodUsers } = await loadSubject();

    await expect(
      fetchRybbitPeriodUsers(ORGANIZATION_ID, START_DATE, END_DATE)
    ).resolves.toEqual({ status: "source_unavailable" });
  });

  it("returns source_unavailable for invalid JSON", async () => {
    fetchMock.mockResolvedValue(
      new Response("not-json", {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );
    const { fetchRybbitPeriodUsers } = await loadSubject();

    await expect(
      fetchRybbitPeriodUsers(ORGANIZATION_ID, START_DATE, END_DATE)
    ).resolves.toEqual({ status: "source_unavailable" });
  });

  it.each([
    ["missing", { sessions: 12 }],
    ["negative", { users: -1 }],
    ["fractional", { users: 1.5 }],
    ["non-numeric", { users: "many" }],
  ])("returns source_unavailable for %s users", async (_label, payload) => {
    fetchMock.mockResolvedValue(jsonResponse(payload));
    const { fetchRybbitPeriodUsers } = await loadSubject();

    await expect(
      fetchRybbitPeriodUsers(ORGANIZATION_ID, START_DATE, END_DATE)
    ).resolves.toEqual({ status: "source_unavailable" });
  });

  it("aborts the receipts-only request after six seconds", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation((_input, init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener(
          "abort",
          () => reject(new DOMException("Aborted", "AbortError")),
          { once: true }
        );
      })
    );
    const { fetchRybbitPeriodUsers } = await loadSubject();

    const resultPromise = fetchRybbitPeriodUsers(
      ORGANIZATION_ID,
      START_DATE,
      END_DATE
    );
    await vi.advanceTimersByTimeAsync(TIMEOUT_MS);

    await expect(resultPromise).resolves.toEqual({
      status: "source_unavailable",
    });
  });
});
