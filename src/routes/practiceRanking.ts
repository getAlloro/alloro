/**
 * Practice Ranking Routes
 *
 * Endpoints for the Practice Ranking Analysis feature:
 * - POST /trigger - Start a new batch ranking analysis (multi-location)
 * - GET /status/:id - Check individual analysis status
 * - GET /batch/:batchId/status - Check batch analysis status
 * - GET /results/:id - Get full results for single analysis
 * - GET /list - List all analyses
 * - GET /accounts - List onboarded accounts with GBP locations
 * - DELETE /:id - Delete a ranking analysis
 * - DELETE /batch/:batchId - Delete all rankings in a batch
 * - POST /refresh-competitors - Invalidate competitor cache
 * - GET /latest - Get latest rankings for all locations (client dashboard)
 * - GET /tasks - Get approved ranking tasks
 *
 * v2 Curated Competitor Lists (location-scoped, client-facing, RBAC-gated):
 * - GET    /locations/:locationId/competitors
 * - POST   /locations/:locationId/competitors/discover
 * - POST   /locations/:locationId/competitors/preview-place
 * - POST   /locations/:locationId/competitors
 * - DELETE /locations/:locationId/competitors/:placeId
 * - POST   /locations/:locationId/competitors/finalize-and-run
 * - POST   /locations/:locationId/competitors/reselect-and-run
 */

import express from "express";
import * as controller from "../controllers/practice-ranking/PracticeRankingController";
import { authenticateToken } from "../middleware/auth";
import {
  rbacMiddleware,
  locationScopeMiddleware,
  requireRole,
} from "../middleware/rbac";
import { placesPhotoLimiter } from "../middleware/publicRateLimiter";

const router = express.Router();

// Trigger analysis
router.post("/trigger", controller.triggerBatchAnalysis);

// Status endpoints
router.get("/batch/:batchId/status", controller.getBatchStatus);
router.get("/status/:id", controller.getRankingStatus);

// Results
router.get("/results/:id", controller.getRankingResults);
router.get("/list", controller.listRankings);
router.get("/accounts", controller.listAccounts);
router.get("/latest", controller.getLatestRankings);
router.get("/in-flight", controller.getInFlightRanking);
router.get("/history", controller.getRankingHistory);
router.get("/tasks", controller.getRankingTasks);

// Retry
router.post("/retry/:id", controller.retryRanking);
router.post("/retry-batch/:batchId", controller.retryBatch);

// Management
router.delete("/batch/:batchId", controller.deleteBatch);
router.delete("/:id", controller.deleteRanking);
router.post("/refresh-competitors", controller.refreshCompetitors);

// =====================================================================
// v2 Curated Competitor Lists — gated by auth + RBAC + location scope.
// All endpoints validate that req.user has access to :locationId via the
// existing locationScopeMiddleware.
// =====================================================================

router.get(
  "/locations/:locationId/competitors",
  authenticateToken,
  rbacMiddleware,
  locationScopeMiddleware,
  controller.getLocationCompetitors
);

router.post(
  "/locations/:locationId/competitors/discover",
  authenticateToken,
  rbacMiddleware,
  locationScopeMiddleware,
  requireRole("admin", "manager"),
  controller.discoverLocationCompetitors
);

router.post(
  "/locations/:locationId/competitors/discover-candidates",
  authenticateToken,
  rbacMiddleware,
  locationScopeMiddleware,
  requireRole("admin", "manager"),
  controller.previewLocationCompetitorDiscovery
);

router.post(
  "/locations/:locationId/competitors/preview-place",
  authenticateToken,
  rbacMiddleware,
  locationScopeMiddleware,
  requireRole("admin", "manager"),
  controller.previewLocationCompetitorPlace
);

router.post(
  "/locations/:locationId/competitors",
  authenticateToken,
  rbacMiddleware,
  locationScopeMiddleware,
  requireRole("admin", "manager"),
  controller.addLocationCompetitor
);

router.delete(
  "/locations/:locationId/competitors/:placeId",
  authenticateToken,
  rbacMiddleware,
  locationScopeMiddleware,
  requireRole("admin", "manager"),
  controller.deleteLocationCompetitor
);

router.post(
  "/locations/:locationId/competitors/finalize-and-run",
  authenticateToken,
  rbacMiddleware,
  locationScopeMiddleware,
  requireRole("admin", "manager"),
  controller.finalizeLocationAndRun
);

router.post(
  "/locations/:locationId/competitors/reselect-and-run",
  authenticateToken,
  rbacMiddleware,
  locationScopeMiddleware,
  requireRole("admin", "manager"),
  controller.reselectLocationCompetitorsAndRun
);

// Authed photo proxy for Place Photo media. Behind login + rate limit because
// each call hits the paid Place Photo SKU.
// Spec: plans/04282026-no-ticket-leaflet-map-click-sync-rich-row-data/spec.md
router.get(
  "/photo",
  authenticateToken,
  placesPhotoLimiter,
  controller.getCompetitorPhoto
);

export default router;
