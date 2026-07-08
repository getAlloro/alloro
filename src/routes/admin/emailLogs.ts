/**
 * Admin Email Logs Routes
 *
 * All endpoints require super-admin auth (JWT + @getalloro.com domain). Mounted
 * at `/api/admin/email-logs` from src/app.ts.
 *
 *   GET /       — paginated, filtered list (no body_html)
 *   GET /:id    — full detail incl. rendered body_html
 */

import express from "express";
import { authenticateToken } from "../../middleware/auth";
import { superAdminMiddleware } from "../../middleware/superAdmin";
import {
  listEmailLogs,
  getEmailLogDetail,
  sendTestEmail,
} from "../../controllers/admin-email-logs/AdminEmailLogsController";

const router = express.Router();

router.get("/", authenticateToken, superAdminMiddleware, listEmailLogs);
router.post("/test-send", authenticateToken, superAdminMiddleware, sendTestEmail);
router.get("/:id", authenticateToken, superAdminMiddleware, getEmailLogDetail);

export default router;
