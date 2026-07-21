import express from "express";
import * as controller from "../controllers/pms/PmsController";
import * as fileManagerController from "../controllers/pms/PmsFileManagerController";
import * as mappingController from "../controllers/pms/PmsMappingController";
import * as pasteController from "../controllers/pms/PmsPasteController";
import { upload } from "../controllers/pms/pms-utils/file-upload.config";
import { authenticateToken } from "../middleware/auth";
import { superAdminMiddleware } from "../middleware/superAdmin";
import {
  locationScopeMiddleware,
  rbacMiddleware,
  requireRole,
} from "../middleware/rbac";

const pmsRoutes = express.Router();
const protectedPms = [authenticateToken, rbacMiddleware, locationScopeMiddleware];
const adminOnlyPms = [authenticateToken, superAdminMiddleware];
const canManagePmsFiles = [
  authenticateToken,
  rbacMiddleware,
  locationScopeMiddleware,
  requireRole("admin", "manager"),
];

// =====================================================================
// CLIENT ENDPOINTS (Organization-scoped via JWT + RBAC)
// =====================================================================

// Upload & Processing
pmsRoutes.post(
  "/upload",
  authenticateToken,
  rbacMiddleware,
  upload.single("csvFile"),
  locationScopeMiddleware,
  requireRole("admin", "manager"),
  controller.uploadPmsData
);
pmsRoutes.post("/parse-paste", ...canManagePmsFiles, pasteController.previewPaste);
pmsRoutes.post("/upload-paste", ...canManagePmsFiles, pasteController.uploadPaste);
pmsRoutes.post("/sanitize-paste", authenticateToken, rbacMiddleware, controller.sanitizePaste);
pmsRoutes.post("/summary", authenticateToken, rbacMiddleware, controller.getPmsSummary);

// Column-mapping endpoints
// (See plan: 04272026-no-ticket-pms-column-mapping-ai-inference)
pmsRoutes.post("/preview-mapping", ...canManagePmsFiles, mappingController.previewResetMapping);
pmsRoutes.post("/upload-with-mapping", ...canManagePmsFiles, mappingController.uploadWithMapping);
pmsRoutes.post("/jobs/:id/reprocess", ...canManagePmsFiles, mappingController.reprocessJobMapping);
pmsRoutes.get("/mappings/cache", authenticateToken, rbacMiddleware, mappingController.getCachedMapping);

// Data Retrieval
// locationScopeMiddleware is required here, not optional: getKeyData now reads
// the resolved req.locationId instead of the raw query value, so without it a
// requested location would be silently dropped rather than validated (§5.5).
pmsRoutes.get("/keyData", ...protectedPms, controller.getKeyData);
pmsRoutes.post(
  "/comparison-insights",
  authenticateToken,
  rbacMiddleware,
  controller.generateComparisonInsights
);

// Location-scoped PMS File Manager
pmsRoutes.get("/file-manager", ...protectedPms, fileManagerController.listFiles);
pmsRoutes.post(
  "/file-manager/upload-preview",
  authenticateToken,
  rbacMiddleware,
  upload.single("csvFile"),
  locationScopeMiddleware,
  requireRole("admin", "manager"),
  fileManagerController.previewUploadFile
);
pmsRoutes.post(
  "/file-manager/conflicts",
  ...protectedPms,
  fileManagerController.previewConflicts
);
pmsRoutes.get(
  "/file-manager/jobs/:id",
  ...protectedPms,
  fileManagerController.getFileDetail
);
pmsRoutes.get(
  "/file-manager/jobs/:id/download-url",
  ...protectedPms,
  fileManagerController.getDownloadUrl
);
pmsRoutes.patch(
  "/file-manager/jobs/:id",
  ...canManagePmsFiles,
  fileManagerController.updateFileData
);
pmsRoutes.delete(
  "/file-manager/jobs/:id",
  ...canManagePmsFiles,
  fileManagerController.softDeleteFile
);
pmsRoutes.post(
  "/file-manager/rerun",
  ...canManagePmsFiles,
  fileManagerController.rerunInsights
);

// Client approval
pmsRoutes.patch("/jobs/:id/client-approval", authenticateToken, rbacMiddleware, controller.clientApproveJob);

// Automation status (client polls this)
pmsRoutes.get("/jobs/:id/automation-status", authenticateToken, rbacMiddleware, controller.getAutomationStatus);
pmsRoutes.get("/automation/active", authenticateToken, rbacMiddleware, controller.getActiveAutomations);

// =====================================================================
// ADMIN ENDPOINTS (accessed from the admin dashboard)
// Super-admin only. These take organization_id / a bare job id from the request
// and apply no per-tenant scoping, so authenticateToken alone was not a
// boundary: any authenticated user could list another practice's jobs by
// passing organization_id (or every practice's by omitting it), and could
// delete, approve, retry or restart any job by id (§5.5, §11.1).
//
// Confirmed safe to gate this way: the only frontend callers are
// components/Admin/pms-pipeline/ and hooks/queries/useAdminOrgTabQueries.ts.
// Clients approve their own jobs through /jobs/:id/client-approval above,
// which is separately RBAC-scoped.
// =====================================================================

pmsRoutes.get("/jobs", ...adminOnlyPms, controller.listJobs);
pmsRoutes.patch("/jobs/:id/approval", ...adminOnlyPms, controller.approveJob);
pmsRoutes.patch("/jobs/:id/response", ...adminOnlyPms, controller.updateResponseLog);
pmsRoutes.delete("/jobs/:id", ...adminOnlyPms, controller.deleteJob);
pmsRoutes.post("/jobs/:id/retry", ...adminOnlyPms, controller.retryJob);
pmsRoutes.post("/jobs/:id/restart", ...adminOnlyPms, controller.restartJob);

export default pmsRoutes;
