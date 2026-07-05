import express, { NextFunction, Request, Response } from "express";
import multer from "multer";
import { authenticateToken } from "../../middleware/auth";
import { superAdminMiddleware } from "../../middleware/superAdmin";
import { validate } from "../../middleware/validate";
import { AdminOsController } from "../../controllers/admin-os/AdminOsController";
import { AdminOsDocumentsController } from "../../controllers/admin-os/AdminOsDocumentsController";
import { AdminOsVersionsController } from "../../controllers/admin-os/AdminOsVersionsController";
import { AdminOsFoldersController } from "../../controllers/admin-os/AdminOsFoldersController";
import { AdminOsTaxonomyController } from "../../controllers/admin-os/AdminOsTaxonomyController";
import { AdminOsTrashController } from "../../controllers/admin-os/AdminOsTrashController";
import { AdminOsLocksController } from "../../controllers/admin-os/AdminOsLocksController";
import { AdminOsSearchController } from "../../controllers/admin-os/AdminOsSearchController";
import { AdminOsLinksController } from "../../controllers/admin-os/AdminOsLinksController";
import { AdminOsChatController } from "../../controllers/admin-os/AdminOsChatController";
import { AdminOsImportsController } from "../../controllers/admin-os/AdminOsImportsController";
import { AdminOsAssetsController } from "../../controllers/admin-os/AdminOsAssetsController";
import { AdminOsCommentsController } from "../../controllers/admin-os/AdminOsCommentsController";
import { authenticateOsAsset } from "../../controllers/admin-os/feature-utils/osAssetAuth";
import { getOsKnowledgeBaseConfig } from "../../config/osKnowledgeBase";
import {
  osIdParamsSchema,
  osVersionParamsSchema,
  osCreateDocumentSchema,
  osRenameDocumentSchema,
  osUpdateMetaSchema,
  osSaveDraftSchema,
  osPublishSchema,
  osRestoreVersionSchema,
  osDiffQuerySchema,
  osCreateFolderSchema,
  osUpdateFolderSchema,
  osCreateCategorySchema,
  osSearchQuerySchema,
  osCreateLinkSchema,
  osLinkIdParamsSchema,
  osUpdateLinkSchema,
  osCreateConversationSchema,
  osContextParamsSchema,
  osCommentIdParamsSchema,
  osCreateCommentSchema,
  osUpdateCommentSchema,
} from "../../validation/os.schemas";

// Fail fast at boot (§5.6): parsing validates every OS_* value, including the
// OS_EMBEDDING_DIM ↔ vector(1536) migration match. Throws before mounting.
const osConfig = getOsKnowledgeBaseConfig();

const MB = 1024 * 1024;
const OS_ASSET_MAX_MB = 15; // one editor image; imports use the larger cap below

// In-memory multipart parsing: buffers stream straight to S3 (§5.2 boundary).
// Import batch — larger per-file ceiling + a bounded file count so a batch can't
// blow up worker memory; both come from the validated OS config (§4.2/§5.6).
const importUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: osConfig.importMaxFileMb * MB,
    files: osConfig.importBatchMaxFiles,
  },
});
// Editor image upload — a single small file.
const assetUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: OS_ASSET_MAX_MB * MB, files: 1 },
});

/** §8.1 envelope for a pre-handler upload rejection (mirrors osResponses.fail). */
function uploadError(
  res: Response,
  status: number,
  code: string,
  message: string
): Response {
  return res
    .status(status)
    .json({ success: false, data: null, error: { code, message, details: null } });
}

/**
 * Wrap a multer middleware so LIMIT_FILE_SIZE / LIMIT_FILE_COUNT map to a 413
 * envelope (master spec: caps → 413-mapped OsError shape) instead of Express's
 * default error page. Other multer errors are 400; anything else propagates.
 */
function runUpload(
  handler: express.RequestHandler,
  tooLargeMessage: string
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    handler(req, res, (error: unknown) => {
      if (!error) return next();
      if (error instanceof multer.MulterError) {
        if (
          error.code === "LIMIT_FILE_SIZE" ||
          error.code === "LIMIT_FILE_COUNT"
        ) {
          uploadError(res, 413, `OS_IMPORT_${error.code}`, tooLargeMessage);
          return;
        }
        uploadError(res, 400, `OS_UPLOAD_${error.code}`, error.message);
        return;
      }
      next(error);
    });
  };
}

const router = express.Router();

// §11.2: zod at the boundary, ENFORCE mode (new domain — no legacy soak).
const enforce = { mode: "enforce" as const };
const body = (schema: Parameters<typeof validate>[0]) =>
  validate(schema, enforce);
const params = (schema: Parameters<typeof validate>[0]) =>
  validate(schema, { target: "params", ...enforce });
const query = (schema: Parameters<typeof validate>[0]) =>
  validate(schema, { target: "query", ...enforce });

// Asset delivery (P6 T5) is mounted BEFORE the global header-only gate because
// it is rendered in an <img>, which cannot send an Authorization header — its
// own auth (authenticateOsAsset) accepts the same super-admin JWT from a
// `?token=` query param too, then superAdminMiddleware runs unchanged. 302s to
// a short-expiry presigned S3 URL (§8.1 envelope exception).
router.get(
  "/assets/:id",
  authenticateOsAsset,
  superAdminMiddleware,
  params(osIdParamsSchema),
  AdminOsAssetsController.serve
);

// The rest of the OS domain is super-admin only via the standard header gate
// (§11.1, master spec D3). Analog: src/routes/admin/auth.ts.
router.use(authenticateToken, superAdminMiddleware);

router.get("/ping", AdminOsController.ping);
router.get("/users", AdminOsController.listUsers);

// ── Documents (P2 T5) ────────────────────────────────────────────────────────
router.get("/documents", AdminOsDocumentsController.list);
router.post(
  "/documents",
  body(osCreateDocumentSchema),
  AdminOsDocumentsController.create
);
router.get(
  "/documents/:id",
  params(osIdParamsSchema),
  AdminOsDocumentsController.get
);
router.patch(
  "/documents/:id",
  params(osIdParamsSchema),
  body(osRenameDocumentSchema),
  AdminOsDocumentsController.rename
);
router.delete(
  "/documents/:id",
  params(osIdParamsSchema),
  AdminOsDocumentsController.archive
);
router.patch(
  "/documents/:id/meta",
  params(osIdParamsSchema),
  body(osUpdateMetaSchema),
  AdminOsDocumentsController.updateMeta
);
router.get(
  "/documents/:id/draft",
  params(osIdParamsSchema),
  AdminOsDocumentsController.getDraft
);
router.put(
  "/documents/:id/draft",
  params(osIdParamsSchema),
  body(osSaveDraftSchema),
  AdminOsDocumentsController.saveDraft
);
router.post(
  "/documents/:id/publish",
  params(osIdParamsSchema),
  body(osPublishSchema),
  AdminOsDocumentsController.publish
);
router.post(
  "/documents/:id/reindex",
  params(osIdParamsSchema),
  AdminOsDocumentsController.reindex
);

// ── Imports & assets (P6) ────────────────────────────────────────────────────
// Batch file import (docx/xlsx/pdf/md → markdown). Field name `files`; caps +
// 413 mapping in runUpload; mime/extension allowlist + sanitize in the service.
router.post(
  "/imports",
  runUpload(
    importUpload.array("files", osConfig.importBatchMaxFiles),
    `Each file must be ${osConfig.importMaxFileMb} MB or smaller, and a batch may hold at most ${osConfig.importBatchMaxFiles} files.`
  ),
  AdminOsImportsController.create
);
// Poll the latest import provenance row (per-file status + warnings).
router.get(
  "/documents/:id/import",
  params(osIdParamsSchema),
  AdminOsImportsController.getForDocument
);
// Editor image upload (single file field `file`) → 201 with the asset URL.
// Served (GET /assets/:id) is registered above the global gate for <img>.
router.post(
  "/documents/:id/assets",
  params(osIdParamsSchema),
  runUpload(
    assetUpload.single("file"),
    `Image must be ${OS_ASSET_MAX_MB} MB or smaller.`
  ),
  AdminOsAssetsController.upload
);

// ── Related links (P4 T4) ────────────────────────────────────────────────────
router.get(
  "/documents/:id/links",
  params(osIdParamsSchema),
  AdminOsLinksController.list
);
router.post(
  "/documents/:id/links",
  params(osIdParamsSchema),
  body(osCreateLinkSchema),
  AdminOsLinksController.create
);
router.patch(
  "/links/:id",
  params(osLinkIdParamsSchema),
  body(osUpdateLinkSchema),
  AdminOsLinksController.updateStatus
);

// ── Comments (P7 T1) ─────────────────────────────────────────────────────────
// Threaded discussion per document. Edit/delete are author-only, enforced in
// OsCommentService (§5.4) — the route only validates the boundary. No task
// fields anywhere (pmtool owns tasks; master D-scope).
router.get(
  "/documents/:id/comments",
  params(osIdParamsSchema),
  AdminOsCommentsController.list
);
router.post(
  "/documents/:id/comments",
  params(osIdParamsSchema),
  body(osCreateCommentSchema),
  AdminOsCommentsController.create
);
router.patch(
  "/comments/:id",
  params(osCommentIdParamsSchema),
  body(osUpdateCommentSchema),
  AdminOsCommentsController.update
);
router.delete(
  "/comments/:id",
  params(osCommentIdParamsSchema),
  AdminOsCommentsController.remove
);

// ── Versions (diff before :versionNo so "diff" never parses as a number) ────
router.get(
  "/documents/:id/versions",
  params(osIdParamsSchema),
  AdminOsVersionsController.list
);
router.get(
  "/documents/:id/versions/diff",
  params(osIdParamsSchema),
  query(osDiffQuerySchema),
  AdminOsVersionsController.diff
);
router.get(
  "/documents/:id/versions/:versionNo",
  params(osVersionParamsSchema),
  AdminOsVersionsController.get
);
router.post(
  "/documents/:id/restore",
  params(osIdParamsSchema),
  body(osRestoreVersionSchema),
  AdminOsVersionsController.restore
);

// ── Edit locks (D8: HTTP heartbeat) ──────────────────────────────────────────
router.get(
  "/documents/:id/locks",
  params(osIdParamsSchema),
  AdminOsLocksController.get
);
router.post(
  "/documents/:id/locks",
  params(osIdParamsSchema),
  AdminOsLocksController.acquire
);
router.post(
  "/documents/:id/locks/heartbeat",
  params(osIdParamsSchema),
  AdminOsLocksController.heartbeat
);
router.delete(
  "/documents/:id/locks",
  params(osIdParamsSchema),
  AdminOsLocksController.release
);

// ── Folders ──────────────────────────────────────────────────────────────────
router.get("/folders", AdminOsFoldersController.tree);
router.post(
  "/folders",
  body(osCreateFolderSchema),
  AdminOsFoldersController.create
);
router.patch(
  "/folders/:id",
  params(osIdParamsSchema),
  body(osUpdateFolderSchema),
  AdminOsFoldersController.update
);
router.delete(
  "/folders/:id",
  params(osIdParamsSchema),
  AdminOsFoldersController.remove
);

// ── Categories ───────────────────────────────────────────────────────────────
router.get("/categories", AdminOsTaxonomyController.listCategories);
router.post(
  "/categories",
  body(osCreateCategorySchema),
  AdminOsTaxonomyController.createCategory
);

// ── Trash ────────────────────────────────────────────────────────────────────
router.get("/trash", AdminOsTrashController.list);
router.post(
  "/trash/:id/restore",
  params(osIdParamsSchema),
  AdminOsTrashController.restore
);
router.delete(
  "/trash/:id",
  params(osIdParamsSchema),
  AdminOsTrashController.purge
);

// ── Search (FTS) ─────────────────────────────────────────────────────────────
router.get("/search", query(osSearchQuerySchema), AdminOsSearchController.search);

// ── Chat (P5) ────────────────────────────────────────────────────────────────
router.get("/chat/conversations", AdminOsChatController.list);
router.post(
  "/chat/conversations",
  body(osCreateConversationSchema),
  AdminOsChatController.create
);
router.get(
  "/chat/conversations/:id",
  params(osIdParamsSchema),
  AdminOsChatController.get
);
router.delete(
  "/chat/conversations/:id",
  params(osIdParamsSchema),
  AdminOsChatController.remove
);
// SSE stream. No body(...) middleware: the controller re-parses the message so
// a bad payload 400s as an envelope BEFORE the stream opens, keeping full
// control of the pre-stream error shape (§8.3). params still validate.
router.post(
  "/chat/conversations/:id/messages",
  params(osIdParamsSchema),
  AdminOsChatController.sendMessage
);
router.post(
  "/chat/conversations/:id/context/:documentId",
  params(osContextParamsSchema),
  AdminOsChatController.attachContext
);
router.delete(
  "/chat/conversations/:id/context/:documentId",
  params(osContextParamsSchema),
  AdminOsChatController.detachContext
);

export default router;
