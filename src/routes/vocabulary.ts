import express from "express";
import { authenticateToken } from "../middleware/auth";
import { rbacMiddleware } from "../middleware/rbac";
import { getVocabulary } from "../controllers/vocabulary/VocabularyController";

/**
 * Vocabulary read routes. Thin definitions only (§7.2): method/path + auth
 * middleware, delegating to the controller. rbacMiddleware populates
 * req.organizationId so the controller can scope to the caller's tenant.
 */
const vocabularyRoutes = express.Router();

// GET /api/vocabulary — the authenticated org's resolved vocabulary preset.
vocabularyRoutes.get("/", authenticateToken, rbacMiddleware, getVocabulary);

export default vocabularyRoutes;
