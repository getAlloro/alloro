import { db } from "../database/connection";
import { BaseModel, QueryContext } from "./BaseModel";

/** Chunk payload written by the ingest pipeline (embedding included). */
export interface INewOsDocumentChunk {
  chunkIndex: number;
  headingPath: string | null;
  content: string;
  tokenCount: number;
  embedding: number[];
}

/** Chunk row as read back (embedding column intentionally not selected). */
export interface IOsDocumentChunkRow {
  id: string;
  document_id: string;
  version_no: number;
  chunk_index: number;
  heading_path: string | null;
  content: string;
  token_count: number | null;
}

/** Cosine hit joined to its document — the retrieval/citation shape. */
export interface IOsChunkSearchHit {
  document_id: string;
  title: string;
  slug: string;
  version_no: number;
  chunk_index: number;
  heading_path: string | null;
  content: string;
  similarity: number;
}

export interface IOsChunkSearchOptions {
  k: number;
  /** Minimum cosine similarity (0..1); weaker hits are dropped in SQL. */
  floor: number;
  excludeDocumentId?: string;
}

const CHUNK_ROW_COLUMNS = [
  "id",
  "document_id",
  "version_no",
  "chunk_index",
  "heading_path",
  "content",
  "token_count",
] as const;

/**
 * os.document_chunks — embedded passages of the LIVE version of each document
 * (plans/07042026-alloro-os-admin-port, D4/D5). vector(1536) + HNSW cosine,
 * the exact minds.mind_brain_chunks pattern; all vector SQL is parameterized
 * (§10.2) with the pgvector literal riding a binding, never interpolation.
 *
 * §11.7 posture: os.* tables are internal-admin single-tenant by design;
 * isolation is the super-admin gate on every /api/admin/os route (§11.1).
 */
export class OsDocumentChunkModel extends BaseModel {
  protected static tableName = "os.document_chunks";

  /**
   * Atomic replace for one document's chunks — delete-then-insert keyed by
   * version_no so a re-run reproduces state (§21.1). Runs on the caller's
   * transaction when given (the ingest pipeline threads one, §10.5); opens
   * its own otherwise so the swap is never observable half-done.
   */
  static async replaceForDocument(
    documentId: string,
    versionNo: number,
    chunks: INewOsDocumentChunk[],
    trx?: QueryContext
  ): Promise<void> {
    const run = async (conn: QueryContext): Promise<void> => {
      await conn("os.document_chunks").where({ document_id: documentId }).del();
      if (chunks.length === 0) return;
      await conn("os.document_chunks").insert(
        chunks.map((chunk) => ({
          document_id: documentId,
          version_no: versionNo,
          chunk_index: chunk.chunkIndex,
          heading_path: chunk.headingPath,
          content: chunk.content,
          token_count: chunk.tokenCount,
          // pgvector accepts the JSON array literal; parameterized (§10.2).
          embedding: conn.raw("?::vector", [JSON.stringify(chunk.embedding)]),
        }))
      );
    };
    if (trx) return run(trx);
    return this.transaction(run);
  }

  /**
   * Cosine top-K over the HNSW index. Joins os.documents to return title/slug
   * and to exclude archived + not-yet-indexed documents; the similarity floor
   * is applied in SQL so weak matches never leave the database.
   */
  static async searchByEmbedding(
    embedding: number[],
    options: IOsChunkSearchOptions,
    trx?: QueryContext
  ): Promise<IOsChunkSearchHit[]> {
    const conn = trx || db;
    const vectorLiteral = JSON.stringify(embedding);
    const query = conn("os.document_chunks as c")
      .join("os.documents as d", "d.id", "c.document_id")
      .whereNull("d.archived_at")
      .where("d.status", "indexed")
      .whereRaw("1 - (c.embedding <=> ?::vector) >= ?", [
        vectorLiteral,
        options.floor,
      ])
      .select(
        "c.document_id",
        "c.version_no",
        "c.chunk_index",
        "c.heading_path",
        "c.content",
        "d.title",
        "d.slug"
      )
      .select(
        conn.raw("1 - (c.embedding <=> ?::vector) as similarity", [
          vectorLiteral,
        ])
      )
      .orderByRaw("c.embedding <=> ?::vector asc", [vectorLiteral])
      .limit(options.k);
    if (options.excludeDocumentId) {
      query.whereNot("c.document_id", options.excludeDocumentId);
    }
    const rows = await query;
    // pg returns numerics as numbers here, but coerce defensively for the
    // floor comparisons callers do on similarity.
    return (rows as IOsChunkSearchHit[]).map((row) => ({
      ...row,
      similarity: Number(row.similarity),
    }));
  }

  /** All chunk rows for a document, in order — verification/inspection reads. */
  static async listForDocument(
    documentId: string,
    trx?: QueryContext
  ): Promise<IOsDocumentChunkRow[]> {
    return this.table(trx)
      .select(...CHUNK_ROW_COLUMNS)
      .where({ document_id: documentId })
      .orderBy("chunk_index", "asc");
  }
}
