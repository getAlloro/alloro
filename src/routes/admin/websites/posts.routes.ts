/**
 * Admin Websites — Project Posts sub-router
 *
 * Post list, AI-generate, create, and single-post get/update/delete.
 *
 * Mounted by `../websites.ts` AFTER the super-admin auth hoist, so every route
 * inherits `[authenticateToken, superAdminMiddleware]`. The literal
 * `/:id/posts/ai-generate` precedes the `:postId` matcher, matching original
 * order.
 */

import express from "express";
import * as controller from "../../../controllers/admin-websites/AdminWebsitesController";

const router = express.Router();

// =====================================================================
// PROJECT POSTS
// =====================================================================

// GET  /:id/posts — List posts for a project
router.get("/:id/posts", controller.listPosts);

// POST /:id/posts/ai-generate — AI generate post content (before :postId)
router.post("/:id/posts/ai-generate", controller.aiGeneratePost);

// POST /:id/posts — Create a post
router.post("/:id/posts", controller.createPost);

// GET  /:id/posts/:postId — Get a post
router.get("/:id/posts/:postId", controller.getPost);

// PATCH /:id/posts/:postId — Update a post
router.patch("/:id/posts/:postId", controller.updatePost);

// DELETE /:id/posts/:postId — Delete a post
router.delete("/:id/posts/:postId", controller.deletePost);

export default router;
