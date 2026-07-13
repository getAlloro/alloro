import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { app } from "./helpers/app";
import { authHeader, superAdminAuthHeader } from "./helpers/auth";
import {
  OrganizationModel,
  type IOrganization,
} from "../models/OrganizationModel";

const organization = {
  id: 37,
  name: "Synthetic Dental Practice",
  pms_type: "default",
} as IOrganization;

describe("PATCH /api/admin/organizations/:id/pms-type", () => {
  beforeEach(() => {
    vi.spyOn(OrganizationModel, "findById").mockResolvedValue(organization);
    vi.spyOn(OrganizationModel, "updateById").mockResolvedValue(1);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each(["default", "dentalemr"] as const)(
    "assigns the supported %s parser and returns the canonical response",
    async (pmsType) => {
      const response = await request(app)
        .patch("/api/admin/organizations/37/pms-type")
        .set(superAdminAuthHeader())
        .send({ pmsType });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: {
          pmsType,
          message: `PMS parser set to "${pmsType}".`,
        },
        error: null,
      });
      expect(OrganizationModel.updateById).toHaveBeenCalledWith(
        37,
        expect.objectContaining({ pms_type: pmsType })
      );
    }
  );

  it("rejects unsupported parser values before the controller", async () => {
    const response = await request(app)
      .patch("/api/admin/organizations/37/pms-type")
      .set(superAdminAuthHeader())
      .send({ pmsType: "unknown" });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      success: false,
      data: null,
      error: { code: "VALIDATION_ERROR" },
    });
    expect(OrganizationModel.updateById).not.toHaveBeenCalled();
  });

  it("requires authentication and super-admin access", async () => {
    const noToken = await request(app)
      .patch("/api/admin/organizations/37/pms-type")
      .send({ pmsType: "default" });
    const nonAdmin = await request(app)
      .patch("/api/admin/organizations/37/pms-type")
      .set(authHeader({ email: "user@example.com" }))
      .send({ pmsType: "default" });

    expect(noToken.status).toBe(401);
    expect(nonAdmin.status).toBe(403);
    expect(OrganizationModel.updateById).not.toHaveBeenCalled();
  });

  it("returns a canonical not-found response", async () => {
    vi.mocked(OrganizationModel.findById).mockResolvedValue(undefined);

    const response = await request(app)
      .patch("/api/admin/organizations/404/pms-type")
      .set(superAdminAuthHeader())
      .send({ pmsType: "default" });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      success: false,
      data: null,
      error: {
        code: "ORGANIZATION_NOT_FOUND",
        message: "Organization not found.",
        details: null,
      },
    });
  });
});
