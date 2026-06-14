/**
 * Admin Websites — Templates sub-router
 *
 * Template CRUD plus all template-scoped sub-resources: post taxonomy
 * (categories/tags), template pages, template post types, post blocks,
 * review blocks, menu templates, and template HFCM code snippets.
 *
 * Mounted by `../websites.ts` AFTER the super-admin auth hoist, so every
 * route here inherits `[authenticateToken, superAdminMiddleware]`. Internal
 * route order is preserved exactly: literal/sub-paths are declared before the
 * parameterized `/templates/:templateId` matcher to avoid shadowing.
 */

import express from "express";
import * as controller from "../../../controllers/admin-websites/AdminWebsitesController";

const router = express.Router();

// =====================================================================
// TEMPLATES
// =====================================================================

// GET  /templates — List all templates
router.get("/templates", controller.listTemplates);

// POST /templates — Create a template
router.post("/templates", controller.createTemplate);

// =====================================================================
// POST TAXONOMY (non-parameterized by template — before template sub-paths)
// =====================================================================

// GET  /post-types/:postTypeId/categories — List categories
router.get("/post-types/:postTypeId/categories", controller.listCategories);

// POST /post-types/:postTypeId/categories — Create category
router.post("/post-types/:postTypeId/categories", controller.createCategory);

// PATCH /post-types/:postTypeId/categories/:categoryId — Update category
router.patch("/post-types/:postTypeId/categories/:categoryId", controller.updateCategory);

// DELETE /post-types/:postTypeId/categories/:categoryId — Delete category
router.delete("/post-types/:postTypeId/categories/:categoryId", controller.deleteCategory);

// GET  /post-types/:postTypeId/tags — List tags
router.get("/post-types/:postTypeId/tags", controller.listTags);

// POST /post-types/:postTypeId/tags — Create tag
router.post("/post-types/:postTypeId/tags", controller.createTag);

// PATCH /post-types/:postTypeId/tags/:tagId — Update tag
router.patch("/post-types/:postTypeId/tags/:tagId", controller.updateTag);

// DELETE /post-types/:postTypeId/tags/:tagId — Delete tag
router.delete("/post-types/:postTypeId/tags/:tagId", controller.deleteTag);

// =====================================================================
// TEMPLATE PAGES (must come before /templates/:templateId)
// =====================================================================

// GET  /templates/:templateId/pages — List template pages
router.get("/templates/:templateId/pages", controller.listTemplatePages);

// POST /templates/:templateId/pages — Create template page
router.post("/templates/:templateId/pages", controller.createTemplatePage);

// GET  /templates/:templateId/pages/:pageId — Get template page
router.get("/templates/:templateId/pages/:pageId", controller.getTemplatePage);

// PATCH /templates/:templateId/pages/:pageId — Update template page
router.patch("/templates/:templateId/pages/:pageId", controller.updateTemplatePage);

// DELETE /templates/:templateId/pages/:pageId — Delete template page
router.delete("/templates/:templateId/pages/:pageId", controller.deleteTemplatePage);

// GET   /templates/:templateId/pages/:pageId/slots — Template page dynamic_slots (Plan B)
router.get("/templates/:templateId/pages/:pageId/slots", controller.getTemplatePageSlots);

// PATCH /templates/:templateId/pages/:pageId/slots — Update dynamic_slots (admin tool)
router.patch("/templates/:templateId/pages/:pageId/slots", controller.updateTemplatePageSlots);

// =====================================================================
// TEMPLATE POST TYPES (must come before /templates/:templateId)
// =====================================================================

// GET  /templates/:templateId/post-types — List post types
router.get("/templates/:templateId/post-types", controller.listPostTypes);

// POST /templates/:templateId/post-types — Create post type
router.post("/templates/:templateId/post-types", controller.createPostType);

// GET  /templates/:templateId/post-types/:postTypeId — Get post type
router.get("/templates/:templateId/post-types/:postTypeId", controller.getPostType);

// PATCH /templates/:templateId/post-types/:postTypeId — Update post type
router.patch("/templates/:templateId/post-types/:postTypeId", controller.updatePostType);

// DELETE /templates/:templateId/post-types/:postTypeId — Delete post type
router.delete("/templates/:templateId/post-types/:postTypeId", controller.deletePostType);

// =====================================================================
// TEMPLATE POST BLOCKS (must come before /templates/:templateId)
// =====================================================================

// GET  /templates/:templateId/post-blocks — List post blocks
router.get("/templates/:templateId/post-blocks", controller.listPostBlocks);

// POST /templates/:templateId/post-blocks — Create post block
router.post("/templates/:templateId/post-blocks", controller.createPostBlock);

// GET  /templates/:templateId/post-blocks/:postBlockId — Get post block
router.get("/templates/:templateId/post-blocks/:postBlockId", controller.getPostBlock);

// PATCH /templates/:templateId/post-blocks/:postBlockId — Update post block
router.patch("/templates/:templateId/post-blocks/:postBlockId", controller.updatePostBlock);

// DELETE /templates/:templateId/post-blocks/:postBlockId — Delete post block
router.delete("/templates/:templateId/post-blocks/:postBlockId", controller.deletePostBlock);

// =====================================================================
// TEMPLATE REVIEW BLOCKS (must come before /templates/:templateId)
// =====================================================================

// GET  /templates/:templateId/review-blocks — List review blocks
router.get("/templates/:templateId/review-blocks", controller.listReviewBlocks);

// POST /templates/:templateId/review-blocks — Create review block
router.post("/templates/:templateId/review-blocks", controller.createReviewBlock);

// GET  /templates/:templateId/review-blocks/:reviewBlockId — Get review block
router.get("/templates/:templateId/review-blocks/:reviewBlockId", controller.getReviewBlock);

// PATCH /templates/:templateId/review-blocks/:reviewBlockId — Update review block
router.patch("/templates/:templateId/review-blocks/:reviewBlockId", controller.updateReviewBlock);

// DELETE /templates/:templateId/review-blocks/:reviewBlockId — Delete review block
router.delete("/templates/:templateId/review-blocks/:reviewBlockId", controller.deleteReviewBlock);

// =====================================================================
// TEMPLATE MENU TEMPLATES (must come before /templates/:templateId)
// =====================================================================

// GET  /templates/:templateId/menu-templates — List menu templates
router.get("/templates/:templateId/menu-templates", controller.listMenuTemplates);

// POST /templates/:templateId/menu-templates — Create menu template
router.post("/templates/:templateId/menu-templates", controller.createMenuTemplate);

// GET  /templates/:templateId/menu-templates/:menuTemplateId — Get menu template
router.get("/templates/:templateId/menu-templates/:menuTemplateId", controller.getMenuTemplate);

// PATCH /templates/:templateId/menu-templates/:menuTemplateId — Update menu template
router.patch("/templates/:templateId/menu-templates/:menuTemplateId", controller.updateMenuTemplate);

// DELETE /templates/:templateId/menu-templates/:menuTemplateId — Delete menu template
router.delete("/templates/:templateId/menu-templates/:menuTemplateId", controller.deleteMenuTemplate);

// =====================================================================
// TEMPLATE HFCM (must come before /templates/:templateId)
// =====================================================================

// PATCH /templates/:templateId/code-snippets/reorder — Reorder (before :id)
router.patch("/templates/:templateId/code-snippets/reorder", controller.reorderTemplateSnippets);

// GET  /templates/:templateId/code-snippets — List template snippets
router.get("/templates/:templateId/code-snippets", controller.listTemplateSnippets);

// POST /templates/:templateId/code-snippets — Create template snippet
router.post("/templates/:templateId/code-snippets", controller.createTemplateSnippet);

// PATCH /templates/:templateId/code-snippets/:id/toggle — Toggle (before :id patch)
router.patch("/templates/:templateId/code-snippets/:id/toggle", controller.toggleTemplateSnippet);

// PATCH /templates/:templateId/code-snippets/:id — Update template snippet
router.patch("/templates/:templateId/code-snippets/:id", controller.updateTemplateSnippet);

// DELETE /templates/:templateId/code-snippets/:id — Delete template snippet
router.delete("/templates/:templateId/code-snippets/:id", controller.deleteTemplateSnippet);

// =====================================================================
// TEMPLATES (parameterized — after sub-paths)
// =====================================================================

// GET  /templates/:templateId — Get template with pages
router.get("/templates/:templateId", controller.getTemplate);

// PATCH /templates/:templateId — Update template
router.patch("/templates/:templateId", controller.updateTemplate);

// DELETE /templates/:templateId — Delete template
router.delete("/templates/:templateId", controller.deleteTemplate);

// POST /templates/:templateId/activate — Activate template
router.post("/templates/:templateId/activate", controller.activateTemplate);

export default router;
