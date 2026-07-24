import express from "express";
import * as controller from "../controllers/owner-receipt/OwnerReceiptController";
import { authenticateToken } from "../middleware/auth";
import { locationScopeMiddleware, rbacMiddleware } from "../middleware/rbac";
import { validate } from "../middleware/validate";
import { ownerReceiptQuerySchema } from "../validation/ownerReceipt.schemas";

const ownerReceiptRoutes = express.Router();

// =====================================================================
// CLIENT ENDPOINTS (Organization-scoped via JWT + RBAC)
// =====================================================================

// The owner-facing receipt: dated actions + post-window gate numbers + the
// honest before -> after trend + the funnel-movement diagnosis. Read-only.
//
// Middleware order mirrors proofReceipt.ts and is load-bearing: `validate`
// runs BEFORE locationScopeMiddleware so an unparseable `?locationId=abc` is an
// explicit 400 rather than silently widening the read to the whole org.
ownerReceiptRoutes.get(
  "/",
  authenticateToken, // §11.1
  rbacMiddleware, // sets req.organizationId from the caller's memberships
  validate(ownerReceiptQuerySchema, { target: "query", mode: "enforce" }), // §11.2
  locationScopeMiddleware, // sets req.accessibleLocationIds / req.locationId
  controller.getOwnerReceipt
);

export default ownerReceiptRoutes;
