/**
 * Trash lifecycle for OS documents (P2 T3): archive → trash list → restore
 * (back to processing + re-ingest) → purge (queued hard delete). The purge
 * WORKER calls purgeDocument here too (§21.3 — the job runs the same service
 * as the request path). Chunk/S3 cleanup rides the row CASCADE for now; the
 * S3 half arrives with assets in P6.
 */

import logger from "../../../lib/logger";
import {
  IOsDocumentListItem,
  OsDocumentModel,
} from "../../../models/OsDocumentModel";
import { OsActivityModel } from "../../../models/OsActivityModel";
import { OsError } from "../feature-utils/OsError";
import { enqueueOsIngest, enqueueOsPurge } from "../feature-utils/osQueueJobs";
import { OsLockService } from "./OsLockService";

function documentNotFound(documentId: string): never {
  throw new OsError("OS_DOCUMENT_NOT_FOUND", "Document not found.", {
    documentId,
  });
}

async function requireEnriched(
  documentId: string
): Promise<IOsDocumentListItem> {
  const document = await OsDocumentModel.findEnrichedById(documentId);
  if (!document) documentNotFound(documentId);
  return document;
}

export class OsTrashService {
  static async listTrash(pagination: {
    limit: number;
    offset: number;
  }): Promise<{ documents: IOsDocumentListItem[]; total: number }> {
    return OsDocumentModel.listPaginated({ archivedOnly: true }, pagination);
  }

  /** Soft-archive (idempotent) + force-release any edit lock. */
  static async archiveDocument(
    documentId: string,
    actorId: number
  ): Promise<IOsDocumentListItem> {
    const document = await OsDocumentModel.findDocumentById(documentId);
    if (!document) documentNotFound(documentId);
    if (document.archived_at) return requireEnriched(documentId);

    await OsDocumentModel.archiveDocument(documentId);
    await OsLockService.forceRelease(documentId);
    await OsActivityModel.log({
      actor_id: actorId,
      action: "document.archived",
      target_type: "document",
      target_id: documentId,
      metadata: { title: document.title },
    });
    return requireEnriched(documentId);
  }

  /** Un-trash: back to `processing`, then re-ingest rebuilds the index (P4). */
  static async restoreFromTrash(
    documentId: string,
    actorId: number
  ): Promise<IOsDocumentListItem> {
    const document = await OsDocumentModel.findDocumentById(documentId);
    if (!document) documentNotFound(documentId);
    if (!document.archived_at) {
      throw new OsError(
        "OS_DOCUMENT_NOT_ARCHIVED_CONFLICT",
        "Document is not in the trash.",
        { documentId }
      );
    }

    await OsDocumentModel.restoreDocument(documentId);
    await OsActivityModel.log({
      actor_id: actorId,
      action: "document.restored",
      target_type: "document",
      target_id: documentId,
      metadata: { title: document.title },
    });
    await enqueueOsIngest(documentId);
    return requireEnriched(documentId);
  }

  /** Queue the hard delete (only trashed documents are purgeable). */
  static async requestPurge(
    documentId: string,
    actorId: number
  ): Promise<{ queued: true }> {
    const document = await OsDocumentModel.findDocumentById(documentId);
    if (!document) documentNotFound(documentId);
    if (!document.archived_at) {
      throw new OsError(
        "OS_DOCUMENT_NOT_ARCHIVED_CONFLICT",
        "Move the document to the trash before purging it.",
        { documentId }
      );
    }

    await OsActivityModel.log({
      actor_id: actorId,
      action: "document.purge_requested",
      target_type: "document",
      target_id: documentId,
      metadata: { title: document.title },
    });
    await enqueueOsPurge(documentId);
    return { queued: true };
  }

  /**
   * The purge job body (§21.3): hard-delete the document row — CASCADE wipes
   * versions, drafts, ai_index, chunks, links, locks, comments, imports and
   * asset rows. Idempotent (§21.1): a repeat run finds nothing and no-ops.
   */
  static async purgeDocument(
    documentId: string
  ): Promise<{ purged: boolean; title: string | null }> {
    const document = await OsDocumentModel.findDocumentById(documentId);
    if (!document) {
      logger.info(
        { documentId },
        "[ADMIN-OS] purge: document already gone — treating as done"
      );
      return { purged: false, title: null };
    }

    await OsDocumentModel.deleteDocumentById(documentId);
    await OsActivityModel.log({
      actor_id: null,
      action: "document.purged",
      target_type: "document",
      target_id: documentId,
      metadata: { title: document.title, slug: document.slug },
    });
    logger.info(
      { documentId, title: document.title },
      "[ADMIN-OS] purge: document hard-deleted (cascade)"
    );
    return { purged: true, title: document.title };
  }
}
