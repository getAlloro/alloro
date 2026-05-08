import express from "express";
import { authenticateToken } from "../../middleware/auth";
import { superAdminMiddleware } from "../../middleware/superAdmin";
import * as controller from "../../controllers/pm/PmStatsController";

const router = express.Router();

router.get("/", authenticateToken, superAdminMiddleware, controller.getStats);
router.get("/velocity", authenticateToken, superAdminMiddleware, controller.getVelocity);
router.get("/chart-data", authenticateToken, superAdminMiddleware, controller.getChartData);
router.get("/me", authenticateToken, superAdminMiddleware, controller.getMyStats);
router.get("/assigned/:userId", authenticateToken, superAdminMiddleware, controller.getAssignedStats);
router.get("/velocity/me", authenticateToken, superAdminMiddleware, controller.getMyVelocity);
router.get("/velocity/assigned/:userId", authenticateToken, superAdminMiddleware, controller.getAssignedVelocity);

export default router;
