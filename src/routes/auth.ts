import express, { Request, Response, NextFunction } from "express";
import * as controller from "../controllers/auth/AuthController";
import { validate } from "../middleware/validate";
import { validateTokenParamsSchema } from "../validation/auth.schemas";
import logger from "../lib/logger";

const router = express.Router();

// Test endpoint
router.get("/ttim", (_req: Request, res: Response) => {
  return res.json("hello");
});

// OAuth flow
router.get("/google", controller.getGoogleAuthUrl);
router.get("/callback", controller.handleOAuthCallback);
router.get("/google/callback", controller.handleOAuthCallback);

// Token management
// Validation: warn-only. The :connectionId param is the only client input on
// this OAuth router; body schemas live on auth-password / auth-otp instead.
router.get(
  "/google/validate/:connectionId",
  validate(validateTokenParamsSchema, { target: "params" }),
  controller.validateToken
);

// Scope management
router.get("/google/scopes", controller.getScopeInfo);
router.get("/google/reconnect", controller.getReconnectUrl);

// Error handling middleware
router.use((error: any, req: Request, res: Response, next: NextFunction) => {
  logger.error({ err: error }, "[AUTH] Unhandled route error:");
  if (!res.headersSent) {
    res.status(500).json({ error: "Internal server error" });
  }
  next(error);
});

export default router;
