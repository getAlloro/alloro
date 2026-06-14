/**
 * Admin Websites — Review Sync sub-router (project-scoped)
 *
 * Review stats/list, manual sync + Apify fetch triggers, job status polling,
 * and per-review hide-toggle/delete.
 *
 * Mounted by `../websites.ts` AFTER the super-admin auth hoist, so every route
 * inherits `[authenticateToken, superAdminMiddleware]`. Literal sub-paths
 * (`stats`, `sync`, `fetch`, `jobs/:jobId/status`) precede the parameterized
 * `:reviewId` routes, matching original order.
 */

import express from "express";
import * as controller from "../../../controllers/admin-websites/ReviewsController";

const router = express.Router();

// =====================================================================
// REVIEW SYNC (project-scoped)
// =====================================================================

// GET  /:id/reviews/stats — Get review stats for project's org
router.get("/:id/reviews/stats", controller.getReviewStats);

// GET  /:id/reviews — List reviews with search/filter
router.get("/:id/reviews", controller.listReviews);

// POST /:id/reviews/sync — Trigger manual review sync for project's org
router.post("/:id/reviews/sync", controller.triggerReviewSync);

// POST /:id/reviews/fetch — Trigger Apify review fetch using place IDs
router.post("/:id/reviews/fetch", controller.triggerApifyReviewFetch);

// GET  /:id/reviews/jobs/:jobId/status — Poll review job status
router.get("/:id/reviews/jobs/:jobId/status", controller.getReviewJobStatus);

// PATCH /:id/reviews/:reviewId — Toggle review hidden
router.patch("/:id/reviews/:reviewId", controller.toggleReviewHidden);

// DELETE /:id/reviews/:reviewId — Delete a review
router.delete("/:id/reviews/:reviewId", controller.deleteReview);

export default router;
