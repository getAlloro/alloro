import express from "express";
import * as controller from "../controllers/pms/PmsController";
import * as fileManagerController from "../controllers/pms/PmsFileManagerController";
import * as mappingController from "../controllers/pms/PmsMappingController";
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
pmsRoutes.post("/preview-mapping", ...canManagePmsFiles, mappingController.previewResetMapping);
pmsRoutes.post("/upload-with-mapping", ...canManagePmsFiles, mappingController.uploadWithMapping);
pmsRoutes.post("/jobs/:id/reprocess", ...canManagePmsFiles, mappingController.reprocessJobMapping);
pmsRoutes.get("/mappings/cache", authenticateToken, rbacMiddleware, mappingController.getCachedMapping);

// Data Retrieval
pmsRoutes.get("/keyData", authenticateToken, rbacMiddleware, controller.getKeyData);
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
// Now require a valid JWT. The app-level default-deny guard also protects these
// (/api/pms is not on the public allowlist); authenticateToken is declared here
// too so the requirement is explicit at the route and matches the client block
// above. Includes destructive ops (DELETE /jobs/:id, POST /jobs/:id/restart),
// which previously shipped with no auth at all.
// =====================================================================

pmsRoutes.get("/jobs", authenticateToken, controller.listJobs);
pmsRoutes.patch("/jobs/:id/approval", authenticateToken, controller.approveJob);
pmsRoutes.patch("/jobs/:id/response", authenticateToken, controller.updateResponseLog);
pmsRoutes.delete("/jobs/:id", authenticateToken, controller.deleteJob);
pmsRoutes.post("/jobs/:id/retry", authenticateToken, controller.retryJob);
pmsRoutes.post("/jobs/:id/restart", authenticateToken, controller.restartJob);

export default pmsRoutes;
