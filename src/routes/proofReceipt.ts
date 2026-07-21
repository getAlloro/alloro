import express from "express";
import * as controller from "../controllers/proof-receipt/ProofReceiptController";
import { authenticateToken } from "../middleware/auth";
import { locationScopeMiddleware, rbacMiddleware } from "../middleware/rbac";
import { validate } from "../middleware/validate";
import { proofReceiptQuerySchema } from "../validation/proofReceipt.schemas";

const proofReceiptRoutes = express.Router();

// =====================================================================
// CLIENT ENDPOINTS (Organization-scoped via JWT + RBAC)
// =====================================================================

// The owner-facing "what Alloro did for you" receipt (Tier 1).
// (See plans/07202026-pr-merge-remediation/pr-177-proof-receipt.spec.html)
//
// Middleware order is load-bearing. `validate` runs BEFORE the location-scope
// middleware on purpose: the scope middleware does its own parseInt of the
// requested location, and on an unparseable value older revisions of it left
// the request with no location filter at all — which reads downstream as "no
// location requested" and widens the read to the whole organization. Validating
// first turns `?locationId=abc` into an explicit 400 instead. `validate` needs
// nothing from the scope middleware, so nothing is lost by running it earlier.
proofReceiptRoutes.get(
  "/",
  authenticateToken, // §11.1
  rbacMiddleware, // sets req.organizationId from the caller's memberships
  validate(proofReceiptQuerySchema, { target: "query", mode: "enforce" }), // §11.2
  locationScopeMiddleware, // sets req.accessibleLocationIds / req.locationId
  controller.getProofReceipt
);

export default proofReceiptRoutes;
