import express from "express";
import rateLimit from "express-rate-limit";
import { authenticateToken } from "../middleware/auth";
import { rbacMiddleware } from "../middleware/rbac";
import * as controller from "../controllers/app-telemetry/AppTelemetryController";

const router = express.Router();

const telemetryLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    data: null,
    error: {
      code: "RATE_LIMITED",
      message: "Too many telemetry events.",
      details: null,
    },
  },
});

router.post(
  "/events",
  telemetryLimiter,
  authenticateToken,
  rbacMiddleware,
  controller.recordEvents,
);

export default router;
