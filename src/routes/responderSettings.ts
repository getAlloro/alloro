import express from "express";
import * as controller from "../controllers/responder-settings/ResponderSettingsController";
import { authenticateToken } from "../middleware/auth";
import { rbacMiddleware } from "../middleware/rbac";

const responderSettingsRoutes = express.Router();

// =====================================================================
// CLIENT ENDPOINTS (Organization-scoped via JWT + RBAC)
// =====================================================================

// Owner-facing auto-responder settings: read the current scope config.
responderSettingsRoutes.get(
  "/",
  authenticateToken,
  rbacMiddleware,
  controller.getResponderSettings
);

// Owner-facing auto-responder settings: write the current scope config.
responderSettingsRoutes.put(
  "/",
  authenticateToken,
  rbacMiddleware,
  controller.updateResponderSettings
);

export default responderSettingsRoutes;
