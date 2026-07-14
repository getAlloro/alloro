import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { ReceiptsReportService } from "../controllers/receipts-report/feature-services/ReceiptsReportService";
import { ReceiptsReportError } from "../controllers/receipts-report/feature-utils/ReceiptsReportError";
import type { ReceiptsReport } from "../controllers/receipts-report/ReceiptsReportTypes";
import logger from "../lib/logger";
import { app } from "./helpers/app";
import { authHeader, superAdminAuthHeader } from "./helpers/auth";

const ROUTE = "/api/admin/receipts-report/organizations/39";
const VALID_QUERY = {
  startDate: "2026-04-01",
  endDate: "2026-06-30",
};

const SYNTHETIC_REPORT: ReceiptsReport = {
  organizationId: 39,
  period: VALID_QUERY,
  generatedAt: "2026-07-14T00:00:00.000Z",
  orgLevel: {
    websiteVisitors: { value: 25, flag: "ok" },
    leadsCaptured: { value: 4, flag: "ok" },
  },
  locations: [],
  total: {
    gbpPostsPublished: { value: 0, flag: "ok" },
    gbpReviewRepliesPublished: { value: 0, flag: "ok" },
  },
  replacementCostContext: {
    lineItems: [],
    total: null,
    note: "Synthetic unstaked rates.",
    ratesStaked: false,
  },
};

beforeEach(() => {
  vi.spyOn(ReceiptsReportService, "getReport").mockResolvedValue(
    SYNTHETIC_REPORT
  );
  vi.spyOn(logger, "warn").mockImplementation(() => logger);
  vi.spyOn(logger, "error").mockImplementation(() => logger);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("receipts-report route access", () => {
  it("returns 401 without a token before calling the service", async () => {
    const response = await request(app).get(ROUTE).query(VALID_QUERY);

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: "Authentication required" });
    expect(ReceiptsReportService.getReport).not.toHaveBeenCalled();
  });

  it("returns 403 for an authenticated non-super-admin", async () => {
    const response = await request(app)
      .get(ROUTE)
      .query(VALID_QUERY)
      .set(authHeader({ email: "user@example.com" }));

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      error: "Access denied. Super Admin privileges required.",
    });
    expect(ReceiptsReportService.getReport).not.toHaveBeenCalled();
  });
});

describe("receipts-report route validation", () => {
  it.each(["0", "abc"])(
    "rejects invalid organization id %s at the route boundary",
    async (organizationId) => {
      const response = await request(app)
        .get(`/api/admin/receipts-report/organizations/${organizationId}`)
        .query(VALID_QUERY)
        .set(superAdminAuthHeader());

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({
        success: false,
        data: null,
        error: { code: "VALIDATION_ERROR" },
      });
      expect(ReceiptsReportService.getReport).not.toHaveBeenCalled();
    }
  );

  it.each([
    { title: "missing dates", query: {} },
    {
      title: "an impossible calendar date",
      query: { startDate: "2026-02-31", endDate: "2026-03-01" },
    },
    {
      title: "an inverted date range",
      query: { startDate: "2026-06-30", endDate: "2026-04-01" },
    },
  ])("rejects $title at the route boundary", async ({ query }) => {
    const response = await request(app)
      .get(ROUTE)
      .query(query)
      .set(superAdminAuthHeader());

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      success: false,
      data: null,
      error: { code: "VALIDATION_ERROR" },
    });
    expect(ReceiptsReportService.getReport).not.toHaveBeenCalled();
  });
});

describe("receipts-report route responses", () => {
  it("returns the canonical report and exact service input", async () => {
    const response = await request(app)
      .get(ROUTE)
      .query(VALID_QUERY)
      .set(superAdminAuthHeader());

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      data: SYNTHETIC_REPORT,
      error: null,
    });
    expect(ReceiptsReportService.getReport).toHaveBeenCalledTimes(1);
    expect(ReceiptsReportService.getReport).toHaveBeenCalledWith({
      organizationId: 39,
      ...VALID_QUERY,
    });
  });

  it("maps organization-not-found to a canonical 404", async () => {
    vi.mocked(ReceiptsReportService.getReport).mockRejectedValueOnce(
      new ReceiptsReportError(
        "RECEIPTS_REPORT_ORGANIZATION_NOT_FOUND",
        "Organization not found."
      )
    );

    const response = await request(app)
      .get(ROUTE)
      .query(VALID_QUERY)
      .set(superAdminAuthHeader());

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      success: false,
      data: null,
      error: {
        code: "RECEIPTS_REPORT_ORGANIZATION_NOT_FOUND",
        message: "Organization not found.",
        details: null,
      },
    });
  });

  it("returns a generic canonical 500 without leaking internals", async () => {
    const sensitiveDetail = "synthetic database hostname";
    vi.mocked(ReceiptsReportService.getReport).mockRejectedValueOnce(
      new Error(sensitiveDetail)
    );

    const response = await request(app)
      .get(ROUTE)
      .query(VALID_QUERY)
      .set(superAdminAuthHeader());

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      success: false,
      data: null,
      error: {
        code: "RECEIPTS_REPORT_ERROR",
        message: "Receipts report request failed.",
        details: null,
      },
    });
    expect(JSON.stringify(response.body)).not.toContain(sensitiveDetail);
  });
});
