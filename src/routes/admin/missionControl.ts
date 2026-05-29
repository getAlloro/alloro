import express from "express";
import { authenticateToken } from "../../middleware/auth";
import { superAdminMiddleware } from "../../middleware/superAdmin";
import * as controller from "../../controllers/admin-mission-control/AdminMissionControlController";

const router = express.Router();

router.get("/", authenticateToken, superAdminMiddleware, controller.getOverview);

router.post(
  "/insight",
  authenticateToken,
  superAdminMiddleware,
  controller.getInsight,
);

export default router;
