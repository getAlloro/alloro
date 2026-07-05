/**
 * OS ingest pipeline (plans/07042026-alloro-os-admin-port, P4 T3; port of
 * alloro-os/backend/src/services/rag/IngestService.ts). Full (re)index of a
 * document's LIVE version — ingest and reindex are the same operation, so
 * racing jobs converge on current state (§21.1 idempotency):
 *
 *   load doc + live version → AI metadata (title fallback on model failure —
 *   metadata NEVER gates the real index) → chunk → batch-embed → ONE
 *   transaction { replace chunks + upsert ai_index (meta_locked-aware) +
 *   rebuild weighted tsv } → link suggestions (non-fatal) → status indexed.
 *
 * Failures throw so BullMQ retries with backoff; the processor marks
 * processing_failed on the FINAL attempt via markFailed. All SQL lives in
 * Os*Models (§7.4); providers ride the injectable seams (§20.4).
 */

import logger from "../../../lib/logger";
import { getOsKnowledgeBaseConfig } from "../../../config/osKnowledgeBase";
import { OsDocumentModel } from "../../../models/OsDocumentModel";
import { OsDocumentVersionModel } from "../../../models/OsDocumentVersionModel";
import { OsDocumentAiIndexModel } from "../../../models/OsDocumentAiIndexModel";
import { OsDocumentChunkModel } from "../../../models/OsDocumentChunkModel";
import { OsDocumentLinkModel } from "../../../models/OsDocumentLinkModel";
import { OsChunkService } from "./OsChunkService";
import { getOsEmbeddingProvider } from "./service.os-embeddings";
import {
  OsDocMetadata,
  deriveOsTitleFallbackMetadata,
  getOsLlmProvider,
  isOsModelBusyError,
} from "./service.os-llm";

/** Link-suggestion knobs (§4.2): candidate pool → dedupe → top-N kept. */
const OS_LINK_SUGGEST_TOP_N = 5;
const OS_LINK_SUGGEST_CANDIDATE_POOL = 40;
/** First version fallback when a document somehow has no live version yet. */
const OS_FIRST_VERSION_NO = 1;

export class OsIngestService {
  /** The os-ingest job body (§21.3 — the worker calls this service). */
  static async run(documentId: string): Promise<void> {
    const document = await OsDocumentModel.findDocumentById(documentId);
    if (!document) {
      logger.info(
        { documentId },
        "[ADMIN-OS] ingest: document no longer exists — nothing to index"
      );
      return;
    }
    if (document.archived_at) {
      logger.info(
        { documentId },
        "[ADMIN-OS] ingest: document is archived — skipping"
      );
      return;
    }

    const version = document.current_version_id
      ? await OsDocumentVersionModel.findVersionById(document.current_version_id)
      : undefined;
    const content = version?.content_md ?? "";
    const versionNo = version?.version_no ?? OS_FIRST_VERSION_NO;

    // AI metadata is a nice-to-have and must NOT gate the real index
    // (chunks + embeddings + tsv don't depend on Gemini). Degrade on failure.
    const metadata = await this.safeDocMetadata(
      document.title,
      content,
      documentId
    );

    const chunks = OsChunkService.chunkMarkdown(content);
    const vectors = chunks.length
      ? await getOsEmbeddingProvider().embed(chunks.map((c) => c.content))
      : [];

    // ONE transaction (§10.5): chunk swap + AI index + weighted tsv move
    // together, so concurrent retrieval only ever reads a committed state.
    await OsDocumentModel.transaction(async (trx) => {
      await OsDocumentChunkModel.replaceForDocument(
        documentId,
        versionNo,
        chunks.map((chunk, i) => ({ ...chunk, embedding: vectors[i] })),
        trx
      );
      await OsDocumentAiIndexModel.upsertFromIngest(
        documentId,
        { ...metadata, generatedFor: versionNo },
        trx
      );
      await OsDocumentModel.rebuildSearchTsv(documentId, trx);
    });

    await this.suggestLinks(documentId, document.title, metadata.summary);
    await OsDocumentModel.setStatus(documentId, "indexed");
    logger.info(
      { documentId, versionNo, chunks: chunks.length },
      "[ADMIN-OS] ingest: document indexed"
    );
  }

  /** Final-attempt path — the processor calls this before surfacing the fail. */
  static async markFailed(documentId: string): Promise<void> {
    await OsDocumentModel.setStatus(documentId, "processing_failed");
  }

  /**
   * Gemini-backed metadata, degraded to the title fallback when the model is
   * busy (429/503), unreachable, or unparsable — a later reindex fills it in.
   */
  private static async safeDocMetadata(
    title: string,
    content: string,
    documentId: string
  ): Promise<OsDocMetadata> {
    try {
      return await getOsLlmProvider().generateDocMetadata(title, content);
    } catch (error) {
      logger.warn(
        { err: error, documentId, modelBusy: isOsModelBusyError(error) },
        "[ADMIN-OS] ingest: AI metadata unavailable — indexing with title-only fallback"
      );
      return deriveOsTitleFallbackMetadata(title, content);
    }
  }

  /**
   * Top-N semantically-similar OTHER documents → suggested links. Non-fatal:
   * a failure here never blocks indexing. The pair upsert skips any edge a
   * human already touched; the floor comes from config (§4.2).
   */
  private static async suggestLinks(
    documentId: string,
    title: string,
    summary: string
  ): Promise<void> {
    try {
      const config = getOsKnowledgeBaseConfig();
      const [queryVector] = await getOsEmbeddingProvider().embed([
        `${title}\n${summary}`.trim() || title,
      ]);
      const hits = await OsDocumentChunkModel.searchByEmbedding(queryVector, {
        k: OS_LINK_SUGGEST_CANDIDATE_POOL,
        floor: config.linkSuggestFloor,
        excludeDocumentId: documentId,
      });
      const suggested = new Set<string>();
      for (const hit of hits) {
        if (suggested.has(hit.document_id)) continue;
        suggested.add(hit.document_id);
        await OsDocumentLinkModel.suggestPair(documentId, hit.document_id);
        if (suggested.size >= OS_LINK_SUGGEST_TOP_N) break;
      }
    } catch (error) {
      logger.warn(
        { err: error, documentId },
        "[ADMIN-OS] ingest: link-suggestion step failed (non-fatal)"
      );
    }
  }
}
