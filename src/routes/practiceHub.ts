/**
 * Practice Hub routes.
 *
 * Feature 1 (Path D rebuild, 2026-05-22). Single endpoint exposing the
 * Practice Hub Hero in the doctrine shape defined by the Hero Arc Substrate.
 *
 * GET /api/practice-hub/hero/:orgId  — returns the Hero payload for the org.
 *   Auth: authenticateToken + rbacMiddleware. The :orgId path param must
 *   match the authenticated org (cross-org reads rejected by the controller).
 */

import express from "express";
import { authenticateToken } from "../middleware/auth";
import { rbacMiddleware } from "../middleware/rbac";
import * as controller from "../controllers/practiceHub/PracticeHubController";

const practiceHubRoutes = express.Router();

practiceHubRoutes.get(
  "/hero/:orgId",
  authenticateToken,
  rbacMiddleware,
  controller.getHero,
);

export default practiceHubRoutes;
