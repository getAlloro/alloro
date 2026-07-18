import express from "express";
import { NapConsistencyController } from "../controllers/nap-consistency/NapConsistencyController";
import { authenticateToken } from "../middleware/auth";
import { rbacMiddleware, locationScopeMiddleware } from "../middleware/rbac";

/**
 * NAP-consistency read routes — Alloro Funnel Engine A4. Thin definitions only
 * (§7.2). Same auth → RBAC → location-scope chain as the GBP client router
 * (§6.1 / §11.1): the location the caller may read is resolved server-side, so
 * the tenant scope is enforced before the controller runs (§5.5 / §11.7).
 *
 * Read-only surface — every route is a GET, so no write-role gate is needed.
 */
const napConsistencyRoutes = express.Router();

napConsistencyRoutes.use(authenticateToken, rbacMiddleware, locationScopeMiddleware);

// GET /api/nap-consistency — latest observation + bounded history for the
// caller's location. Optional `?locationId=` (must be an accessible location)
// and `?limit=`.
napConsistencyRoutes.get("/", NapConsistencyController.getForLocation);

export default napConsistencyRoutes;
