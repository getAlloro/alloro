/**
 * P6 imports integration proof — REAL local Postgres, MOCKED S3
 * (plans/07042026-alloro-os-admin-port, P6 phase gate). Target: the disposable
 * local replica the worktree .env points at (alloro_admin_os_test), never
 * shared dev/prod. Schema `os` is already migrated (P1 leaves it so).
 *
 * S3 is mocked at the src/utils/core/s3 seam — NO real bucket, NO network — but
 * everything else is live: real os.documents / os.document_imports / os.assets /
 * os.document_versions rows, the transactional v1 write, and the FK cascade.
 * BullMQ is mocked too (no Redis). Every os.* row + synthetic user created here
 * is removed in afterAll, leaving the DB migrated + clean.
 *
 * Proves against live Postgres:
 *   1. intake: one file → doc(processing) + import row(pending) + S3 archive
 *      call + convert enqueue
 *   2. convert success: v1 markdown written, current_version_id set, import row
 *      → converted with its warnings, ingest enqueued
 *   3. docx image extraction: an os.assets row is written and the markdown ref
 *      is rewritten to /api/admin/os/assets/{id}
 *   4. convert failure: markFailed flips the doc → processing_failed and the
 *      import row → failed
 */

import fs from "fs";
import path from "path";
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";

vi.mock("../../workers/queues", () => {
  const add = vi.fn(async () => ({ id: "p6itest-job" }));
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

// Mock S3: capture uploads, serve fixture bytes for the archived key. No bucket.
const uploaded = new Map<string, Buffer>();
vi.mock("../../utils/core/s3", () => ({
  uploadToS3: vi.fn(async (key: string, body: Buffer) => {
    uploaded.set(key, body);
  }),
  getObjectBuffer: vi.fn(async (key: string) => {
    const body = uploaded.get(key);
    if (!body) throw new Error(`no mocked object at ${key}`);
    return body;
  }),
  deleteFromS3: vi.fn(async () => {}),
  generatePresignedUrl: vi.fn(async (key: string) => `https://s3.test/${key}?sig=x`),
}));

import { db } from "../../database/connection";
import { OsImportService } from "../../controllers/admin-os/feature-services/OsImportService";
import { OsConversionService } from "../../controllers/admin-os/feature-services/OsConversionService";
import { setOsPdfjsLoader } from "../../controllers/admin-os/feature-services/conversion/pdfConverter";
import { OsDocumentModel } from "../../models/OsDocumentModel";
import { OsDocumentImportModel } from "../../models/OsDocumentImportModel";
import { OsDocumentVersionModel } from "../../models/OsDocumentVersionModel";
import { OsAssetModel } from "../../models/OsAssetModel";
import { uploadToS3 } from "../../utils/core/s3";

const FIXTURES = path.join(__dirname, "..", "..", "__tests__", "fixtures", "os");
const readFixture = (name: string): Buffer =>
  fs.readFileSync(path.join(FIXTURES, name));

const RUN_TAG = `p6itest-${Date.now()}`;
const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
let userA = 0;
const docIds: string[] = [];

async function createUser(): Promise<number> {
  const result = await db.raw(
    `insert into users (email, name, is_internal) values (?, ?, true) returning id`,
    [`${RUN_TAG}@test.alloro`, "P6 itest user"]
  );
  return Number(result.rows[0].id);
}

function intakeFile(name: string, mime: string, buffer: Buffer) {
  return { originalname: name, mimetype: mime, size: buffer.length, buffer };
}

beforeAll(async () => {
  const schema = await db.raw(
    `select 1 from information_schema.schemata where schema_name = 'os'`
  );
  expect(schema.rows.length).toBe(1); // precondition: migration applied
  userA = await createUser();
  // Vitest can't use the production Function-import shim; inject native import.
  setOsPdfjsLoader(async () =>
    (await import("pdfjs-dist/legacy/build/pdf.mjs")) as unknown as Awaited<
      ReturnType<Parameters<typeof setOsPdfjsLoader>[0] & object>
    >
  );
});

afterAll(async () => {
  setOsPdfjsLoader(null);
  // CASCADE removes versions / imports / assets with the documents row.
  for (const id of docIds) {
    await db.raw(`delete from os.documents where id = ?`, [id]);
  }
  await db.raw(`delete from os.activity where actor_id = ?`, [userA]);
  if (userA) await db.raw(`delete from users where id = ?`, [userA]);
  await db.destroy();
});

describe("P6 import intake (live DB, mocked S3)", () => {
  it("markdown file → doc(processing) + import(pending) + archive + enqueue", async () => {
    const result = await OsImportService.intake(
      [intakeFile("Runbook.md", "text/markdown", readFixture("sample.md"))],
      userA
    );
    expect(result.skipped).toHaveLength(0);
    expect(result.documents).toHaveLength(1);
    const stub = result.documents[0];
    docIds.push(stub.documentId);

    const doc = await OsDocumentModel.findDocumentById(stub.documentId);
    expect(doc?.status).toBe("processing");
    expect(doc?.current_version_id).toBeNull();

    const imp = await OsDocumentImportModel.byDocument(stub.documentId);
    expect(imp?.status).toBe("pending");
    expect(imp?.converter).toBe("markdown");
    expect(imp?.source_s3_key).toBe(`os/imports/${stub.documentId}/Runbook.md`);
    expect(uploadToS3).toHaveBeenCalledWith(
      `os/imports/${stub.documentId}/Runbook.md`,
      expect.any(Buffer),
      "text/markdown"
    );
  });

  it("convert success: writes v1, marks converted, sets current version", async () => {
    const result = await OsImportService.intake(
      [intakeFile("Guide.md", "text/markdown", readFixture("sample.md"))],
      userA
    );
    const stub = result.documents[0];
    docIds.push(stub.documentId);

    await OsConversionService.run(stub.importId);

    const doc = await OsDocumentModel.findDocumentById(stub.documentId);
    expect(doc?.current_version_id).not.toBeNull();
    const version = await OsDocumentVersionModel.findVersionById(
      doc!.current_version_id as string
    );
    expect(version?.version_no).toBe(1);
    expect(version?.content_md).toContain("# Sample Doc");

    const imp = await OsDocumentImportModel.byDocument(stub.documentId);
    expect(imp?.status).toBe("converted");
    expect(imp?.converted_at).not.toBeNull();
    expect(Array.isArray(imp?.warnings)).toBe(true);
  });

  it("docx with an embedded image → an os.assets row + rewritten markdown ref", async () => {
    // Build a docx that carries one tiny PNG so the image-extraction path runs.
    const docxWithImage = await buildDocxWithImage();
    const result = await OsImportService.intake(
      [intakeFile("WithImage.docx", DOCX_MIME, docxWithImage)],
      userA
    );
    const stub = result.documents[0];
    docIds.push(stub.documentId);

    await OsConversionService.run(stub.importId);

    const assetRows = await db.raw(
      `select id, s3_key from os.assets where document_id = ?`,
      [stub.documentId]
    );
    const assets = assetRows.rows as Array<{ id: string; s3_key: string }>;
    expect(assets.length).toBe(1);
    const doc = await OsDocumentModel.findDocumentById(stub.documentId);
    const version = await OsDocumentVersionModel.findVersionById(
      doc!.current_version_id as string
    );
    // The scheme-free placeholder is rewritten to the asset-delivery URL.
    expect(version?.content_md).toContain(
      `/api/admin/os/assets/${assets[0].id}`
    );
    expect(version?.content_md).not.toContain("__ALLORO_OS_IMG_");
    // The asset object was uploaded under the D9 namespace.
    expect(uploaded.has(assets[0].s3_key)).toBe(true);
    expect(assets[0].s3_key).toContain(`os/assets/${stub.documentId}/`);
  });

  it("convert failure: markFailed flips doc + import to failed", async () => {
    const result = await OsImportService.intake(
      [intakeFile("Broken.md", "text/markdown", readFixture("sample.md"))],
      userA
    );
    const stub = result.documents[0];
    docIds.push(stub.documentId);

    await OsConversionService.markFailed(stub.importId);

    const doc = await OsDocumentModel.findDocumentById(stub.documentId);
    expect(doc?.status).toBe("processing_failed");
    const imp = await OsDocumentImportModel.byDocument(stub.documentId);
    expect(imp?.status).toBe("failed");
  });
});

/** A minimal .docx OOXML carrying one embedded PNG, built with jszip. */
async function buildDocxWithImage(): Promise<Buffer> {
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  // 1x1 transparent PNG.
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
    "base64"
  );
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Default Extension="png" ContentType="image/png"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`
  );
  zip.folder("_rels")!.file(
    ".rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`
  );
  const wordFolder = zip.folder("word")!;
  wordFolder.folder("media")!.file("image1.png", png);
  wordFolder.folder("_rels")!.file(
    "document.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rIdImg1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image1.png"/>
</Relationships>`
  );
  wordFolder.file(
    "document.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
<w:body>
<w:p><w:r><w:t>Doc with an image.</w:t></w:r></w:p>
<w:p><w:r><w:drawing><wp:inline><wp:extent cx="100" cy="100"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="1" name="image1.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rIdImg1"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="100" cy="100"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>
</w:body>
</w:document>`
  );
  return zip.generateAsync({ type: "nodebuffer" });
}
