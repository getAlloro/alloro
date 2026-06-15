/**
 * Admin Agent Insights API Routes
 *
 * Endpoints for viewing Guardian and Governance Sentinel agent recommendations
 * and tracking their status (PASS/REJECT)
 */

import express from "express";
import * as controller from "../controllers/admin-agent-insights/AdminAgentInsightsController";
import { authenticateToken } from "../middleware/auth";
import { superAdminMiddleware } from "../middleware/superAdmin";

const router = express.Router();

// Super-admin only. The app-level guard enforces authentication globally; this
// router-level layer additionally requires super-admin.
router.use(authenticateToken, superAdminMiddleware);

router.get("/summary", controller.getSummary);
router.get("/:agentType/recommendations", controller.getRecommendations);
router.patch("/recommendations/:id", controller.updateRecommendation);
router.patch("/:agentType/recommendations/mark-all-pass", controller.markAllPass);
router.delete("/recommendations/bulk-delete", controller.bulkDeleteRecommendations);
router.delete("/clear-month-data", controller.clearMonthData);
router.get("/:agentType/governance-ids", controller.getGovernanceIds);
router.post("/by-ids", controller.getByIds);

export default router;
