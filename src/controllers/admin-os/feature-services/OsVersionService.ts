/**
 * Version history for OS documents: paginated list, line-diff between any two
 * versions (or a version and the live draft), and non-destructive restore —
 * restoring v{k} appends v(N+1) with v{k}'s content (§10.5 transactional).
 */

import {
  IOsDocumentVersion,
  OsDocumentVersionModel,
} from "../../../models/OsDocumentVersionModel";
import { OsDocumentDraftModel } from "../../../models/OsDocumentDraftModel";
import { IOsDocument, OsDocumentModel } from "../../../models/OsDocumentModel";
import { OsActivityModel } from "../../../models/OsActivityModel";
import { OsError } from "../feature-utils/OsError";
import { parseToc } from "../feature-utils/osToc";
import { lineDiff, OsDiffHunk } from "../feature-utils/osLineDiff";
import { enqueueOsIngest } from "../feature-utils/osQueueJobs";
import { OsLockService } from "./OsLockService";

/** Token addressing the autosave draft instead of a numbered version. */
export const OS_DIFF_DRAFT_TOKEN = "draft";

export interface OsVersionDiffResult {
  from: string;
  to: string;
  hunks: OsDiffHunk[];
}

async function requireDocument(documentId: string): Promise<IOsDocument> {
  const document = await OsDocumentModel.findDocumentById(documentId);
  if (!document) {
    throw new OsError("OS_DOCUMENT_NOT_FOUND", "Document not found.", {
      documentId,
    });
  }
  return document;
}

async function requireVersion(
  documentId: string,
  versionNo: number
): Promise<IOsDocumentVersion> {
  const version = await OsDocumentVersionModel.findByVersionNo(
    documentId,
    versionNo
  );
  if (!version) {
    throw new OsError("OS_VERSION_NOT_FOUND", "Version not found.", {
      documentId,
      versionNo,
    });
  }
  return version;
}

async function resolveDiffToken(
  documentId: string,
  token: string
): Promise<{ label: string; content: string }> {
  if (token === OS_DIFF_DRAFT_TOKEN) {
    const draft = await OsDocumentDraftModel.findByDocumentId(documentId);
    return { label: OS_DIFF_DRAFT_TOKEN, content: draft?.content_md ?? "" };
  }
  const versionNo = Number(token);
  if (!Number.isInteger(versionNo) || versionNo < 1) {
    throw new OsError(
      "OS_VERSION_NOT_FOUND",
      `Invalid version token "${token}" — use a version number or "draft".`,
      { documentId, token }
    );
  }
  const version = await requireVersion(documentId, versionNo);
  return { label: `v${version.version_no}`, content: version.content_md };
}

export class OsVersionService {
  static async listVersions(
    documentId: string,
    pagination: { limit: number; offset: number }
  ): Promise<{ versions: IOsDocumentVersion[]; total: number }> {
    await requireDocument(documentId);
    return OsDocumentVersionModel.listForDocumentPaginated(
      documentId,
      pagination
    );
  }

  static async getVersion(
    documentId: string,
    versionNo: number
  ): Promise<IOsDocumentVersion> {
    await requireDocument(documentId);
    return requireVersion(documentId, versionNo);
  }

  /** Diff two versions, or a version vs the draft ("draft" token, either side). */
  static async diff(
    documentId: string,
    fromToken: string,
    toToken: string
  ): Promise<OsVersionDiffResult> {
    await requireDocument(documentId);
    const from = await resolveDiffToken(documentId, fromToken);
    const to = await resolveDiffToken(documentId, toToken);
    return {
      from: from.label,
      to: to.label,
      hunks: lineDiff(from.content, to.content),
    };
  }

  /** Non-destructive restore: append v(N+1) equal to v{k}; never rewrites history. */
  static async restoreVersion(
    documentId: string,
    versionNo: number,
    actorId: number
  ): Promise<IOsDocumentVersion> {
    const document = await requireDocument(documentId);
    if (document.archived_at) {
      throw new OsError(
        "OS_DOCUMENT_ARCHIVED_CONFLICT",
        "Archived documents cannot be restored to a version — un-trash it first.",
        { documentId }
      );
    }
    await OsLockService.assertNoForeignLiveLock(documentId, actorId);

    const target = await requireVersion(documentId, versionNo);
    const liveNo = await OsDocumentVersionModel.maxVersionNo(documentId);
    if (versionNo === liveNo) {
      throw new OsError(
        "OS_VERSION_RESTORE_NOOP",
        "That is already the live version."
      );
    }

    const nextNo = liveNo + 1;
    const version = await OsDocumentModel.transaction(async (trx) => {
      const created = await OsDocumentVersionModel.createVersion(
        {
          document_id: documentId,
          version_no: nextNo,
          // Content reverts; the current title carries forward.
          title: document.title,
          content_md: target.content_md,
          toc_json: parseToc(target.content_md),
          ai_change_summary: `Reverted to v${versionNo}`,
          human_note: null,
          author_id: actorId,
        },
        trx
      );
      await OsDocumentModel.setCurrentVersion(documentId, created.id, trx);
      await OsDocumentDraftModel.removeDraft(documentId, trx);
      await OsDocumentModel.rebuildSearchTsv(documentId, trx);
      return created;
    });

    await OsActivityModel.log({
      actor_id: actorId,
      action: "document.reverted",
      target_type: "document",
      target_id: documentId,
      metadata: { to_version: versionNo, new_version: nextNo },
    });
    await enqueueOsIngest(documentId);
    return version;
  }
}
