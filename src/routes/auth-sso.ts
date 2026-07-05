/**
 * Auth SSO Routes — Google sign-in for the admin (P1).
 *
 * Mounted at /api/auth/google. `/api/auth` is already a public prefix
 * (middleware/publicRoutes), so start/callback are reachable without a JWT —
 * they ARE the login entry. `start` is rate-limited (§11.3) as a public entry
 * point. The P2 link/unlink routes (which require authenticateToken) are added
 * when the user/client login flow ships.
 */

import express from "express";
import { AuthSsoController } from "../controllers/auth-sso/AuthSsoController";
import { authLimiter } from "../middleware/publicRateLimiter";

const authSsoRoutes = express.Router();

authSsoRoutes.get("/start", authLimiter, AuthSsoController.start);
authSsoRoutes.get("/callback", AuthSsoController.callback);

export default authSsoRoutes;
