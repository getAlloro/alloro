/**
 * Admin Agent Outputs API Routes
 *
 * Endpoints for viewing and managing agent_results table
 * with archive functionality and filtering capabilities
 */

import express from "express";
import * as controller from "../../controllers/admin-agent-outputs/AdminAgentOutputsController";
import { authenticateToken } from "../../middleware/auth";
import { superAdminMiddleware } from "../../middleware/superAdmin";

const router = express.Router();

// Super-admin only. The app-level guard enforces authentication globally; this
// router-level layer additionally requires super-admin.
router.use(authenticateToken, superAdminMiddleware);

// List & Filters
router.get("/", controller.listOutputs);
router.get("/organizations", controller.getOrganizations);
router.get("/agent-types", controller.getAgentTypes);

// Statistics (before /:id to avoid route conflict)
router.get("/stats/summary", controller.getSummaryStats);

// Single Resource
router.get("/:id", controller.getOutputById);
router.patch("/:id/archive", controller.archiveOutput);
router.patch("/:id/unarchive", controller.unarchiveOutput);
router.delete("/:id", controller.deleteOutput);

// Bulk Operations
router.post("/bulk/archive", controller.bulkArchive);
router.post("/bulk/unarchive", controller.bulkUnarchive);
router.post("/bulk/delete", controller.bulkDelete);

export default router;
