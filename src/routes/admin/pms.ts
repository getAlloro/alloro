/**
 * Admin PMS Routes
 *
 * The cross-organization PMS reads used by the admin Org PMS tab. Mounted at
 * `/api/admin/pms` from `src/app.ts`.
 *
 *   GET /keyData?organization_id=N — aggregate PMS key metrics for any org
 *
 * Auth: super-admin only. A caller-supplied organization_id is safe here and
 * only here; the client-facing /api/pms/keyData derives its tenant from server
 * context instead (§5.5).
 */

import express from "express";
import { authenticateToken } from "../../middleware/auth";
import { superAdminMiddleware } from "../../middleware/superAdmin";
import * as controller from "../../controllers/admin-pms/AdminPmsController";

const router = express.Router();

router.use(authenticateToken, superAdminMiddleware);

router.get("/keyData", controller.getKeyDataForOrganization);

export default router;
