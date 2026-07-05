/**
 * Document lifecycle for the OS Library (plans/07042026-alloro-os-admin-port,
 * P2 T2; port of alloro-os DocumentService). Create seeds v1 + draft and
 * enqueues ingest; publish is transactional (§10.5): version N+1 → bump
 * current_version_id → clear draft → rebuild tsv, then activity + re-ingest.
 * All DB access rides Os*Model (§7.4); every state change writes activity.
 */

import {
  IOsDocument,
  IOsDocumentListFilters,
  IOsDocumentListItem,
  OsDocumentModel,
} from "../../../models/OsDocumentModel";
import {
  IOsDocumentVersion,
  OsDocumentVersionModel,
} from "../../../models/OsDocumentVersionModel";
import {
  IOsDocumentDraft,
  OsDocumentDraftModel,
} from "../../../models/OsDocumentDraftModel";
import { OsDocumentAiIndexModel } from "../../../models/OsDocumentAiIndexModel";
import { OsFolderModel } from "../../../models/OsFolderModel";
import { OsAdminUserModel } from "../../../models/OsAdminUserModel";
import { OsActivityModel } from "../../../models/OsActivityModel";
import { OsError } from "../feature-utils/OsError";
import { slugifyTitle } from "../feature-utils/osSlug";
import { parseToc } from "../feature-utils/osToc";
import { hasChanges } from "../feature-utils/osLineDiff";
import { enqueueOsIngest } from "../feature-utils/osQueueJobs";
import { OsLockService } from "./OsLockService";

export interface CreateOsDocumentInput {
  title: string;
  folderId?: string | null;
  contentMd?: string;
}

export interface PublishOsVersionInput {
  baseVersion: number;
  summary?: string | null;
  note?: string | null;
}

export interface UpdateOsMetaInput {
  folderId?: string | null;
  ownerId?: number | null;
  category?: string | null;
  tags?: string[];
}

/** Bounded slug-collision probing before falling back to a timestamp suffix. */
const OS_SLUG_MAX_SUFFIX_ATTEMPTS = 50;
const FIRST_VERSION_NO = 1;

function documentNotFound(documentId: string): never {
  throw new OsError("OS_DOCUMENT_NOT_FOUND", "Document not found.", {
    documentId,
  });
}

async function requireDocument(documentId: string): Promise<IOsDocument> {
  const document = await OsDocumentModel.findDocumentById(documentId);
  if (!document) documentNotFound(documentId);
  return document;
}

async function requireEnriched(
  documentId: string
): Promise<IOsDocumentListItem> {
  const document = await OsDocumentModel.findEnrichedById(documentId);
  if (!document) documentNotFound(documentId);
  return document;
}

async function assertFolderExists(
  folderId: string | null | undefined
): Promise<void> {
  if (!folderId) return;
  const folder = await OsFolderModel.findFolderById(folderId);
  if (!folder) {
    throw new OsError("OS_FOLDER_NOT_FOUND", "Folder not found.", { folderId });
  }
}

/** Unique slug for a title, probing -2, -3, … past collisions. */
async function ensureUniqueSlug(
  title: string,
  excludeId?: string
): Promise<string> {
  const base = slugifyTitle(title);
  if (!(await OsDocumentModel.slugExists(base, excludeId))) return base;
  for (let suffix = 2; suffix <= OS_SLUG_MAX_SUFFIX_ATTEMPTS; suffix++) {
    const candidate = `${base}-${suffix}`;
    if (!(await OsDocumentModel.slugExists(candidate, excludeId))) {
      return candidate;
    }
  }
  return `${base}-${Date.now()}`;
}

export class OsDocumentService {
  /** Create → doc(status processing) + v1 + seeded draft + tsv, then ingest. */
  static async createDocument(
    input: CreateOsDocumentInput,
    actorId: number
  ): Promise<IOsDocumentListItem> {
    const content = input.contentMd ?? "";
    await assertFolderExists(input.folderId);
    const slug = await ensureUniqueSlug(input.title);

    const documentId = await OsDocumentModel.transaction(async (trx) => {
      const created = await OsDocumentModel.createDocument(
        {
          title: input.title,
          slug,
          folder_id: input.folderId ?? null,
          status: "processing",
          owner_id: actorId,
          created_by: actorId,
        },
        trx
      );
      const version = await OsDocumentVersionModel.createVersion(
        {
          document_id: created.id,
          version_no: FIRST_VERSION_NO,
          title: input.title,
          content_md: content,
          toc_json: parseToc(content),
          ai_change_summary: null,
          human_note: null,
          author_id: actorId,
        },
        trx
      );
      await OsDocumentModel.setCurrentVersion(created.id, version.id, trx);
      await OsDocumentDraftModel.saveDraft(
        created.id,
        content,
        FIRST_VERSION_NO,
        actorId,
        trx
      );
      await OsDocumentModel.rebuildSearchTsv(created.id, trx);
      return created.id;
    });

    await OsActivityModel.log({
      actor_id: actorId,
      action: "document.created",
      target_type: "document",
      target_id: documentId,
    });
    await enqueueOsIngest(documentId);
    return requireEnriched(documentId);
  }

  static async listDocuments(
    filters: IOsDocumentListFilters,
    pagination: { limit: number; offset: number }
  ): Promise<{ documents: IOsDocumentListItem[]; total: number }> {
    return OsDocumentModel.listPaginated(filters, pagination);
  }

  static async getDocument(documentId: string): Promise<{
    document: IOsDocumentListItem;
    version: IOsDocumentVersion | null;
  }> {
    const document = await requireEnriched(documentId);
    const version = document.current_version_id
      ? ((await OsDocumentVersionModel.findVersionById(
          document.current_version_id
        )) ?? null)
      : null;
    return { document, version };
  }

  /** Rename: new title + regenerated slug (collision-suffixed) + tsv rebuild. */
  static async renameDocument(
    documentId: string,
    title: string,
    actorId: number
  ): Promise<IOsDocumentListItem> {
    const document = await requireDocument(documentId);
    if (title === document.title) return requireEnriched(documentId);

    const slug = await ensureUniqueSlug(title, documentId);
    await OsDocumentModel.transaction(async (trx) => {
      await OsDocumentModel.updateTitleAndSlug(documentId, title, slug, trx);
      await OsDocumentModel.rebuildSearchTsv(documentId, trx);
    });
    await OsActivityModel.log({
      actor_id: actorId,
      action: "document.renamed",
      target_type: "document",
      target_id: documentId,
      metadata: { from: document.title, to: title },
    });
    return requireEnriched(documentId);
  }

  /**
   * Metadata edit: folder/owner land on documents; category/tags land on the
   * AI index and set meta_locked (a human now owns the taxonomy — re-ingest
   * may only refresh the summary afterwards).
   */
  static async updateMeta(
    documentId: string,
    patch: UpdateOsMetaInput,
    actorId: number
  ): Promise<IOsDocumentListItem> {
    await requireDocument(documentId);
    if (patch.folderId !== undefined) await assertFolderExists(patch.folderId);
    if (patch.ownerId !== undefined && patch.ownerId !== null) {
      const owner = await OsAdminUserModel.findInternalUserById(patch.ownerId);
      if (!owner) {
        throw new OsError(
          "OS_OWNER_NOT_FOUND",
          "Owner is not a known internal user.",
          { ownerId: patch.ownerId }
        );
      }
    }

    const documentPatch: { folder_id?: string | null; owner_id?: number | null } =
      {};
    if (patch.folderId !== undefined) documentPatch.folder_id = patch.folderId;
    if (patch.ownerId !== undefined) documentPatch.owner_id = patch.ownerId;

    const touchesTaxonomy =
      patch.category !== undefined || patch.tags !== undefined;
    await OsDocumentModel.transaction(async (trx) => {
      if (Object.keys(documentPatch).length) {
        await OsDocumentModel.updateDocumentMeta(documentId, documentPatch, trx);
      }
      if (touchesTaxonomy) {
        await OsDocumentAiIndexModel.setMeta(
          documentId,
          { category: patch.category, tags: patch.tags },
          trx
        );
      }
      await OsDocumentModel.rebuildSearchTsv(documentId, trx);
    });

    await OsActivityModel.log({
      actor_id: actorId,
      action: "document.meta_updated",
      target_type: "document",
      target_id: documentId,
      metadata: { fields: Object.keys(patch) },
    });
    return requireEnriched(documentId);
  }

  /** Autosave target; seeded from the live version on first open. */
  static async getDraft(
    documentId: string,
    actorId: number
  ): Promise<IOsDocumentDraft> {
    const document = await requireDocument(documentId);
    const existing = await OsDocumentDraftModel.findByDocumentId(documentId);
    if (existing) return existing;

    const live = document.current_version_id
      ? await OsDocumentVersionModel.findVersionById(document.current_version_id)
      : undefined;
    await OsDocumentDraftModel.saveDraft(
      documentId,
      live?.content_md ?? "",
      live?.version_no ?? null,
      actorId
    );
    const seeded = await OsDocumentDraftModel.findByDocumentId(documentId);
    if (!seeded) documentNotFound(documentId);
    return seeded;
  }

  /** Lock-gated autosave: rejected only while someone ELSE holds a live lock. */
  static async saveDraft(
    documentId: string,
    contentMd: string,
    baseVersion: number | null,
    actorId: number
  ): Promise<IOsDocumentDraft> {
    await requireDocument(documentId);
    await OsLockService.assertNoForeignLiveLock(documentId, actorId);
    await OsDocumentDraftModel.saveDraft(
      documentId,
      contentMd,
      baseVersion,
      actorId
    );
    const draft = await OsDocumentDraftModel.findByDocumentId(documentId);
    if (!draft) documentNotFound(documentId);
    return draft;
  }

  /**
   * Publish v(N+1) from the draft — transactional (§10.5). 409 on a stale
   * base or a foreign live lock; 400 when there is nothing to version.
   */
  static async publishVersion(
    documentId: string,
    input: PublishOsVersionInput,
    actorId: number
  ): Promise<IOsDocumentVersion> {
    const document = await requireDocument(documentId);
    if (document.archived_at) {
      throw new OsError(
        "OS_DOCUMENT_ARCHIVED_CONFLICT",
        "Archived documents cannot be published — restore it first.",
        { documentId }
      );
    }
    await OsLockService.assertNoForeignLiveLock(documentId, actorId);

    const liveNo = await OsDocumentVersionModel.maxVersionNo(documentId);
    if (input.baseVersion !== liveNo) {
      throw new OsError(
        "OS_VERSION_CONFLICT",
        "This document changed since you started.",
        { current_version: liveNo }
      );
    }

    const draft = await OsDocumentDraftModel.findByDocumentId(documentId);
    const live = document.current_version_id
      ? await OsDocumentVersionModel.findVersionById(document.current_version_id)
      : undefined;
    const content = draft?.content_md ?? live?.content_md ?? "";
    const titleChanged = live ? live.title !== document.title : false;
    if (live && !hasChanges(live.content_md, content) && !titleChanged) {
      throw new OsError("OS_VERSION_NO_CHANGES", "Nothing to version.");
    }

    const nextNo = liveNo + 1;
    const version = await OsDocumentModel.transaction(async (trx) => {
      const created = await OsDocumentVersionModel.createVersion(
        {
          document_id: documentId,
          version_no: nextNo,
          title: document.title,
          content_md: content,
          toc_json: parseToc(content),
          ai_change_summary: input.summary ?? null,
          human_note: input.note ?? null,
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
      action: "document.version_published",
      target_type: "version",
      target_id: version.id,
      metadata: { document_id: documentId, version_no: nextNo },
    });
    await enqueueOsIngest(documentId);
    return version;
  }

  /** Flip back to processing + re-enqueue ingest (idempotent; 202 upstream). */
  static async reindexDocument(
    documentId: string,
    actorId: number
  ): Promise<IOsDocumentListItem> {
    const document = await requireDocument(documentId);
    if (document.archived_at) {
      throw new OsError(
        "OS_DOCUMENT_ARCHIVED_CONFLICT",
        "Archived documents cannot be reindexed — restore it first.",
        { documentId }
      );
    }
    if (document.status !== "processing") {
      await OsDocumentModel.setStatus(documentId, "processing");
      await OsActivityModel.log({
        actor_id: actorId,
        action: "document.reindexed",
        target_type: "document",
        target_id: documentId,
      });
      await enqueueOsIngest(documentId);
    }
    return requireEnriched(documentId);
  }
}
