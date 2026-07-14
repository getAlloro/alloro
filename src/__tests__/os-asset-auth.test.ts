import express from "express";
import jwt from "jsonwebtoken";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { authenticateOsAsset } from "../controllers/admin-os/feature-utils/osAssetAuth";
import { requireAuthUnlessPublic } from "../middleware/publicRoutes";
import { superAdminMiddleware } from "../middleware/superAdmin";

const TEST_JWT_SECRET = "os-asset-auth-test-secret";
const previousJwtSecret = process.env.JWT_SECRET;

function buildAssetAuthApp() {
  const app = express();
  app.use(requireAuthUnlessPublic);
  app.get(
    "/api/admin/os/assets/:id",
    authenticateOsAsset,
    superAdminMiddleware,
    (_req, res) => res.status(204).end(),
  );
  app.get("/api/admin/os/documents", (_req, res) => res.status(204).end());
  return app;
}

describe("OS asset delegated authentication", () => {
  beforeAll(() => {
    process.env.JWT_SECRET = TEST_JWT_SECRET;
  });

  afterAll(() => {
    if (previousJwtSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousJwtSecret;
  });

  it("lets a valid query JWT reach the asset route's super-admin gate", async () => {
    const token = jwt.sign(
      { userId: 7, email: "diagnostic@getalloro.com" },
      TEST_JWT_SECRET,
    );

    const response = await request(buildAssetAuthApp()).get(
      `/api/admin/os/assets/asset-id?token=${encodeURIComponent(token)}`,
    );

    expect(response.status).toBe(204);
  });

  it("still blocks missing and invalid asset tokens", async () => {
    const app = buildAssetAuthApp();

    const missing = await request(app).get("/api/admin/os/assets/asset-id");
    const invalid = await request(app).get(
      "/api/admin/os/assets/asset-id?token=invalid",
    );

    expect(missing.status).toBe(401);
    expect(invalid.status).toBe(403);
  });

  it("keeps other Admin OS paths on the global header-auth gate", async () => {
    const response = await request(buildAssetAuthApp()).get(
      "/api/admin/os/documents",
    );

    expect(response.status).toBe(401);
  });
});
