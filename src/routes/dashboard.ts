import express from "express";
import * as controller from "../controllers/dashboard/DashboardController";
import { dashboardScopeFailure } from "../controllers/dashboard/feature-utils/controllerResponses";
import { authenticateToken } from "../middleware/auth";
import {
  createLocationScopeMiddleware,
  rbacMiddleware,
} from "../middleware/rbac";

const dashboardRoutes = express.Router();
const dashboardLocationScopeMiddleware =
  createLocationScopeMiddleware(dashboardScopeFailure);

// =====================================================================
// CLIENT ENDPOINTS (Organization-scoped via JWT + RBAC)
// =====================================================================

// Dashboard metrics dictionary
// (See plan: 04282026-no-ticket-monthly-agents-v2-backend, T6)
dashboardRoutes.get(
  "/metrics",
  authenticateToken,
  rbacMiddleware,
  dashboardLocationScopeMiddleware,
  controller.getMetrics
);

export default dashboardRoutes;
