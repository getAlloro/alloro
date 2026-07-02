/**
 * Unit tests — patient-journey `stageReaders.readImpressions` empty-window
 * reasons (plans/07022026-patient-journey-month-nav-gsc-pending, T1).
 *
 * The service test mocks the readers wholesale, so the reason-decision logic
 * is proven here against the real reader with mocked models (§20.1 mirrors
 * the unit, §20.4 synthetic data): the GSC rows drive availability; the
 * `website_integrations` row drives `not_connected` vs `pending`/`no_data`;
 * a failed lookup degrades to the reason-less legacy empty read.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Model / dependency seams (keep stageReaders off the real DB + network) ──
const findByProjectAndDateRange = vi.fn();
const findByProjectAndPlatform = vi.fn();

vi.mock("../models/website-builder/GscDataModel", () => ({
  GscDataModel: {
    findByProjectAndDateRange: (...a: unknown[]) =>
      findByProjectAndDateRange(...a),
  },
}));
vi.mock("../models/website-builder/WebsiteIntegrationModel", () => ({
  WebsiteIntegrationModel: {
    findByProjectAndPlatform: (...a: unknown[]) =>
      findByProjectAndPlatform(...a),
  },
}));
vi.mock("../models/website-builder/FormSubmissionModel", () => ({
  FormSubmissionModel: {},
}));
vi.mock("../models/website-builder/ProjectModel", () => ({
  ProjectModel: {},
}));
vi.mock("../models/website-builder/ReviewModel", () => ({
  ReviewModel: {},
}));
vi.mock("../models/PracticeRankingModel", () => ({
  PracticeRankingModel: {},
}));
vi.mock("../utils/pms/pmsAggregator", () => ({
  aggregatePmsData: vi.fn(),
}));
vi.mock(
  "../controllers/admin-websites/feature-services/service.rybbit-performance",
  () => ({ fetchRybbitOverview: vi.fn() }),
);
vi.mock("../utils/rybbit/rybbit-time-zone", () => ({
  resolveRybbitTimeZone: vi.fn(),
}));
vi.mock("../lib/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { readImpressions } from "../controllers/patient-journey/feature-services/stageReaders";

const PROJECT = "proj-1";
const START = "2026-06-01";
const END = "2026-06-30";

beforeEach(() => {
  vi.clearAllMocks();
  findByProjectAndDateRange.mockResolvedValue([]);
});

describe("readImpressions — empty-window reasons", () => {
  it("reports not_connected when no GSC integration exists", async () => {
    findByProjectAndPlatform.mockResolvedValue(undefined);

    const read = await readImpressions(PROJECT, START, END, true);

    expect(read).toMatchObject({
      value: null,
      available: false,
      unavailableReason: "not_connected",
    });
    expect(findByProjectAndPlatform).toHaveBeenCalledWith(PROJECT, "gsc");
  });

  it("reports not_connected when the integration is not active", async () => {
    findByProjectAndPlatform.mockResolvedValue({ status: "revoked" });

    const read = await readImpressions(PROJECT, START, END, true);

    expect(read.available).toBe(false);
    expect(read.unavailableReason).toBe("not_connected");
  });

  it("reports pending for a connected, empty current month", async () => {
    findByProjectAndPlatform.mockResolvedValue({ status: "active" });

    const read = await readImpressions(PROJECT, START, END, true);

    expect(read.available).toBe(false);
    expect(read.unavailableReason).toBe("pending");
  });

  it("reports no_data for a connected, empty past month", async () => {
    findByProjectAndPlatform.mockResolvedValue({ status: "active" });

    const read = await readImpressions(PROJECT, START, END, false);

    expect(read.available).toBe(false);
    expect(read.unavailableReason).toBe("no_data");
  });

  it("degrades to the reason-less legacy empty read when the connection check fails", async () => {
    findByProjectAndPlatform.mockRejectedValue(new Error("lookup failed"));

    const read = await readImpressions(PROJECT, START, END, true);

    expect(read).toEqual({ value: null, available: false, asOf: null });
  });

  it("does not consult the integration when the window has data", async () => {
    findByProjectAndDateRange.mockResolvedValue([
      {
        report_date: "2026-06-10",
        data: { rows: [{ clicks: 5, impressions: 100, position: 4 }] },
      },
    ]);

    const read = await readImpressions(PROJECT, START, END, true);

    expect(read.available).toBe(true);
    expect(read.value).toBe(100);
    expect(read.unavailableReason).toBeUndefined();
    expect(findByProjectAndPlatform).not.toHaveBeenCalled();
  });
});
