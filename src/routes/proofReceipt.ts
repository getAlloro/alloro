import express from "express";
import * as controller from "../controllers/proof-receipt/ProofReceiptController";
import { authenticateToken } from "../middleware/auth";
import { rbacMiddleware } from "../middleware/rbac";

const proofReceiptRoutes = express.Router();

// =====================================================================
// CLIENT ENDPOINTS (Organization-scoped via JWT + RBAC)
// =====================================================================

// The owner-facing "what Alloro did for you" receipt (Tier 1).
// (See specs/proof-receipt-build-spec.md)
proofReceiptRoutes.get(
  "/",
  authenticateToken,
  rbacMiddleware,
  controller.getProofReceipt
);

export default proofReceiptRoutes;
