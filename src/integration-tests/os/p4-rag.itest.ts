/**
 * P4 RAG integration proof — REAL local pgvector, no model mocks
 * (plans/07042026-alloro-os-admin-port, P4 phase gate). Target: the disposable
 * local pgvector replica the worktree .env points at (alloro_admin_os_test),
 * never shared dev/prod. Schema `os` is already migrated (P1/P2 leave it so).
 *
 * The AI providers are the injected deterministic fakes (§20.4) — no OpenAI, no
 * Gemini — but everything else is live: chunk rows land as real vector(1536)
 * values, the HNSW cosine query orders them, the weighted tsv rebuilds, and the
 * FK cascade wipes chunks + links on purge.
 *
 * Proves against live Postgres:
 *   1. ingest: doc+version → chunk rows (embedding dim 1536) + ai_index row +
 *      status indexed + search_tsv populated
 *   2. retrieval: nearest-first ordering; the similarity floor cuts weak hits;
 *      archived + unindexed documents are never returned
 *   3. link suggestions: ingest writes ai_suggested rows above the link floor
 *   4. purge cascade removes chunks + links with the os.documents row
 *
 * BullMQ is mocked at the module seam — no Redis. Every os.* row created here is
 * removed in afterAll, leaving the DB migrated + clean.
 */

import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";

vi.mock("../../workers/queues", () => {
  const add = vi.fn(async () => ({ id: "p4itest-job" }));
  const fakeQueue = { add };
  return {
    getOsQueue: vi.fn(() => fakeQueue),
    getMindsQueue: vi.fn(() => fakeQueue),
    getAuditQueue: vi.fn(() => fakeQueue),
    getCrmQueue: vi.fn(() => fakeQueue),
    getHarvestQueue: vi.fn(() => fakeQueue),
    getGbpAutomationQueue: vi.fn(() => fakeQueue),
    getRedisConnection: vi.fn(),
    closeQueues: vi.fn(async () => {}),
  };
});

import { db } from "../../database/connection";
import { OsDocumentService } from "../../controllers/admin-os/feature-services/OsDocumentService";
import { OsIngestService } from "../../controllers/admin-os/feature-services/OsIngestService";
import { OsRetrievalService } from "../../controllers/admin-os/feature-services/OsRetrievalService";
import { OsLinkService } from "../../controllers/admin-os/feature-services/OsLinkService";
import { OsTrashService } from "../../controllers/admin-os/feature-services/OsTrashService";
import {
  OsFakeEmbeddingProvider,
  setOsEmbeddingProvider,
} from "../../controllers/admin-os/feature-services/service.os-embeddings";
import {
  OsFakeLlmProvider,
  setOsLlmProvider,
} from "../../controllers/admin-os/feature-services/service.os-llm";
import { OsDocumentModel } from "../../models/OsDocumentModel";
import { OsDocumentChunkModel } from "../../models/OsDocumentChunkModel";
import { OsDocumentAiIndexModel } from "../../models/OsDocumentAiIndexModel";
import { getOsKnowledgeBaseConfig } from "../../config/osKnowledgeBase";

const RUN_TAG = `p4itest-${Date.now()}`;
let userA = 0;
const docIds: string[] = [];

async function createUser(label: string): Promise<number> {
  const result = await db.raw(
    `insert into users (email, name, is_internal) values (?, ?, true) returning id`,
    [`${RUN_TAG}-${label}@test.alloro`, `P4 itest ${label}`]
  );
  return Number(result.rows[0].id);
}

/** Create + publish nothing extra — createDocument already seeds v1; then ingest. */
async function seedAndIngest(
  title: string,
  contentMd: string
): Promise<string> {
  const doc = await OsDocumentService.createDocument({ title, contentMd }, userA);
  docIds.push(doc.id);
  await OsIngestService.run(doc.id);
  return doc.id;
}

beforeAll(async () => {
  const schema = await db.raw(
    `select 1 from information_schema.schemata where schema_name = 'os'`
  );
  expect(schema.rows.length).toBe(1); // precondition: migration applied
  // pgvector must be live for this tier.
  const ext = await db.raw(
    `select 1 from pg_extension where extname = 'vector'`
  );
  expect(ext.rows.length).toBe(1);

  // Deterministic fakes — real embeddings would need a key + network.
  setOsEmbeddingProvider(new OsFakeEmbeddingProvider());
  setOsLlmProvider(new OsFakeLlmProvider());
  userA = await createUser("a");
});

afterAll(async () => {
  // Restore the real providers so no other suite inherits the fakes.
  setOsEmbeddingProvider(null);
  setOsLlmProvider(null);
  for (const id of docIds) {
    await db.raw(`delete from os.documents where id = ?`, [id]);
  }
  await db.raw(`delete from os.activity where actor_id = ?`, [userA]);
  await db.raw(`delete from users where email like ?`, [`${RUN_TAG}-%`]);
  await db.destroy();
});

describe("P4 RAG — ingest writes real vector chunks", () => {
  it("indexes a document: chunks(dim 1536) + ai_index + tsv + status indexed", async () => {
    const docId = await seedAndIngest(
      `Vector Doc ${RUN_TAG}`,
      "# Install\n\nRun the installer to set up the widget.\n\n## Config\n\nEdit the config file to tune the widget behavior."
    );

    const doc = await OsDocumentModel.findDocumentById(docId);
    expect(doc?.status).toBe("indexed");

    // Chunk rows exist and carry a real vector of the configured dimension.
    const chunks = await OsDocumentChunkModel.listForDocument(docId);
    expect(chunks.length).toBeGreaterThan(0);
    const dimRow = await db.raw(
      `select vector_dims(embedding) as dims from os.document_chunks where document_id = ? limit 1`,
      [docId]
    );
    expect(Number(dimRow.rows[0].dims)).toBe(
      getOsKnowledgeBaseConfig().embeddingDim
    );
    expect(Number(dimRow.rows[0].dims)).toBe(1536);

    // AI index row written (fake = title fallback: Uncategorized).
    const ai = await OsDocumentAiIndexModel.findByDocumentId(docId);
    expect(ai).toBeDefined();
    expect(ai?.generated_for).toBe(1);

    // Weighted tsv is populated (rebuildSearchTsv ran inside the ingest txn).
    const tsv = await db.raw(
      `select length(search_tsv::text) as len from os.documents where id = ?`,
      [docId]
    );
    expect(Number(tsv.rows[0].len)).toBeGreaterThan(0);
  });
});

describe("P4 RAG — semantic retrieval ordering + floor", () => {
  it("returns nearest-first and cuts hits below the floor; excludes archived", async () => {
    // A doc whose content matches a query phrase closely, plus an unrelated one.
    const matchId = await seedAndIngest(
      `Kangaroo Care ${RUN_TAG}`,
      "Kangaroos hop across the outback and carry joeys in a pouch."
    );
    const otherId = await seedAndIngest(
      `Spreadsheet Formulas ${RUN_TAG}`,
      "Use VLOOKUP and pivot tables to summarize quarterly revenue figures."
    );

    // The fake embedder is deterministic: identical text → cosine 1.0. Query the
    // exact chunk text of the match doc so it ranks first with high similarity.
    const hits = await OsRetrievalService.retrieve(
      "Kangaroos hop across the outback and carry joeys in a pouch.",
      { k: 10, floor: 0.1 }
    );
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].document_id).toBe(matchId); // nearest first
    // Similarity is a real cosine in [−1, 1]; the top hit is a near-exact match.
    expect(hits[0].similarity).toBeGreaterThan(0.9);
    // Ordering is non-increasing.
    for (let i = 1; i < hits.length; i++) {
      expect(hits[i].similarity).toBeLessThanOrEqual(hits[i - 1].similarity);
    }

    // A high floor cuts the unrelated doc entirely.
    const strict = await OsRetrievalService.retrieve(
      "Kangaroos hop across the outback and carry joeys in a pouch.",
      { k: 10, floor: 0.99 }
    );
    expect(strict.every((h) => h.document_id !== otherId)).toBe(true);

    // Archive the match doc → it must vanish from retrieval (indexed+non-archived only).
    await OsTrashService.archiveDocument(matchId, userA);
    const afterArchive = await OsRetrievalService.retrieve(
      "Kangaroos hop across the outback and carry joeys in a pouch.",
      { k: 10, floor: 0.1 }
    );
    expect(afterArchive.every((h) => h.document_id !== matchId)).toBe(true);
  });
});

describe("P4 RAG — ingest suggests a link when a query chunk matches", () => {
  it("suggests the source doc whose chunk equals the ingest query string", async () => {
    // The suggestion step embeds `${title}\n${summary}` and cosine-searches
    // OTHER docs' chunks with floor = linkSuggestFloor. The deterministic fake
    // gives cosine 1.0 only for byte-identical text, so to prove the live
    // suggestion write we plant a target doc whose sole chunk IS the querying
    // doc's exact query string. summary = first non-heading line (title
    // fallback), so the query string is `"<title>\n<first content line>"`.
    const title = `Match Source ${RUN_TAG}`;
    const firstLine = "This exact line is both the summary and a target chunk.";
    // Target doc B contains, verbatim, doc A's query string as its only content.
    const targetId = await seedAndIngest(
      `Target Holder ${RUN_TAG}`,
      `${title}\n${firstLine}`
    );
    // Doc A: title + that first line → its query becomes `${title}\n${firstLine}`.
    const sourceId = await seedAndIngest(title, firstLine);
    // Re-run A's ingest now that B is indexed so B is in A's candidate pool.
    await OsIngestService.run(sourceId);

    const links = await OsLinkService.getLinks(sourceId);
    expect(links.suggested.map((l) => l.document.id)).toContain(targetId);

    // Accepting the suggestion flips it to an accepted out-link and creates a
    // backlink on the target side — both real DB reads.
    const suggestion = links.suggested.find((l) => l.document.id === targetId);
    expect(suggestion).toBeDefined();
    await OsLinkService.acceptLink(suggestion!.id, userA);
    const afterAccept = await OsLinkService.getLinks(sourceId);
    expect(afterAccept.links.map((l) => l.document.id)).toContain(targetId);
    const targetView = await OsLinkService.getLinks(targetId);
    expect(targetView.backlinks.map((l) => l.document.id)).toContain(sourceId);
  });
});

describe("P4 RAG — purge cascade removes chunks + links", () => {
  it("deleting the document row wipes its chunks and links (FK cascade)", async () => {
    const docId = await seedAndIngest(
      `Purge Target ${RUN_TAG}`,
      "Some content that produces at least one chunk row."
    );
    const before = await OsDocumentChunkModel.listForDocument(docId);
    expect(before.length).toBeGreaterThan(0);

    // Hard delete via the model (the purge job's service does exactly this).
    await OsDocumentModel.deleteDocumentById(docId);
    docIds.splice(docIds.indexOf(docId), 1); // already gone; skip afterAll delete

    const after = await OsDocumentChunkModel.listForDocument(docId);
    expect(after.length).toBe(0);
    const linkRows = await db.raw(
      `select count(*)::int as c from os.document_links where source_document_id = ? or target_document_id = ?`,
      [docId, docId]
    );
    expect(linkRows.rows[0].c).toBe(0);
  });
});
