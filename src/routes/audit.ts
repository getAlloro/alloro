import express, { NextFunction, Request, Response } from "express";
import * as auditController from "../controllers/audit/audit.controller";
import { validateTrackingKey } from "../controllers/leadgen-tracking/feature-utils/util.tracking-auth";
import { auditStartLimiter } from "../middleware/publicRateLimiter";

const auditRoutes = express.Router();

/**
 * Shared-secret gate for the public retry endpoint. Mirrors the pattern in
 * `routes/leadgenTracking.ts`. Mounted only on `/retry` — all other audit
 * routes stay as they were.
 */
function requireTrackingKey(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (!validateTrackingKey(req)) {
    res.status(401).json({ ok: false, error: "unauthorized" });
    return;
  }
  next();
}

auditRoutes.post("/start", auditStartLimiter, auditController.startAudit);
auditRoutes.post(
  "/:auditId/retry",
  requireTrackingKey,
  auditController.retryAudit
);
auditRoutes.get("/:auditId/status", auditController.getAuditStatus);
auditRoutes.get("/:auditId", auditController.getAuditDetails);
auditRoutes.patch("/:auditId", auditController.updateAudit);

export default auditRoutes;
