import express from "express";
import * as controller from "../controllers/responder-settings/ResponderSettingsController";
import { authenticateToken } from "../middleware/auth";
import { rbacMiddleware, requireRole } from "../middleware/rbac";

const responderSettingsRoutes = express.Router();

// §5.4 — rbacMiddleware RESOLVES the caller's role; it does not ENFORCE one.
// The PUT below turns the auto-responder on and starts it sending email AS the
// practice, so a read-only member must not reach it. Mirrors the pattern Dave
// required on #168 and merged: routes/gbpAutomation.ts:73.
const requireWriteRole = requireRole("admin", "manager");

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
  requireWriteRole,
  controller.updateResponderSettings
);

export default responderSettingsRoutes;
