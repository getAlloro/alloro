import { OsDocumentModel } from "../../../models/OsDocumentModel";
import { OsDocumentVersionModel } from "../../../models/OsDocumentVersionModel";
import { OsDocumentDraftModel } from "../../../models/OsDocumentDraftModel";
import {
  IOsDocumentImport,
  OsDocumentImportModel,
  OsImportConverter,
} from "../../../models/OsDocumentImportModel";
import { getObjectBuffer } from "../../../utils/core/s3";
import { parseToc } from "../feature-utils/osToc";
import { enqueueOsIngest } from "../feature-utils/osQueueJobs";
import { OsError } from "../feature-utils/OsError";
import { OsParsedDocument } from "../feature-utils/osConversionTypes";
import { OsAssetService } from "./OsAssetService";
import { convertDocx } from "./conversion/docxConverter";
import { convertXlsx } from "./conversion/xlsxConverter";
import { convertPdf } from "./conversion/pdfConverter";
import logger from "../../../lib/logger";

/**
 * OS import conversion (plans/07042026-alloro-os-admin-port, P6 T2/T3). The
 * convert worker (§21.3) calls run(importId); this dispatches raw bytes to the
 * right format converter, uploads extracted images to S3 as os.assets, writes
 * the document's v1 markdown, records warnings on the import row, and hands off
 * to the ingest pipeline (P4). Idempotent by import id (§21.1): a re-run whose
 * document already has v1 just re-triggers ingest.
 *
 * All DB access rides Os*Model (§7.4); the v1 write is transactional (§10.5).
 */

const FIRST_VERSION_NO = 1;

// Route raw bytes to the right converter. Markdown is a passthrough.
async function dispatch(
  converter: OsImportConverter,
  buffer: Buffer
): Promise<OsParsedDocument> {
  switch (converter) {
    case "docx":
      return convertDocx(buffer);
    case "xlsx":
      return convertXlsx(buffer);
    case "pdf":
      return convertPdf(buffer);
    case "markdown":
      return { markdown: buffer.toString("utf8"), images: [], warnings: [] };
    default:
      throw new OsError(
        "OS_IMPORT_UNSUPPORTED_CONVERTER",
        `No converter for "${converter}".`,
        { converter }
      );
  }
}

/**
 * Write v1 from converted markdown — the same shape as
 * OsDocumentService.createDocument's version write (version + current pointer +
 * seeded draft), in one transaction (§10.5). Also rebuilds the search_tsv so
 * the doc is FTS-visible immediately (ingest refreshes it again with the
 * summary/tags).
 */
async function writeFirstVersion(
  documentId: string,
  title: string,
  markdown: string,
  authorId: number | null
): Promise<void> {
  await OsDocumentModel.transaction(async (trx) => {
    const version = await OsDocumentVersionModel.createVersion(
      {
        document_id: documentId,
        version_no: FIRST_VERSION_NO,
        title,
        content_md: markdown,
        toc_json: parseToc(markdown),
        ai_change_summary: null,
        human_note: null,
        author_id: authorId,
      },
      trx
    );
    await OsDocumentModel.setCurrentVersion(documentId, version.id, trx);
    await OsDocumentDraftModel.saveDraft(
      documentId,
      markdown,
      FIRST_VERSION_NO,
      authorId,
      trx
    );
    await OsDocumentModel.rebuildSearchTsv(documentId, trx);
  });
}

async function requireImport(importId: string): Promise<IOsDocumentImport> {
  const imp = await OsDocumentImportModel.findById(importId);
  if (!imp) {
    throw new OsError("OS_IMPORT_NOT_FOUND", "Import record not found.", {
      importId,
    });
  }
  return imp;
}

export const OsConversionService = {
  /**
   * Convert an imported file into the document's v1 markdown, then hand off to
   * ingest. Idempotent (§21.1): if a prior attempt already wrote v1
   * (current_version_id is set atomically with the version), just mark the
   * import converted and re-trigger ingest.
   */
  async run(importId: string): Promise<void> {
    const imp = await requireImport(importId);
    const doc = await OsDocumentModel.findDocumentById(imp.document_id);
    if (!doc) {
      throw new OsError("OS_DOCUMENT_NOT_FOUND", "Document not found.", {
        documentId: imp.document_id,
      });
    }
    if (!imp.converter || !imp.source_s3_key) {
      throw new OsError(
        "OS_IMPORT_INCOMPLETE",
        "Import row is missing its converter or source key.",
        { importId }
      );
    }

    if (doc.current_version_id) {
      await OsDocumentImportModel.setStatus(
        imp.id,
        "converted",
        imp.warnings ?? []
      );
      await enqueueOsIngest(imp.document_id);
      return;
    }

    const raw = await getObjectBuffer(imp.source_s3_key);
    const parsed = await dispatch(imp.converter, raw);
    const embedded = await OsAssetService.embedExtractedImages(
      imp.document_id,
      parsed.markdown,
      parsed.images,
      imp.imported_by
    );
    const warnings = [...parsed.warnings, ...embedded.warnings];
    if (!embedded.markdown.trim()) {
      warnings.push("No readable text could be extracted from this file.");
    }

    await writeFirstVersion(
      imp.document_id,
      doc.title,
      embedded.markdown,
      imp.imported_by
    );
    await OsDocumentImportModel.setStatus(imp.id, "converted", warnings);
    logger.info(
      {
        documentId: imp.document_id,
        importId: imp.id,
        converter: imp.converter,
        warnings: warnings.length,
      },
      "[ADMIN-OS] document converted from imported file"
    );
    await enqueueOsIngest(imp.document_id);
  },

  /**
   * Convert job exhausted its retries — flip both the document and its
   * provenance row to failed (§21.4). Best-effort per side.
   */
  async markFailed(importId: string): Promise<void> {
    const imp = await OsDocumentImportModel.findById(importId);
    if (!imp) return;
    await OsDocumentModel.setStatus(imp.document_id, "processing_failed");
    await OsDocumentImportModel.setStatus(imp.id, "failed", imp.warnings ?? []);
  },
};
