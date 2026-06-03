import express from "express";
import * as controller from "../controllers/pms/PmsController";
import * as fileManagerController from "../controllers/pms/PmsFileManagerController";
import { upload } from "../controllers/pms/pms-utils/file-upload.config";
import { authenticateToken } from "../middleware/auth";
import {
  locationScopeMiddleware,
  rbacMiddleware,
  requireRole,
} from "../middleware/rbac";

const pmsRoutes = express.Router();
const protectedPms = [authenticateToken, rbacMiddleware, locationScopeMiddleware];
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
pmsRoutes.post("/parse-paste", authenticateToken, rbacMiddleware, controller.parsePaste);
pmsRoutes.post("/sanitize-paste", authenticateToken, rbacMiddleware, controller.sanitizePaste);
pmsRoutes.post("/summary", authenticateToken, rbacMiddleware, controller.getPmsSummary);

// Column-mapping endpoints
// (See plan: 04272026-no-ticket-pms-column-mapping-ai-inference)
pmsRoutes.post("/preview-mapping", ...canManagePmsFiles, controller.previewResetMapping);
pmsRoutes.post("/upload-with-mapping", ...canManagePmsFiles, controller.uploadWithMapping);
pmsRoutes.post("/jobs/:id/reprocess", ...canManagePmsFiles, controller.reprocessJobMapping);
pmsRoutes.get("/mappings/cache", authenticateToken, rbacMiddleware, controller.getCachedMapping);

// Data Retrieval
pmsRoutes.get("/keyData", authenticateToken, rbacMiddleware, controller.getKeyData);

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

// Client approval
pmsRoutes.patch("/jobs/:id/client-approval", authenticateToken, rbacMiddleware, controller.clientApproveJob);

// Automation status (client polls this)
pmsRoutes.get("/jobs/:id/automation-status", authenticateToken, rbacMiddleware, controller.getAutomationStatus);
pmsRoutes.get("/automation/active", authenticateToken, rbacMiddleware, controller.getActiveAutomations);

// =====================================================================
// ADMIN ENDPOINTS (No auth — accessed from admin dashboard)
// =====================================================================

pmsRoutes.get("/jobs", controller.listJobs);
pmsRoutes.patch("/jobs/:id/approval", controller.approveJob);
pmsRoutes.patch("/jobs/:id/response", controller.updateResponseLog);
pmsRoutes.delete("/jobs/:id", controller.deleteJob);
pmsRoutes.post("/jobs/:id/retry", controller.retryJob);
pmsRoutes.post("/jobs/:id/restart", controller.restartJob);

export default pmsRoutes;
