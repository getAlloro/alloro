/**
 * Hermetic tests — OS import intake + convert state machine (P6 T1/T3,
 * plans/07042026-alloro-os-admin-port). Every Os*Model is mocked at the model
 * seam, S3 is mocked (src/utils/core/s3), and the queue-job helpers are mocked,
 * so the REAL OsImportService + OsConversionService orchestration runs with no
 * DB, no S3, and no Redis. The live DB proof is p6-imports.itest.ts.
 *
 * Covers: batch intake (doc + import row + S3 archive + convert enqueue),
 * unsupported extension + bad mime → skipped, batch cap → OS_IMPORT_BATCH_TOO_
 * LARGE, and the convert state machine pending → converted (v1 written, ingest
 * enqueued) / failed (markFailed flips doc + import).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../models/OsDocumentModel", () => ({
  OsDocumentModel: {
    transaction: vi.fn(async (cb: (trx: unknown) => Promise<unknown>) => cb({})),
    createDocument: vi.fn(),
    findDocumentById: vi.fn(),
    slugExists: vi.fn(async () => false),
    setStatus: vi.fn(async () => 1),
    setCurrentVersion: vi.fn(async () => 1),
    rebuildSearchTsv: vi.fn(async () => {}),
  },
}));
vi.mock("../models/OsDocumentImportModel", () => ({
  OsDocumentImportModel: {
    createImport: vi.fn(),
    findById: vi.fn(),
    setStatus: vi.fn(async () => 1),
  },
}));
vi.mock("../models/OsDocumentVersionModel", () => ({
  OsDocumentVersionModel: {
    createVersion: vi.fn(async () => ({ id: "ver-1" })),
  },
}));
vi.mock("../models/OsDocumentDraftModel", () => ({
  OsDocumentDraftModel: { saveDraft: vi.fn(async () => {}) },
}));
vi.mock("../models/OsDocumentAiIndexModel", () => ({
  OsDocumentAiIndexModel: { setMeta: vi.fn(async () => {}) },
}));
vi.mock("../models/OsFolderModel", () => ({
  OsFolderModel: { findFolderById: vi.fn(async () => ({ id: "f1" })) },
}));
vi.mock("../models/OsActivityModel", () => ({
  OsActivityModel: { log: vi.fn(async () => {}) },
}));
vi.mock("../utils/core/s3", () => ({
  uploadToS3: vi.fn(async () => {}),
  getObjectBuffer: vi.fn(async () => Buffer.from("# Imported\n\nbody")),
}));
vi.mock("../controllers/admin-os/feature-utils/osQueueJobs", () => ({
  enqueueOsConvert: vi.fn(async () => {}),
  enqueueOsIngest: vi.fn(async () => {}),
}));
// Keep the asset-embed path a no-op passthrough (its own S3/model writes are
// covered elsewhere; here we assert the import/convert state machine).
vi.mock("../controllers/admin-os/feature-services/OsAssetService", () => ({
  OsAssetService: {
    embedExtractedImages: vi.fn(async (_id: string, markdown: string) => ({
      markdown,
      warnings: [],
    })),
  },
}));

import { OsImportService } from "../controllers/admin-os/feature-services/OsImportService";
import { OsConversionService } from "../controllers/admin-os/feature-services/OsConversionService";
import { OsDocumentModel } from "../models/OsDocumentModel";
import { OsDocumentImportModel } from "../models/OsDocumentImportModel";
import { OsDocumentVersionModel } from "../models/OsDocumentVersionModel";
import { uploadToS3 } from "../utils/core/s3";
import {
  enqueueOsConvert,
  enqueueOsIngest,
} from "../controllers/admin-os/feature-utils/osQueueJobs";

const ACTOR = 7;
const DOC_ID = "aaaaaaaa-0000-4000-8000-000000000001";
const IMPORT_ID = "bbbbbbbb-0000-4000-8000-000000000001";

function file(name: string, mime: string, size = 100): {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
} {
  return { originalname: name, mimetype: mime, size, buffer: Buffer.from("x") };
}

const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

beforeEach(() => {
  vi.clearAllMocks();
  (OsDocumentModel.createDocument as ReturnType<typeof vi.fn>).mockResolvedValue({
    id: DOC_ID,
    title: "Doc",
    status: "processing",
  });
  (OsDocumentImportModel.createImport as ReturnType<typeof vi.fn>).mockResolvedValue({
    id: IMPORT_ID,
    document_id: DOC_ID,
  });
  (OsDocumentModel.slugExists as ReturnType<typeof vi.fn>).mockResolvedValue(false);
});

describe("OsImportService.intake", () => {
  it("creates a doc + import row, archives to os/imports/, enqueues convert", async () => {
    const result = await OsImportService.intake([file("Notes.docx", DOCX_MIME)], ACTOR);
    expect(result.documents).toHaveLength(1);
    expect(result.skipped).toHaveLength(0);
    expect(result.documents[0]).toMatchObject({
      documentId: DOC_ID,
      importId: IMPORT_ID,
      filename: "Notes.docx",
      status: "processing",
    });
    // Import row carries the converter + a sanitized S3 archive key.
    const importArgs = (OsDocumentImportModel.createImport as ReturnType<typeof vi.fn>).mock
      .calls[0][0];
    expect(importArgs.converter).toBe("docx");
    expect(importArgs.source_s3_key).toBe(`os/imports/${DOC_ID}/Notes.docx`);
    expect(uploadToS3).toHaveBeenCalledWith(
      `os/imports/${DOC_ID}/Notes.docx`,
      expect.any(Buffer),
      DOCX_MIME
    );
    expect(enqueueOsConvert).toHaveBeenCalledWith(DOC_ID, IMPORT_ID);
  });

  it("sanitizes an unsafe filename into the S3 key", async () => {
    await OsImportService.intake(
      [file("../../etc/pa ss.docx", DOCX_MIME)],
      ACTOR
    );
    const importArgs = (OsDocumentImportModel.createImport as ReturnType<typeof vi.fn>).mock
      .calls[0][0];
    expect(importArgs.source_s3_key).not.toContain("..");
    expect(importArgs.source_s3_key).not.toContain("/etc/");
    expect(importArgs.source_s3_key).toMatch(/^os\/imports\/.+\/[\w.\-]+$/);
  });

  it("skips an unsupported extension without aborting the batch", async () => {
    const result = await OsImportService.intake(
      [file("virus.exe", "application/octet-stream"), file("ok.md", "text/markdown")],
      ACTOR
    );
    expect(result.documents).toHaveLength(1);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].filename).toBe("virus.exe");
  });

  it("skips a file whose mime is not on the allowlist", async () => {
    const result = await OsImportService.intake(
      [file("sneaky.pdf", "application/x-msdownload")],
      ACTOR
    );
    expect(result.documents).toHaveLength(0);
    expect(result.skipped[0].reason).toContain("content type");
  });

  it("rejects a batch over the configured file cap (→ 413 upstream)", async () => {
    const many = Array.from({ length: 21 }, (_, i) => file(`f${i}.md`, "text/markdown"));
    await expect(OsImportService.intake(many, ACTOR)).rejects.toMatchObject({
      code: "OS_IMPORT_BATCH_TOO_LARGE",
    });
  });
});

describe("OsConversionService state machine", () => {
  it("pending → converted: writes v1 markdown + enqueues ingest", async () => {
    (OsDocumentImportModel.findById as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: IMPORT_ID,
      document_id: DOC_ID,
      converter: "markdown",
      source_s3_key: `os/imports/${DOC_ID}/sample.md`,
      warnings: [],
      imported_by: ACTOR,
    });
    (OsDocumentModel.findDocumentById as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: DOC_ID,
      title: "Sample",
      current_version_id: null,
    });

    await OsConversionService.run(IMPORT_ID);

    expect(OsDocumentVersionModel.createVersion).toHaveBeenCalledTimes(1);
    const setStatusArgs = (OsDocumentImportModel.setStatus as ReturnType<typeof vi.fn>).mock
      .calls[0];
    expect(setStatusArgs[0]).toBe(IMPORT_ID);
    expect(setStatusArgs[1]).toBe("converted");
    // warnings is always an array (even when empty) — no silent caps.
    expect(Array.isArray(setStatusArgs[2])).toBe(true);
    expect(enqueueOsIngest).toHaveBeenCalledWith(DOC_ID);
  });

  it("idempotent re-run (v1 already written) just re-enqueues ingest", async () => {
    (OsDocumentImportModel.findById as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: IMPORT_ID,
      document_id: DOC_ID,
      converter: "markdown",
      source_s3_key: "k",
      warnings: ["prior warning"],
      imported_by: ACTOR,
    });
    (OsDocumentModel.findDocumentById as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: DOC_ID,
      title: "Sample",
      current_version_id: "ver-existing",
    });

    await OsConversionService.run(IMPORT_ID);

    // No new version on a re-run; status stays converted, ingest re-fires.
    expect(OsDocumentVersionModel.createVersion).not.toHaveBeenCalled();
    expect(OsDocumentImportModel.setStatus).toHaveBeenCalledWith(
      IMPORT_ID,
      "converted",
      ["prior warning"]
    );
    expect(enqueueOsIngest).toHaveBeenCalledWith(DOC_ID);
  });

  it("markFailed flips both the document and the import row to failed", async () => {
    (OsDocumentImportModel.findById as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: IMPORT_ID,
      document_id: DOC_ID,
      warnings: [],
    });

    await OsConversionService.markFailed(IMPORT_ID);

    expect(OsDocumentModel.setStatus).toHaveBeenCalledWith(DOC_ID, "processing_failed");
    expect(OsDocumentImportModel.setStatus).toHaveBeenCalledWith(IMPORT_ID, "failed", []);
  });
});
