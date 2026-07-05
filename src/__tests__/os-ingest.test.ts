/**
 * Hermetic tests — OS ingest pipeline (P4 T3,
 * plans/07042026-alloro-os-admin-port). Every Os*Model is mocked at the model
 * seam and the AI providers are injected fakes (§20.4), so the REAL
 * OsIngestService orchestration runs with no DB and no network. The pgvector
 * write + retrieval are proven separately against live Postgres in
 * src/integration-tests/os/p4-rag.itest.ts.
 *
 * Covers: pipeline operation order + single-transaction body, meta_locked-aware
 * upsert passthrough, metadata-failure → title fallback → doc STILL indexed,
 * archived/missing short-circuits, link suggestions (top-5, dedupe, floor from
 * config), and the processor's final-attempt → processing_failed transition.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Fake embedding vectors are tiny + deterministic here — dimension does not
// matter for the mocked model (searchByEmbedding is stubbed), only order.
vi.mock("../models/OsDocumentModel", () => ({
  OsDocumentModel: {
    transaction: vi.fn(async (cb: (trx: unknown) => Promise<unknown>) => cb({})),
    findDocumentById: vi.fn(),
    rebuildSearchTsv: vi.fn(async () => {}),
    setStatus: vi.fn(async () => 1),
  },
}));
vi.mock("../models/OsDocumentVersionModel", () => ({
  OsDocumentVersionModel: {
    findVersionById: vi.fn(),
  },
}));
vi.mock("../models/OsDocumentChunkModel", () => ({
  OsDocumentChunkModel: {
    replaceForDocument: vi.fn(async () => {}),
    searchByEmbedding: vi.fn(async () => []),
  },
}));
vi.mock("../models/OsDocumentAiIndexModel", () => ({
  OsDocumentAiIndexModel: {
    upsertFromIngest: vi.fn(async () => {}),
  },
}));
vi.mock("../models/OsDocumentLinkModel", () => ({
  OsDocumentLinkModel: {
    suggestPair: vi.fn(async () => {}),
  },
}));

import { OsIngestService } from "../controllers/admin-os/feature-services/OsIngestService";
import {
  OsEmbeddingProvider,
  OsFakeEmbeddingProvider,
  setOsEmbeddingProvider,
} from "../controllers/admin-os/feature-services/service.os-embeddings";
import {
  OsFakeLlmProvider,
  OsLlmProvider,
  setOsLlmProvider as setLlm,
} from "../controllers/admin-os/feature-services/service.os-llm";
import { processOsIngest } from "../workers/processors/osIngest.processor";
import { OsDocumentModel, IOsDocument } from "../models/OsDocumentModel";
import { OsDocumentVersionModel } from "../models/OsDocumentVersionModel";
import { OsDocumentChunkModel } from "../models/OsDocumentChunkModel";
import { OsDocumentAiIndexModel } from "../models/OsDocumentAiIndexModel";
import { OsDocumentLinkModel } from "../models/OsDocumentLinkModel";

const DOC_ID = "0b6ff26e-3a5e-4d2b-9d3c-000000000001";
const VERSION_ID = "0b6ff26e-3a5e-4d2b-9d3c-00000000v001";

const baseDoc: IOsDocument = {
  id: DOC_ID,
  folder_id: null,
  title: "Runbook",
  slug: "runbook",
  current_version_id: VERSION_ID,
  status: "processing",
  owner_id: 1,
  created_by: 1,
  created_at: new Date(),
  updated_at: new Date(),
  archived_at: null,
};

const liveVersion = {
  id: VERSION_ID,
  document_id: DOC_ID,
  version_no: 3,
  title: "Runbook",
  content_md: "# Heading\n\nBody paragraph one.\n\n## Sub\n\nMore body text here.",
  toc_json: [],
  ai_change_summary: null,
  human_note: null,
  author_id: 1,
  created_at: new Date(),
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(OsDocumentModel.transaction).mockImplementation((cb) =>
    cb({} as never)
  );
  vi.mocked(OsDocumentModel.rebuildSearchTsv).mockResolvedValue(undefined);
  vi.mocked(OsDocumentModel.setStatus).mockResolvedValue(1);
  vi.mocked(OsDocumentChunkModel.searchByEmbedding).mockResolvedValue([]);
  // Deterministic fakes injected — no network, no key (§20.4).
  setOsEmbeddingProvider(new OsFakeEmbeddingProvider());
  setLlm(new OsFakeLlmProvider());
});

describe("OsIngestService.run — pipeline order", () => {
  it("chunks → embeds → replaces + upserts + rebuilds tsv in ONE txn → indexed", async () => {
    vi.mocked(OsDocumentModel.findDocumentById).mockResolvedValue(baseDoc);
    vi.mocked(OsDocumentVersionModel.findVersionById).mockResolvedValue(
      liveVersion
    );

    await OsIngestService.run(DOC_ID);

    // Chunk replacement carries the LIVE version_no and one embedding per chunk.
    expect(OsDocumentChunkModel.replaceForDocument).toHaveBeenCalledTimes(1);
    const [docIdArg, versionNoArg, chunksArg] = vi.mocked(
      OsDocumentChunkModel.replaceForDocument
    ).mock.calls[0];
    expect(docIdArg).toBe(DOC_ID);
    expect(versionNoArg).toBe(3);
    expect(chunksArg.length).toBeGreaterThan(0);
    for (const chunk of chunksArg) {
      expect(Array.isArray(chunk.embedding)).toBe(true);
      expect(chunk.embedding.length).toBeGreaterThan(0);
    }

    // AI index upsert tagged with the same version_no.
    expect(OsDocumentAiIndexModel.upsertFromIngest).toHaveBeenCalledWith(
      DOC_ID,
      expect.objectContaining({ generatedFor: 3 }),
      expect.anything()
    );
    expect(OsDocumentModel.rebuildSearchTsv).toHaveBeenCalledWith(
      DOC_ID,
      expect.anything()
    );

    // Terminal state.
    expect(OsDocumentModel.setStatus).toHaveBeenCalledWith(DOC_ID, "indexed");

    // The three writes ran through the one transaction handle.
    expect(OsDocumentModel.transaction).toHaveBeenCalledTimes(1);
  });

  it("degrades to title-fallback metadata on model failure and STILL indexes", async () => {
    vi.mocked(OsDocumentModel.findDocumentById).mockResolvedValue(baseDoc);
    vi.mocked(OsDocumentVersionModel.findVersionById).mockResolvedValue(
      liveVersion
    );
    // LLM throws — ingest must NOT fail; it degrades to the title fallback.
    const throwingLlm: OsLlmProvider = {
      generateDocMetadata: vi.fn(async () => {
        throw new Error("gemini exploded");
      }),
    };
    setLlm(throwingLlm);

    await OsIngestService.run(DOC_ID);

    // Fallback summary = first non-heading line; category Uncategorized; no tags.
    expect(OsDocumentAiIndexModel.upsertFromIngest).toHaveBeenCalledWith(
      DOC_ID,
      expect.objectContaining({
        category: "Uncategorized",
        tags: [],
        generatedFor: 3,
      }),
      expect.anything()
    );
    expect(OsDocumentModel.setStatus).toHaveBeenCalledWith(DOC_ID, "indexed");
  });

  it("suggests up to top-5 deduped links above the config floor, skipping self", async () => {
    vi.mocked(OsDocumentModel.findDocumentById).mockResolvedValue(baseDoc);
    vi.mocked(OsDocumentVersionModel.findVersionById).mockResolvedValue(
      liveVersion
    );
    // 7 candidate hits across 6 distinct docs (one dupe) — expect 5 suggestPair.
    const hit = (id: string, sim: number) => ({
      document_id: id,
      title: "t",
      slug: "s",
      version_no: 1,
      chunk_index: 0,
      heading_path: null,
      content: "c",
      similarity: sim,
    });
    vi.mocked(OsDocumentChunkModel.searchByEmbedding).mockResolvedValue([
      hit("11111111-1111-1111-1111-111111111111", 0.9),
      hit("11111111-1111-1111-1111-111111111111", 0.88), // dupe of #1
      hit("22222222-2222-2222-2222-222222222222", 0.85),
      hit("33333333-3333-3333-3333-333333333333", 0.8),
      hit("44444444-4444-4444-4444-444444444444", 0.75),
      hit("55555555-5555-5555-5555-555555555555", 0.7),
      hit("66666666-6666-6666-6666-666666666666", 0.65),
    ]);

    await OsIngestService.run(DOC_ID);

    // Dedup keeps 6 distinct, top-5 cap stops at 5.
    expect(OsDocumentLinkModel.suggestPair).toHaveBeenCalledTimes(5);
    expect(OsDocumentLinkModel.suggestPair).toHaveBeenCalledWith(
      DOC_ID,
      "11111111-1111-1111-1111-111111111111"
    );
    // Candidate pool + floor came from config (linkSuggestFloor default 0.5).
    expect(OsDocumentChunkModel.searchByEmbedding).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({ floor: 0.5, excludeDocumentId: DOC_ID })
    );
  });

  it("no-ops for a missing document and never writes", async () => {
    vi.mocked(OsDocumentModel.findDocumentById).mockResolvedValue(undefined);
    await OsIngestService.run(DOC_ID);
    expect(OsDocumentChunkModel.replaceForDocument).not.toHaveBeenCalled();
    expect(OsDocumentModel.setStatus).not.toHaveBeenCalled();
  });

  it("skips an archived document (never re-indexes trashed content)", async () => {
    vi.mocked(OsDocumentModel.findDocumentById).mockResolvedValue({
      ...baseDoc,
      archived_at: new Date(),
    });
    await OsIngestService.run(DOC_ID);
    expect(OsDocumentChunkModel.replaceForDocument).not.toHaveBeenCalled();
    expect(OsDocumentModel.setStatus).not.toHaveBeenCalled();
  });

  it("a link-suggestion failure is non-fatal — the doc still indexes", async () => {
    vi.mocked(OsDocumentModel.findDocumentById).mockResolvedValue(baseDoc);
    vi.mocked(OsDocumentVersionModel.findVersionById).mockResolvedValue(
      liveVersion
    );
    vi.mocked(OsDocumentChunkModel.searchByEmbedding).mockRejectedValue(
      new Error("vector index unavailable")
    );

    await OsIngestService.run(DOC_ID);

    expect(OsDocumentModel.setStatus).toHaveBeenCalledWith(DOC_ID, "indexed");
  });

  it("propagates an embedding failure so BullMQ can retry (no indexed flip)", async () => {
    vi.mocked(OsDocumentModel.findDocumentById).mockResolvedValue(baseDoc);
    vi.mocked(OsDocumentVersionModel.findVersionById).mockResolvedValue(
      liveVersion
    );
    const throwingEmbed: OsEmbeddingProvider = {
      embed: vi.fn(async () => {
        throw new Error("openai 500");
      }),
    };
    setOsEmbeddingProvider(throwingEmbed);

    await expect(OsIngestService.run(DOC_ID)).rejects.toThrow("openai 500");
    expect(OsDocumentModel.setStatus).not.toHaveBeenCalledWith(
      DOC_ID,
      "indexed"
    );
  });
});

describe("processOsIngest — final-attempt failure transition", () => {
  const makeJob = (attemptsMade: number, attempts: number) =>
    ({
      id: `os-ingest:${DOC_ID}`,
      data: { documentId: DOC_ID },
      attemptsMade,
      opts: { attempts },
    }) as unknown as Parameters<typeof processOsIngest>[0];

  it("does NOT mark failed on a non-final attempt (leaves it recoverable)", async () => {
    vi.mocked(OsDocumentModel.findDocumentById).mockRejectedValue(
      new Error("transient")
    );
    // attempt 1 of 3.
    await expect(processOsIngest(makeJob(0, 3))).rejects.toThrow("transient");
    expect(OsDocumentModel.setStatus).not.toHaveBeenCalled();
  });

  it("marks processing_failed only on the final attempt, then rethrows", async () => {
    vi.mocked(OsDocumentModel.findDocumentById).mockRejectedValue(
      new Error("still failing")
    );
    // attemptsMade 2 → this IS attempt 3 of 3 (final).
    await expect(processOsIngest(makeJob(2, 3))).rejects.toThrow(
      "still failing"
    );
    expect(OsDocumentModel.setStatus).toHaveBeenCalledWith(
      DOC_ID,
      "processing_failed"
    );
  });

  it("ignores a job with no documentId", async () => {
    const job = {
      id: "x",
      data: {},
      attemptsMade: 0,
      opts: { attempts: 3 },
    } as unknown as Parameters<typeof processOsIngest>[0];
    await expect(processOsIngest(job)).resolves.toBeUndefined();
    expect(OsDocumentModel.setStatus).not.toHaveBeenCalled();
  });
});
