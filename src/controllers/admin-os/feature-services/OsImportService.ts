import { OsDocumentModel } from "../../../models/OsDocumentModel";
import { OsDocumentImportModel } from "../../../models/OsDocumentImportModel";
import { OsDocumentAiIndexModel } from "../../../models/OsDocumentAiIndexModel";
import { OsFolderModel } from "../../../models/OsFolderModel";
import { OsActivityModel } from "../../../models/OsActivityModel";
import { uploadToS3 } from "../../../utils/core/s3";
import { getOsKnowledgeBaseConfig } from "../../../config/osKnowledgeBase";
import { OsError } from "../feature-utils/OsError";
import { slugifyTitle } from "../feature-utils/osSlug";
import { enqueueOsConvert } from "../feature-utils/osQueueJobs";
import type { OsImportConverter } from "../../../models/OsDocumentImportModel";
import logger from "../../../lib/logger";

/**
 * OS batch file import (plans/07042026-alloro-os-admin-port, P6 T1). Each
 * uploaded file becomes its own document in `processing` with an
 * os.document_imports provenance row, its bytes archived to S3
 * (os/imports/{docId}/{filename}, D9), and a convert job queued. Unsupported
 * types and hard per-file failures are collected in `skipped` so one bad file
 * never aborts the batch. An optional category is applied to every document in
 * the batch (grouped import).
 *
 * Boundary safety (§5.2/§11.2): the controller enforces the mime+extension
 * allowlist and size/count caps BEFORE calling intake; this service re-derives
 * the converter defensively and sanitizes the archive filename. All DB access
 * rides Os*Model (§7.4); the doc + import-row creation is transactional (§10.5).
 */

const DEFAULT_MIME = "application/octet-stream";

// Extension → converter. The four target formats plus a markdown passthrough.
const EXT_CONVERTER: Record<string, OsImportConverter> = {
  docx: "docx",
  xlsx: "xlsx",
  xls: "xlsx",
  pdf: "pdf",
  md: "markdown",
  markdown: "markdown",
};

// Mime allowlist (§5.2). Keyed to the same four formats; octet-stream and a few
// browser-ambiguous mimes are tolerated because the extension is authoritative.
const ALLOWED_MIMES = new Set([
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "application/pdf",
  "text/markdown",
  "text/x-markdown",
  "text/plain",
  DEFAULT_MIME,
  "",
]);

export interface OsIntakeFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

export interface OsIntakeOptions {
  category?: string | null;
  folderId?: string | null;
}

export interface OsIntakeStub {
  documentId: string;
  importId: string;
  title: string;
  filename: string;
  status: string;
}

export interface OsIntakeSkipped {
  filename: string;
  reason: string;
}

export interface OsIntakeResult {
  documents: OsIntakeStub[];
  skipped: OsIntakeSkipped[];
}

function extensionOf(filename: string): string {
  return filename.split(".").pop()?.toLowerCase() ?? "";
}

function resolveConverter(filename: string): OsImportConverter | null {
  return EXT_CONVERTER[extensionOf(filename)] ?? null;
}

/**
 * Filesystem-safe archive filename (§5.2): drop path separators + odd chars,
 * collapse any dot run (so "../.." can't produce traversal segments) to a single
 * dot, and trim leading dots. Keeps a normal "name.ext" shape.
 */
function sanitizeFilename(filename: string): string {
  const base = filename
    .replace(/[^\w.\-]+/g, "_") // non-word/dot/dash → underscore
    .replace(/\.{2,}/g, ".") // collapse ".." (and longer) to a single dot
    .replace(/^[._]+/, ""); // no leading dots/underscores
  return base.slice(0, 200) || "upload";
}

/** Title from the filename, extension stripped. */
function titleFromFilename(filename: string): string {
  return filename.replace(/\.[^.]+$/, "").trim() || "Untitled";
}

/** Unique slug for a title, probing -2, -3, … past collisions. */
const OS_SLUG_MAX_SUFFIX_ATTEMPTS = 50;
async function ensureUniqueSlug(title: string): Promise<string> {
  const base = slugifyTitle(title);
  if (!(await OsDocumentModel.slugExists(base))) return base;
  for (let suffix = 2; suffix <= OS_SLUG_MAX_SUFFIX_ATTEMPTS; suffix++) {
    const candidate = `${base}-${suffix}`;
    if (!(await OsDocumentModel.slugExists(candidate))) return candidate;
  }
  return `${base}-${Date.now()}`;
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

/**
 * Create the document shell + provenance row in one transaction (§10.5),
 * archive the original bytes to S3, then queue conversion. On any failure the
 * transaction rolls back (no half-made doc) — the caller marks the file skipped.
 */
async function intakeOne(
  file: OsIntakeFile,
  converter: OsImportConverter,
  actorId: number,
  options: OsIntakeOptions
): Promise<OsIntakeStub> {
  const title = titleFromFilename(file.originalname);
  const slug = await ensureUniqueSlug(title);
  const category = options.category?.trim() || null;
  const folderId = options.folderId ?? null;
  const mime = file.mimetype || DEFAULT_MIME;
  const safeName = sanitizeFilename(file.originalname);

  const created = await OsDocumentModel.transaction(async (trx) => {
    const document = await OsDocumentModel.createDocument(
      {
        title,
        slug,
        folder_id: folderId,
        status: "processing",
        owner_id: actorId,
        created_by: actorId,
      },
      trx
    );
    const key = `os/imports/${document.id}/${safeName}`;
    const imp = await OsDocumentImportModel.createImport(
      {
        document_id: document.id,
        original_filename: file.originalname,
        source_mime: mime,
        source_s3_key: key,
        size_bytes: file.size,
        converter,
        imported_by: actorId,
      },
      trx
    );
    if (category) {
      await OsDocumentAiIndexModel.setMeta(document.id, { category }, trx);
    }
    return { document, imp, key };
  });

  // S3 archive + convert enqueue happen AFTER the row commit: the source key is
  // already recorded, so a failed upload leaves a recoverable pending import
  // (reindex/re-import can retry) rather than a phantom doc.
  await uploadToS3(created.key, file.buffer, mime);
  await OsActivityModel.log({
    actor_id: actorId,
    action: "document.imported",
    target_type: "document",
    target_id: created.document.id,
    metadata: { converter, filename: file.originalname },
  });
  await enqueueOsConvert(created.document.id, created.imp.id);

  return {
    documentId: created.document.id,
    importId: created.imp.id,
    title: created.document.title,
    filename: file.originalname,
    status: created.document.status,
  };
}

export const OsImportService = {
  /**
   * Batch intake. Each file becomes its own document; unsupported types and
   * per-file failures land in `skipped`. Caps are enforced at the controller
   * boundary (413) BEFORE this runs; the mime/extension allowlist is re-checked
   * here defensively (§5.2).
   */
  async intake(
    files: OsIntakeFile[],
    actorId: number,
    options: OsIntakeOptions = {}
  ): Promise<OsIntakeResult> {
    const { importBatchMaxFiles } = getOsKnowledgeBaseConfig();
    if (files.length > importBatchMaxFiles) {
      throw new OsError(
        "OS_IMPORT_BATCH_TOO_LARGE",
        `A batch may contain at most ${importBatchMaxFiles} files.`,
        { max: importBatchMaxFiles, received: files.length }
      );
    }
    await assertFolderExists(options.folderId);

    const documents: OsIntakeStub[] = [];
    const skipped: OsIntakeSkipped[] = [];
    for (const file of files) {
      const converter = resolveConverter(file.originalname);
      if (!converter) {
        skipped.push({
          filename: file.originalname,
          reason: "Unsupported file type. Accepted: docx, pdf, xls, xlsx, md.",
        });
        continue;
      }
      if (!ALLOWED_MIMES.has(file.mimetype)) {
        skipped.push({
          filename: file.originalname,
          reason: `Unsupported content type (${file.mimetype}).`,
        });
        continue;
      }
      try {
        documents.push(await intakeOne(file, converter, actorId, options));
      } catch (error) {
        if (error instanceof OsError && error.code === "OS_FOLDER_NOT_FOUND") {
          throw error; // a bad batch folder is a request error, not a skip
        }
        logger.error(
          { err: error, filename: file.originalname },
          "[ADMIN-OS] file import intake failed"
        );
        skipped.push({
          filename: file.originalname,
          reason: "Could not start import for this file.",
        });
      }
    }
    return { documents, skipped };
  },
};
