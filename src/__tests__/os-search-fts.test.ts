/**
 * Hermetic tests — Admin OS lexical search endpoint (P2 T6). The FTS SQL
 * itself is proven against the real database in
 * src/integration-tests/os/p2-library.itest.ts; here the model seam is mocked
 * and the contract is covered: §8.1 envelope, §11.6 pagination, required-q
 * validation, filter passthrough, archived-excluded-by-default semantics.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { z } from "zod";

vi.mock("../models/OsDocumentModel", () => ({
  OsDocumentModel: {
    searchFullText: vi.fn(async () => []),
    countFullTextMatches: vi.fn(async () => 0),
  },
}));

import { app } from "./helpers/app";
import { authHeader, superAdminAuthHeader } from "./helpers/auth";
import {
  OsDocumentModel,
  IOsDocumentSearchHit,
} from "../models/OsDocumentModel";

const okEnvelope = z.object({
  success: z.literal(true),
  data: z.object({
    results: z.array(z.unknown()),
    pagination: z.object({
      page: z.number(),
      limit: z.number(),
      total: z.number(),
      totalPages: z.number(),
    }),
  }),
  error: z.null(),
});

const searchHit: IOsDocumentSearchHit = {
  id: "0b6ff26e-3a5e-4d2b-9d3c-000000000004",
  title: "Zebra runbook",
  slug: "zebra-runbook",
  status: "indexed",
  folder_id: null,
  owner_id: 1,
  updated_at: new Date(),
  summary: "How to zebra",
  category: "Ops",
  tags: ["zebra"],
  rank: 0.99,
  snippet: "How to <<zebra>>",
};

beforeEach(() => {
  // resetAllMocks (not clear) so per-test implementations never leak forward.
  vi.resetAllMocks();
  vi.mocked(OsDocumentModel.searchFullText).mockResolvedValue([]);
  vi.mocked(OsDocumentModel.countFullTextMatches).mockResolvedValue(0);
});

describe("GET /api/admin/os/search", () => {
  it("returns hits + §11.6 pagination in the §8.1 envelope", async () => {
    vi.mocked(OsDocumentModel.searchFullText).mockResolvedValue([searchHit]);
    vi.mocked(OsDocumentModel.countFullTextMatches).mockResolvedValue(1);

    const res = await request(app)
      .get("/api/admin/os/search?q=zebra")
      .set(superAdminAuthHeader());

    expect(res.status).toBe(200);
    expect(() => okEnvelope.parse(res.body)).not.toThrow();
    expect(res.body.data.results[0].title).toBe("Zebra runbook");
    expect(res.body.data.pagination).toEqual({
      page: 1,
      limit: 20,
      total: 1,
      totalPages: 1,
    });
  });

  it("excludes archived by default and passes filters to the model", async () => {
    await request(app)
      .get(
        "/api/admin/os/search?q=zebra&folder_id=0b6ff26e-3a5e-4d2b-9d3c-0000000000aa&tag=ops&owner_id=7&page=2&limit=10"
      )
      .set(superAdminAuthHeader());

    expect(OsDocumentModel.searchFullText).toHaveBeenCalledWith(
      "zebra",
      expect.objectContaining({
        folderId: "0b6ff26e-3a5e-4d2b-9d3c-0000000000aa",
        tag: "ops",
        ownerId: 7,
        includeArchived: false,
      }),
      { limit: 10, offset: 10 }
    );
    expect(OsDocumentModel.countFullTextMatches).toHaveBeenCalledWith(
      "zebra",
      expect.objectContaining({ includeArchived: false })
    );
  });

  it("widens to archived rows only for an explicit status=archived filter", async () => {
    await request(app)
      .get("/api/admin/os/search?q=zebra&status=archived")
      .set(superAdminAuthHeader());

    expect(OsDocumentModel.searchFullText).toHaveBeenCalledWith(
      "zebra",
      expect.objectContaining({ status: "archived", includeArchived: true }),
      expect.anything()
    );
  });

  it("400s VALIDATION_ERROR when q is missing (§11.2 enforce)", async () => {
    const res = await request(app)
      .get("/api/admin/os/search")
      .set(superAdminAuthHeader());

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(OsDocumentModel.searchFullText).not.toHaveBeenCalled();
  });

  it("guards the route: 401 without a token, 403 without super-admin", async () => {
    const noToken = await request(app).get("/api/admin/os/search?q=x");
    expect(noToken.status).toBe(401);

    const nonAdmin = await request(app)
      .get("/api/admin/os/search?q=x")
      .set(authHeader({ email: "not-an-admin@test.alloro" }));
    expect(nonAdmin.status).toBe(403);
  });
});
