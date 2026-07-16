/**
 * Admin Websites — AI Command sub-router
 *
 * AI command batches (list/create/rename/delete/status) and their
 * recommendations (list, bulk approve-reject, single update, execute).
 *
 * Mounted by `../websites.ts` AFTER the super-admin auth hoist, so every route
 * inherits `[authenticateToken, superAdminMiddleware]`. Literal sub-paths
 * (`recommendations/bulk`) precede the `:recId` matcher, matching original
 * order.
 */

import express from "express";
import * as controller from "../../../controllers/admin-websites/AiCommandController";

const router = express.Router();

// =====================================================================
// AI COMMAND
// =====================================================================

// GET  /:id/ai-command — List all batches for a project (before :batchId)
router.get("/:id/ai-command", controller.listAiCommandBatches);

// POST /:id/ai-command — Create a new AI command batch
router.post("/:id/ai-command", controller.createAiCommandBatch);

// POST /:id/ai-command/taste-rewrite — B2: draft Taste-Profile rewrites (literal
// path before the :batchId matcher below)
router.post("/:id/ai-command/taste-rewrite", controller.generateTasteRewriteBatchHandler);

// PATCH /:id/ai-command/:batchId — Rename a batch
router.patch("/:id/ai-command/:batchId", controller.renameAiCommandBatch);

// DELETE /:id/ai-command/:batchId — Delete a batch
router.delete("/:id/ai-command/:batchId", controller.deleteAiCommandBatch);

// GET  /:id/ai-command/:batchId — Get batch status and stats
router.get("/:id/ai-command/:batchId", controller.getAiCommandBatch);

// PATCH /:id/ai-command/:batchId/recommendations/bulk — Bulk approve/reject (before :recId)
router.patch("/:id/ai-command/:batchId/recommendations/bulk", controller.bulkUpdateAiCommandRecommendations);

// GET  /:id/ai-command/:batchId/recommendations — List recommendations
router.get("/:id/ai-command/:batchId/recommendations", controller.getAiCommandRecommendations);

// PATCH /:id/ai-command/:batchId/recommendations/:recId — Update single recommendation
router.patch("/:id/ai-command/:batchId/recommendations/:recId", controller.updateAiCommandRecommendation);

// POST /:id/ai-command/:batchId/execute — Execute approved recommendations
router.post("/:id/ai-command/:batchId/execute", controller.executeAiCommandBatch);

export default router;
