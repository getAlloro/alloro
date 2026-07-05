/**
 * Hermetic tests — OS semantic retrieval (P4 T4,
 * plans/07042026-alloro-os-admin-port). OsDocumentChunkModel is mocked at the
 * seam and the embedding provider is an injected fake (§20.4); the SQL floor +
 * ordering + archived/unindexed exclusion are proven against live pgvector in
 * src/integration-tests/os/p4-rag.itest.ts. Here we cover the service contract:
 * config-driven k/floor, per-call overrides, exclude passthrough, empty-query
 * short-circuit, and the searchPassages snippet trim.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../models/OsDocumentChunkModel", () => ({
  OsDocumentChunkModel: {
    searchByEmbedding: vi.fn(async () => []),
  },
}));

import { OsRetrievalService } from "../controllers/admin-os/feature-services/OsRetrievalService";
import {
  OsFakeEmbeddingProvider,
  setOsEmbeddingProvider,
} from "../controllers/admin-os/feature-services/service.os-embeddings";
import {
  IOsChunkSearchHit,
  OsDocumentChunkModel,
} from "../models/OsDocumentChunkModel";

const hit = (
  overrides: Partial<IOsChunkSearchHit> = {}
): IOsChunkSearchHit => ({
  document_id: "0b6ff26e-3a5e-4d2b-9d3c-000000000001",
  title: "Runbook",
  slug: "runbook",
  version_no: 2,
  chunk_index: 0,
  heading_path: "Setup > Install",
  content: "Install the thing by running the installer.",
  similarity: 0.82,
  ...overrides,
});

beforeEach(() => {
  vi.resetAllMocks();
  setOsEmbeddingProvider(new OsFakeEmbeddingProvider());
  vi.mocked(OsDocumentChunkModel.searchByEmbedding).mockResolvedValue([]);
});

describe("OsRetrievalService.retrieve", () => {
  it("embeds the query and searches with the config k + floor by default", async () => {
    vi.mocked(OsDocumentChunkModel.searchByEmbedding).mockResolvedValue([hit()]);

    const out = await OsRetrievalService.retrieve("how do I install");

    expect(out).toHaveLength(1);
    expect(OsDocumentChunkModel.searchByEmbedding).toHaveBeenCalledWith(
      expect.any(Array), // the embedded query vector
      // defaults from getOsKnowledgeBaseConfig(): retrievalK 10, floor 0.3.
      { k: 10, floor: 0.3, excludeDocumentId: undefined }
    );
    // The embedded vector is a real (fake) embedding, non-empty.
    const [vectorArg] = vi.mocked(OsDocumentChunkModel.searchByEmbedding).mock
      .calls[0];
    expect((vectorArg as number[]).length).toBeGreaterThan(0);
  });

  it("honors per-call k, floor, and excludeDocumentId overrides", async () => {
    await OsRetrievalService.retrieve("query", {
      k: 3,
      floor: 0.6,
      excludeDocumentId: "22222222-2222-2222-2222-222222222222",
    });
    expect(OsDocumentChunkModel.searchByEmbedding).toHaveBeenCalledWith(
      expect.any(Array),
      {
        k: 3,
        floor: 0.6,
        excludeDocumentId: "22222222-2222-2222-2222-222222222222",
      }
    );
  });

  it("short-circuits an empty/whitespace query without embedding or searching", async () => {
    const out = await OsRetrievalService.retrieve("   ");
    expect(out).toEqual([]);
    expect(OsDocumentChunkModel.searchByEmbedding).not.toHaveBeenCalled();
  });
});

describe("OsRetrievalService.searchPassages", () => {
  it("maps hits to the transport shape and trims long snippets", async () => {
    const longContent = "x".repeat(400);
    vi.mocked(OsDocumentChunkModel.searchByEmbedding).mockResolvedValue([
      hit({ content: longContent, heading_path: "A > B" }),
    ]);

    const [passage] = await OsRetrievalService.searchPassages("q");

    expect(passage).toMatchObject({
      document_id: "0b6ff26e-3a5e-4d2b-9d3c-000000000001",
      title: "Runbook",
      slug: "runbook",
      version_no: 2,
      chunk_index: 0,
      heading_path: "A > B",
      similarity: 0.82,
    });
    // 280-char cap + ellipsis.
    expect(passage.snippet.endsWith("…")).toBe(true);
    expect(passage.snippet.length).toBeLessThanOrEqual(281);
  });

  it("returns short content untrimmed (no ellipsis)", async () => {
    vi.mocked(OsDocumentChunkModel.searchByEmbedding).mockResolvedValue([
      hit({ content: "short passage" }),
    ]);
    const [passage] = await OsRetrievalService.searchPassages("q");
    expect(passage.snippet).toBe("short passage");
  });
});
