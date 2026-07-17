import type { Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RybbitIntegrationError } from "../controllers/admin-websites/feature-services/service.rybbit-integration";

const mocks = vi.hoisted(() => ({
  provisionPreviewAnalytics: vi.fn(),
}));

vi.mock(
  "../controllers/admin-websites/feature-services/service.rybbit",
  () => ({
    provisionPreviewAnalytics: mocks.provisionPreviewAnalytics,
  }),
);

import { provisionRybbitPreview } from "../controllers/admin-websites/WebsiteIntegrationsController";

function mockResponse(): {
  res: Response;
  status: ReturnType<typeof vi.fn>;
  json: ReturnType<typeof vi.fn>;
} {
  const status = vi.fn();
  const json = vi.fn();
  const res = { status, json } as unknown as Response;
  status.mockReturnValue(res);
  json.mockReturnValue(res);
  return { res, status, json };
}

function mockRequest(): Request {
  return { params: { id: "project-1" } } as unknown as Request;
}

describe("provisionRybbitPreview error mapping", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("maps a missing project to HTTP 404", async () => {
    mocks.provisionPreviewAnalytics.mockRejectedValueOnce(
      new RybbitIntegrationError(
        404,
        "PROJECT_NOT_FOUND",
        "Website project not found",
      ),
    );
    const { res, status, json } = mockResponse();

    await provisionRybbitPreview(mockRequest(), res);

    expect(status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith({
      success: false,
      error: "PROJECT_NOT_FOUND",
      message: "Website project not found",
    });
  });

  it("maps an upstream provider failure to HTTP 502", async () => {
    mocks.provisionPreviewAnalytics.mockRejectedValueOnce(
      new RybbitIntegrationError(
        502,
        "RYBBIT_PROVIDER_ERROR",
        "Rybbit could not create the analytics site",
      ),
    );
    const { res, status, json } = mockResponse();

    await provisionRybbitPreview(mockRequest(), res);

    expect(status).toHaveBeenCalledWith(502);
    expect(json).toHaveBeenCalledWith({
      success: false,
      error: "RYBBIT_PROVIDER_ERROR",
      message: "Rybbit could not create the analytics site",
    });
  });

  it("maps missing provider configuration to HTTP 503", async () => {
    mocks.provisionPreviewAnalytics.mockRejectedValueOnce(
      new RybbitIntegrationError(
        503,
        "RYBBIT_PROVIDER_UNAVAILABLE",
        "Rybbit provisioning is not configured",
      ),
    );
    const { res, status, json } = mockResponse();

    await provisionRybbitPreview(mockRequest(), res);

    expect(status).toHaveBeenCalledWith(503);
    expect(json).toHaveBeenCalledWith({
      success: false,
      error: "RYBBIT_PROVIDER_UNAVAILABLE",
      message: "Rybbit provisioning is not configured",
    });
  });

  it("maps local persistence failure to HTTP 500", async () => {
    mocks.provisionPreviewAnalytics.mockRejectedValueOnce(
      new RybbitIntegrationError(
        500,
        "RYBBIT_PERSISTENCE_FAILED",
        "Failed to save the Rybbit integration",
      ),
    );
    const { res, status, json } = mockResponse();

    await provisionRybbitPreview(mockRequest(), res);

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({
      success: false,
      error: "RYBBIT_PERSISTENCE_FAILED",
      message: "Failed to save the Rybbit integration",
    });
  });
});
