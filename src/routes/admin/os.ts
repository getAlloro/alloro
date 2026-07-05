import express from "express";
import { authenticateToken } from "../../middleware/auth";
import { superAdminMiddleware } from "../../middleware/superAdmin";
import { AdminOsController } from "../../controllers/admin-os/AdminOsController";
import { getOsKnowledgeBaseConfig } from "../../config/osKnowledgeBase";

// Fail fast at boot (§5.6): parsing validates every OS_* value, including the
// OS_EMBEDDING_DIM ↔ vector(1536) migration match. Throws before mounting.
getOsKnowledgeBaseConfig();

const router = express.Router();

// The whole OS domain is super-admin only (§11.1, master spec D3) — gate first,
// before any handler. Analog: src/routes/admin/auth.ts.
router.use(authenticateToken, superAdminMiddleware);

router.get("/ping", AdminOsController.ping);
router.get("/users", AdminOsController.listUsers);

export default router;
