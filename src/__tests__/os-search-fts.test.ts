/**
 * Hermetic tests — Admin OS hybrid search endpoint (P2 FTS + P4 hybrid,
 * plans/07042026-alloro-os-admin-port). The lexical SQL and the semantic vector
 * query are proven against the real database in the P2/P4 itests; here the model
 * seams are mocked (and the embedding provider is an injected fake) so the REAL
 * routes → controller → OsHybridSearchService run with no DB and no network.
 *
 * Covers: the two-section {lexical, semantic} envelope, §11.6 lexical
 * pagination, required-q validation, mode selection (hybrid default / lexical /
 * semantic), archived-excluded-by-default, and the §11.1 auth guards.
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
vi.mock("../models/OsDocumentChunkModel", () => ({
  OsDocumentChunkModel: {
    searchByEmbedding: vi.fn(async () => []),
  },
}));

import { app } from "./helpers/app";
import { authHeader, superAdminAuthHeader } from "./helpers/auth";
import {
  OsDocumentModel,
  IOsDocumentSearchHit,
} from "../models/OsDocumentModel";
import {
  IOsChunkSearchHit,
  OsDocumentChunkModel,
} from "../models/OsDocumentChunkModel";
import {
  OsFakeEmbeddingProvider,
  setOsEmbeddingProvider,
} from "../controllers/admin-os/feature-services/service.os-embeddings";

const hybridEnvelope = z.object({
  success: z.literal(true),
  data: z.object({
    mode: z.enum(["hybrid", "lexical", "semantic"]),
    lexical: z.object({
      results: z.array(z.unknown()),
      pagination: z.object({
        page: z.number(),
        limit: z.number(),
        total: z.number(),
        totalPages: z.number(),
      }),
    }),
    semantic: z.object({ results: z.array(z.unknown()) }),
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

const chunkHit: IOsChunkSearchHit = {
  document_id: "0b6ff26e-3a5e-4d2b-9d3c-000000000004",
  title: "Zebra runbook",
  slug: "zebra-runbook",
  version_no: 2,
  chunk_index: 1,
  heading_path: "Care > Feeding",
  content: "Feed the zebra twice daily.",
  similarity: 0.77,
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(OsDocumentModel.searchFullText).mockResolvedValue([]);
  vi.mocked(OsDocumentModel.countFullTextMatches).mockResolvedValue(0);
  vi.mocked(OsDocumentChunkModel.searchByEmbedding).mockResolvedValue([]);
  setOsEmbeddingProvider(new OsFakeEmbeddingProvider());
});

describe("GET /api/admin/os/search — hybrid", () => {
  it("returns both sections (default mode=hybrid) in the §8.1 envelope", async () => {
    vi.mocked(OsDocumentModel.searchFullText).mockResolvedValue([searchHit]);
    vi.mocked(OsDocumentModel.countFullTextMatches).mockResolvedValue(1);
    vi.mocked(OsDocumentChunkModel.searchByEmbedding).mockResolvedValue([
      chunkHit,
    ]);

    const res = await request(app)
      .get("/api/admin/os/search?q=zebra")
      .set(superAdminAuthHeader());

    expect(res.status).toBe(200);
    expect(() => hybridEnvelope.parse(res.body)).not.toThrow();
    expect(res.body.data.mode).toBe("hybrid");
    expect(res.body.data.lexical.results[0].title).toBe("Zebra runbook");
    expect(res.body.data.lexical.pagination).toEqual({
      page: 1,
      limit: 20,
      total: 1,
      totalPages: 1,
    });
    expect(res.body.data.semantic.results[0].heading_path).toBe("Care > Feeding");
    expect(res.body.data.semantic.results[0].snippet).toBe(
      "Feed the zebra twice daily."
    );
  });

  it("mode=lexical runs FTS only and leaves semantic empty (no embed)", async () => {
    vi.mocked(OsDocumentModel.searchFullText).mockResolvedValue([searchHit]);
    vi.mocked(OsDocumentModel.countFullTextMatches).mockResolvedValue(1);

    const res = await request(app)
      .get("/api/admin/os/search?q=zebra&mode=lexical")
      .set(superAdminAuthHeader());

    expect(res.status).toBe(200);
    expect(res.body.data.mode).toBe("lexical");
    expect(res.body.data.lexical.results).toHaveLength(1);
    expect(res.body.data.semantic.results).toHaveLength(0);
    expect(OsDocumentChunkModel.searchByEmbedding).not.toHaveBeenCalled();
  });

  it("mode=semantic runs vector only and leaves lexical empty (no FTS)", async () => {
    vi.mocked(OsDocumentChunkModel.searchByEmbedding).mockResolvedValue([
      chunkHit,
    ]);

    const res = await request(app)
      .get("/api/admin/os/search?q=zebra&mode=semantic")
      .set(superAdminAuthHeader());

    expect(res.status).toBe(200);
    expect(res.body.data.mode).toBe("semantic");
    expect(res.body.data.semantic.results).toHaveLength(1);
    expect(res.body.data.lexical.results).toHaveLength(0);
    expect(OsDocumentModel.searchFullText).not.toHaveBeenCalled();
  });

  it("excludes archived by default in the lexical section", async () => {
    await request(app)
      .get("/api/admin/os/search?q=zebra&mode=lexical")
      .set(superAdminAuthHeader());

    expect(OsDocumentModel.searchFullText).toHaveBeenCalledWith(
      "zebra",
      expect.objectContaining({ includeArchived: false }),
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

  it("400s VALIDATION_ERROR on an unknown mode", async () => {
    const res = await request(app)
      .get("/api/admin/os/search?q=x&mode=fuzzy")
      .set(superAdminAuthHeader());
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
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
