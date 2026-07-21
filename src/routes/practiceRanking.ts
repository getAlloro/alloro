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
import * as competitorController from "../controllers/practice-ranking/LocationCompetitorController";
import { authenticateToken } from "../middleware/auth";
import {
  rbacMiddleware,
  locationScopeMiddleware,
  requireRole,
} from "../middleware/rbac";
import { placesPhotoLimiter } from "../middleware/publicRateLimiter";
import { serviceTokenMiddleware } from "../middleware/serviceToken";

const router = express.Router();

// Dashboard-facing routes: JWT + RBAC. This whole prefix sits on the public
// allowlist (middleware/publicRoutes.ts), so until now none of these declared
// any auth at all — /latest returned another practice's rankings to an
// anonymous caller, and DELETE /:id deleted a ranking for one (§5.5, §11.1).
// Per-route middleware is authoritative regardless of the allowlist, so
// declaring it here closes those holes without waiting on the allowlist edit.
const dashboardRanking = [authenticateToken, rbacMiddleware];

// Machine-called routes. publicRoutes.ts records these as "currently
// unauthenticated and externally triggered", so they carry the service token in
// observation mode rather than a JWT — nothing is rejected until the rollout
// reaches stage 2 (config/serviceToken.ts). The token is applied per-route, not
// at the prefix, because the dashboard routes below authenticate with a JWT and
// would be rejected by a prefix-wide token check once enforcement is on.
//
// Until stage 2 these remain open to anonymous callers. That is a known hole,
// tracked in the spec and asserted by a characterization test.
router.post("/trigger", serviceTokenMiddleware, controller.triggerBatchAnalysis);
router.get(
  "/batch/:batchId/status",
  serviceTokenMiddleware,
  controller.getBatchStatus
);
router.get("/status/:id", serviceTokenMiddleware, controller.getRankingStatus);

// Results — read by the client dashboard.
router.get("/results/:id", ...dashboardRanking, controller.getRankingResults);
router.get("/list", ...dashboardRanking, controller.listRankings);
router.get("/accounts", ...dashboardRanking, controller.listAccounts);
router.get("/latest", ...dashboardRanking, controller.getLatestRankings);
router.get("/in-flight", ...dashboardRanking, controller.getInFlightRanking);
router.get("/history", ...dashboardRanking, controller.getRankingHistory);

// Retry — billable work, triggered from the dashboard.
router.post("/retry/:id", ...dashboardRanking, controller.retryRanking);
router.post("/retry-batch/:batchId", ...dashboardRanking, controller.retryBatch);

// Management — destructive, dashboard-only.
router.delete("/batch/:batchId", ...dashboardRanking, controller.deleteBatch);
router.delete("/:id", ...dashboardRanking, controller.deleteRanking);
router.post(
  "/refresh-competitors",
  ...dashboardRanking,
  controller.refreshCompetitors
);

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
  competitorController.getLocationCompetitors
);

router.post(
  "/locations/:locationId/competitors/discover",
  authenticateToken,
  rbacMiddleware,
  locationScopeMiddleware,
  requireRole("admin", "manager"),
  competitorController.discoverLocationCompetitors
);

router.post(
  "/locations/:locationId/competitors/discover-candidates",
  authenticateToken,
  rbacMiddleware,
  locationScopeMiddleware,
  requireRole("admin", "manager"),
  competitorController.previewLocationCompetitorDiscovery
);

router.post(
  "/locations/:locationId/competitors/preview-place",
  authenticateToken,
  rbacMiddleware,
  locationScopeMiddleware,
  requireRole("admin", "manager"),
  competitorController.previewLocationCompetitorPlace
);

router.post(
  "/locations/:locationId/competitors",
  authenticateToken,
  rbacMiddleware,
  locationScopeMiddleware,
  requireRole("admin", "manager"),
  competitorController.addLocationCompetitor
);

router.delete(
  "/locations/:locationId/competitors/:placeId",
  authenticateToken,
  rbacMiddleware,
  locationScopeMiddleware,
  requireRole("admin", "manager"),
  competitorController.deleteLocationCompetitor
);

router.post(
  "/locations/:locationId/competitors/finalize-and-run",
  authenticateToken,
  rbacMiddleware,
  locationScopeMiddleware,
  requireRole("admin", "manager"),
  competitorController.finalizeLocationAndRun
);

router.post(
  "/locations/:locationId/competitors/reselect-and-run",
  authenticateToken,
  rbacMiddleware,
  locationScopeMiddleware,
  requireRole("admin", "manager"),
  competitorController.reselectLocationCompetitorsAndRun
);

// Authed photo proxy for Place Photo media. Behind login + rate limit because
// each call hits the paid Place Photo SKU.
// Spec: plans/04282026-no-ticket-leaflet-map-click-sync-rich-row-data/spec.md
router.get(
  "/photo",
  authenticateToken,
  placesPhotoLimiter,
  competitorController.getCompetitorPhoto
);

export default router;
