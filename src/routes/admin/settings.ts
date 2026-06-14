import { Router } from "express";
import { AdminSettingsController } from "../../controllers/admin-settings/admin-settings.controller";
import { authenticateToken } from "../../middleware/auth";
import { superAdminMiddleware } from "../../middleware/superAdmin";

const router = Router();

// Super-admin only. The app-level guard enforces authentication globally; this
// router-level layer additionally requires super-admin (the app-level guard
// alone would let any authenticated user through, and rbac default-allows
// orgless users as viewer).
router.use(authenticateToken, superAdminMiddleware);

router.get("/", AdminSettingsController.getAllSettings);
router.get("/:category/:key", AdminSettingsController.getSetting);
router.put("/:category/:key", AdminSettingsController.upsertSetting);

export default router;
