import express from "express";
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
} from "../../validation/os.schemas";

// Fail fast at boot (§5.6): parsing validates every OS_* value, including the
// OS_EMBEDDING_DIM ↔ vector(1536) migration match. Throws before mounting.
getOsKnowledgeBaseConfig();

const router = express.Router();

// The whole OS domain is super-admin only (§11.1, master spec D3) — gate first,
// before any handler. Analog: src/routes/admin/auth.ts.
router.use(authenticateToken, superAdminMiddleware);

// §11.2: zod at the boundary, ENFORCE mode (new domain — no legacy soak).
const enforce = { mode: "enforce" as const };
const body = (schema: Parameters<typeof validate>[0]) =>
  validate(schema, enforce);
const params = (schema: Parameters<typeof validate>[0]) =>
  validate(schema, { target: "params", ...enforce });
const query = (schema: Parameters<typeof validate>[0]) =>
  validate(schema, { target: "query", ...enforce });

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

export default router;
