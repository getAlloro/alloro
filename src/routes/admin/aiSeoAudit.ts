import express from "express";
import { authenticateToken } from "../../middleware/auth";
import { superAdminMiddleware } from "../../middleware/superAdmin";
import * as controller from "../../controllers/admin-ai-seo-audit/AdminAiSeoAuditController";

const router = express.Router();

router.use(authenticateToken, superAdminMiddleware);

router.get("/auditable-organizations", controller.listAuditableOrganizations);
router.get("/runs", controller.listRuns);
router.get("/runs/:runId", controller.getRun);
router.post("/url", controller.createUrlAudit);
router.post("/organizations/:organizationId", controller.createOrganizationAudit);
router.delete("/runs/:runId", controller.deleteRun);
router.delete("/runs", controller.deleteRuns);

export default router;
