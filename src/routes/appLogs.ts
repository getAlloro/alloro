import express from "express";
import * as appLogsController from "../controllers/appLogs/appLogsController";
import { authenticateToken } from "../middleware/auth";
import { superAdminMiddleware } from "../middleware/superAdmin";

const router = express.Router();

// Super-admin only — app logs can expose sensitive operational data. The
// app-level guard enforces authentication globally; this adds the super-admin
// requirement at the router level.
router.use(authenticateToken, superAdminMiddleware);

/**
 * GET /api/admin/app-logs
 * Returns latest lines from specified log file
 */
router.get("/", appLogsController.getLogFile);

/**
 * DELETE /api/admin/app-logs
 * Clears specified log file
 */
router.delete("/", appLogsController.clearLogFile);

export default router;
