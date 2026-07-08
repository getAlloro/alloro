/**
 * Semantic retrieval over os.document_chunks (plans/07042026-alloro-os-
 * admin-port, P4 T4; port of alloro-os RetrievalService). Single-stage vector
 * retrieval: embed the query through the provider seam, cosine top-K with the
 * similarity floor applied in SQL — weak matches are dropped, never padded.
 * Only indexed, non-archived documents are ever retrieved (model-enforced).
 *
 * P5 chat reuses retrieve() as its grounding step; the citation shape is
 * { document_id, version_no, chunk_index, heading_path } off these hits.
 * K and floor default from config (§4.2) and are override-able per call.
 */

import { getOsKnowledgeBaseConfig } from "../../../config/osKnowledgeBase";
import {
  IOsChunkSearchHit,
  OsDocumentChunkModel,
} from "../../../models/OsDocumentChunkModel";
import { getOsEmbeddingProvider } from "./service.os-embeddings";

export type OsRetrievedChunk = IOsChunkSearchHit;

export interface OsRetrieveOptions {
  k?: number;
  floor?: number;
  excludeDocumentId?: string;
}

/** Passage preview length for the search surface (full content stays server-side). */
const OS_PASSAGE_SNIPPET_MAX = 280;

/** Semantic section row for GET /search — a hit trimmed for transport. */
export interface OsPassageHit {
  document_id: string;
  title: string;
  slug: string;
  version_no: number;
  chunk_index: number;
  heading_path: string | null;
  similarity: number;
  snippet: string;
}

export class OsRetrievalService {
  static async retrieve(
    queryText: string,
    options: OsRetrieveOptions = {}
  ): Promise<OsRetrievedChunk[]> {
    const trimmed = queryText.trim();
    if (!trimmed) return [];
    const config = getOsKnowledgeBaseConfig();
    const [queryVector] = await getOsEmbeddingProvider().embed([trimmed]);
    return OsDocumentChunkModel.searchByEmbedding(queryVector, {
      k: options.k ?? config.retrievalK,
      floor: options.floor ?? config.similarityFloor,
      excludeDocumentId: options.excludeDocumentId,
    });
  }

  /** The hybrid-search semantic section: retrieve, then trim for transport. */
  static async searchPassages(queryText: string): Promise<OsPassageHit[]> {
    const hits = await this.retrieve(queryText);
    return hits.map((hit) => ({
      document_id: hit.document_id,
      title: hit.title,
      slug: hit.slug,
      version_no: hit.version_no,
      chunk_index: hit.chunk_index,
      heading_path: hit.heading_path,
      similarity: hit.similarity,
      snippet:
        hit.content.length > OS_PASSAGE_SNIPPET_MAX
          ? `${hit.content.slice(0, OS_PASSAGE_SNIPPET_MAX).trimEnd()}…`
          : hit.content,
    }));
  }
}
