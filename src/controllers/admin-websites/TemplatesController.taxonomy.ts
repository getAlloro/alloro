/**
 * Admin Websites — Templates Controller (taxonomy + blocks)
 *
 * Template sub-resources: post types, post blocks, menu templates, review
 * blocks, and post taxonomy (categories + tags).
 *
 * Behavior-preserving split from the former monolithic AdminWebsitesController.
 * Handlers and helpers are moved verbatim; logic is unchanged. Bound by the
 * matching resource sub-router under src/routes/admin/websites/.
 */

import { Request, Response } from "express";
import * as postTypeManager from "./feature-services/service.post-type-manager";
import * as postBlockManager from "./feature-services/service.post-block-manager";
import * as menuTemplateManager from "./feature-services/service.menu-template-manager";
import * as postTaxonomyManager from "./feature-services/service.post-taxonomy-manager";
import * as reviewBlockManager from "./feature-services/service.review-block-manager";
import logger from "../../lib/logger";

/** GET /templates/:templateId/post-types */
export async function listPostTypes(req: Request, res: Response): Promise<Response> {
  try {
    const { templateId } = req.params;
    const result = await postTypeManager.listPostTypes(templateId);
    if (result.error) return res.status(result.error.status).json({ success: false, ...result.error });
    return res.json({ success: true, data: result.postTypes });
  } catch (error: any) {
    logger.error({ err: error }, "[Admin Websites] Error listing post types:");
    return res.status(500).json({ success: false, error: "LIST_ERROR", message: error?.message });
  }
}

/** POST /templates/:templateId/post-types */

/** POST /templates/:templateId/post-types */
export async function createPostType(req: Request, res: Response): Promise<Response> {
  try {
    const { templateId } = req.params;
    const result = await postTypeManager.createPostType(templateId, req.body);
    if (result.error) return res.status(result.error.status).json({ success: false, ...result.error });
    return res.status(201).json({ success: true, data: result.postType });
  } catch (error: any) {
    logger.error({ err: error }, "[Admin Websites] Error creating post type:");
    return res.status(500).json({ success: false, error: "CREATE_ERROR", message: error?.message });
  }
}

/** GET /templates/:templateId/post-types/:postTypeId */

/** GET /templates/:templateId/post-types/:postTypeId */
export async function getPostType(req: Request, res: Response): Promise<Response> {
  try {
    const { templateId, postTypeId } = req.params;
    const postType = await postTypeManager.getPostType(templateId, postTypeId);
    if (!postType) return res.status(404).json({ success: false, error: "NOT_FOUND", message: "Post type not found" });
    return res.json({ success: true, data: postType });
  } catch (error: any) {
    logger.error({ err: error }, "[Admin Websites] Error getting post type:");
    return res.status(500).json({ success: false, error: "GET_ERROR", message: error?.message });
  }
}

/** PATCH /templates/:templateId/post-types/:postTypeId */

/** PATCH /templates/:templateId/post-types/:postTypeId */
export async function updatePostType(req: Request, res: Response): Promise<Response> {
  try {
    const { templateId, postTypeId } = req.params;
    const result = await postTypeManager.updatePostType(templateId, postTypeId, req.body);
    if (result.error) return res.status(result.error.status).json({ success: false, ...result.error });
    return res.json({ success: true, data: result.postType });
  } catch (error: any) {
    logger.error({ err: error }, "[Admin Websites] Error updating post type:");
    return res.status(500).json({ success: false, error: "UPDATE_ERROR", message: error?.message });
  }
}

/** DELETE /templates/:templateId/post-types/:postTypeId */

/** DELETE /templates/:templateId/post-types/:postTypeId */
export async function deletePostType(req: Request, res: Response): Promise<Response> {
  try {
    const { templateId, postTypeId } = req.params;
    const result = await postTypeManager.deletePostType(templateId, postTypeId);
    if (result.error) return res.status(result.error.status).json({ success: false, ...result.error });
    return res.json({ success: true });
  } catch (error: any) {
    logger.error({ err: error }, "[Admin Websites] Error deleting post type:");
    return res.status(500).json({ success: false, error: "DELETE_ERROR", message: error?.message });
  }
}

// =====================================================================
// POST BLOCKS
// =====================================================================

/** GET /templates/:templateId/post-blocks */

/** GET /templates/:templateId/post-blocks */
export async function listPostBlocks(req: Request, res: Response): Promise<Response> {
  try {
    const { templateId } = req.params;
    const result = await postBlockManager.listPostBlocks(templateId);
    if (result.error) return res.status(result.error.status).json({ success: false, ...result.error });
    return res.json({ success: true, data: result.postBlocks });
  } catch (error: any) {
    logger.error({ err: error }, "[Admin Websites] Error listing post blocks:");
    return res.status(500).json({ success: false, error: "LIST_ERROR", message: error?.message });
  }
}

/** POST /templates/:templateId/post-blocks */

/** POST /templates/:templateId/post-blocks */
export async function createPostBlock(req: Request, res: Response): Promise<Response> {
  try {
    const { templateId } = req.params;
    const result = await postBlockManager.createPostBlock(templateId, req.body);
    if (result.error) return res.status(result.error.status).json({ success: false, ...result.error });
    return res.status(201).json({ success: true, data: result.postBlock });
  } catch (error: any) {
    logger.error({ err: error }, "[Admin Websites] Error creating post block:");
    return res.status(500).json({ success: false, error: "CREATE_ERROR", message: error?.message });
  }
}

/** GET /templates/:templateId/post-blocks/:postBlockId */

/** GET /templates/:templateId/post-blocks/:postBlockId */
export async function getPostBlock(req: Request, res: Response): Promise<Response> {
  try {
    const { templateId, postBlockId } = req.params;
    const postBlock = await postBlockManager.getPostBlock(templateId, postBlockId);
    if (!postBlock) return res.status(404).json({ success: false, error: "NOT_FOUND", message: "Post block not found" });
    return res.json({ success: true, data: postBlock });
  } catch (error: any) {
    logger.error({ err: error }, "[Admin Websites] Error getting post block:");
    return res.status(500).json({ success: false, error: "GET_ERROR", message: error?.message });
  }
}

/** PATCH /templates/:templateId/post-blocks/:postBlockId */

/** PATCH /templates/:templateId/post-blocks/:postBlockId */
export async function updatePostBlock(req: Request, res: Response): Promise<Response> {
  try {
    const { templateId, postBlockId } = req.params;
    const result = await postBlockManager.updatePostBlock(templateId, postBlockId, req.body);
    if (result.error) return res.status(result.error.status).json({ success: false, ...result.error });
    return res.json({ success: true, data: result.postBlock });
  } catch (error: any) {
    logger.error({ err: error }, "[Admin Websites] Error updating post block:");
    return res.status(500).json({ success: false, error: "UPDATE_ERROR", message: error?.message });
  }
}

/** DELETE /templates/:templateId/post-blocks/:postBlockId */

/** DELETE /templates/:templateId/post-blocks/:postBlockId */
export async function deletePostBlock(req: Request, res: Response): Promise<Response> {
  try {
    const { templateId, postBlockId } = req.params;
    const result = await postBlockManager.deletePostBlock(templateId, postBlockId);
    if (result.error) return res.status(result.error.status).json({ success: false, ...result.error });
    return res.json({ success: true });
  } catch (error: any) {
    logger.error({ err: error }, "[Admin Websites] Error deleting post block:");
    return res.status(500).json({ success: false, error: "DELETE_ERROR", message: error?.message });
  }
}

// =====================================================================
// MENU TEMPLATES
// =====================================================================

/** GET /templates/:templateId/menu-templates */

/** GET /templates/:templateId/menu-templates */
export async function listMenuTemplates(req: Request, res: Response): Promise<Response> {
  try {
    const { templateId } = req.params;
    const result = await menuTemplateManager.listMenuTemplates(templateId);
    if (result.error) return res.status(result.error.status).json({ success: false, ...result.error });
    return res.json({ success: true, data: result.menuTemplates });
  } catch (error: any) {
    logger.error({ err: error }, "[Admin Websites] Error listing menu templates:");
    return res.status(500).json({ success: false, error: "LIST_ERROR", message: error?.message });
  }
}

/** POST /templates/:templateId/menu-templates */

/** POST /templates/:templateId/menu-templates */
export async function createMenuTemplate(req: Request, res: Response): Promise<Response> {
  try {
    const { templateId } = req.params;
    const result = await menuTemplateManager.createMenuTemplate(templateId, req.body);
    if (result.error) return res.status(result.error.status).json({ success: false, ...result.error });
    return res.status(201).json({ success: true, data: result.menuTemplate });
  } catch (error: any) {
    logger.error({ err: error }, "[Admin Websites] Error creating menu template:");
    return res.status(500).json({ success: false, error: "CREATE_ERROR", message: error?.message });
  }
}

/** GET /templates/:templateId/menu-templates/:menuTemplateId */

/** GET /templates/:templateId/menu-templates/:menuTemplateId */
export async function getMenuTemplate(req: Request, res: Response): Promise<Response> {
  try {
    const { templateId, menuTemplateId } = req.params;
    const menuTemplate = await menuTemplateManager.getMenuTemplate(templateId, menuTemplateId);
    if (!menuTemplate) return res.status(404).json({ success: false, error: "NOT_FOUND", message: "Menu template not found" });
    return res.json({ success: true, data: menuTemplate });
  } catch (error: any) {
    logger.error({ err: error }, "[Admin Websites] Error getting menu template:");
    return res.status(500).json({ success: false, error: "GET_ERROR", message: error?.message });
  }
}

/** PATCH /templates/:templateId/menu-templates/:menuTemplateId */

/** PATCH /templates/:templateId/menu-templates/:menuTemplateId */
export async function updateMenuTemplate(req: Request, res: Response): Promise<Response> {
  try {
    const { templateId, menuTemplateId } = req.params;
    const result = await menuTemplateManager.updateMenuTemplate(templateId, menuTemplateId, req.body);
    if (result.error) return res.status(result.error.status).json({ success: false, ...result.error });
    return res.json({ success: true, data: result.menuTemplate });
  } catch (error: any) {
    logger.error({ err: error }, "[Admin Websites] Error updating menu template:");
    return res.status(500).json({ success: false, error: "UPDATE_ERROR", message: error?.message });
  }
}

/** DELETE /templates/:templateId/menu-templates/:menuTemplateId */

/** DELETE /templates/:templateId/menu-templates/:menuTemplateId */
export async function deleteMenuTemplate(req: Request, res: Response): Promise<Response> {
  try {
    const { templateId, menuTemplateId } = req.params;
    const result = await menuTemplateManager.deleteMenuTemplate(templateId, menuTemplateId);
    if (result.error) return res.status(result.error.status).json({ success: false, ...result.error });
    return res.json({ success: true });
  } catch (error: any) {
    logger.error({ err: error }, "[Admin Websites] Error deleting menu template:");
    return res.status(500).json({ success: false, error: "DELETE_ERROR", message: error?.message });
  }
}

// =====================================================================
// POST TAXONOMY (Categories & Tags)
// =====================================================================

/** GET /post-types/:postTypeId/categories */

/** GET /post-types/:postTypeId/categories */
export async function listCategories(req: Request, res: Response): Promise<Response> {
  try {
    const { postTypeId } = req.params;
    const result = await postTaxonomyManager.listCategories(postTypeId);
    if (result.error) return res.status(result.error.status).json({ success: false, ...result.error });
    return res.json({ success: true, data: result.categories });
  } catch (error: any) {
    logger.error({ err: error }, "[Admin Websites] Error listing categories:");
    return res.status(500).json({ success: false, error: "LIST_ERROR", message: error?.message });
  }
}

/** POST /post-types/:postTypeId/categories */

/** POST /post-types/:postTypeId/categories */
export async function createCategory(req: Request, res: Response): Promise<Response> {
  try {
    const { postTypeId } = req.params;
    const result = await postTaxonomyManager.createCategory(postTypeId, req.body);
    if (result.error) return res.status(result.error.status).json({ success: false, ...result.error });
    return res.status(201).json({ success: true, data: result.category });
  } catch (error: any) {
    logger.error({ err: error }, "[Admin Websites] Error creating category:");
    return res.status(500).json({ success: false, error: "CREATE_ERROR", message: error?.message });
  }
}

/** PATCH /post-types/:postTypeId/categories/:categoryId */

/** PATCH /post-types/:postTypeId/categories/:categoryId */
export async function updateCategory(req: Request, res: Response): Promise<Response> {
  try {
    const { postTypeId, categoryId } = req.params;
    const result = await postTaxonomyManager.updateCategory(postTypeId, categoryId, req.body);
    if (result.error) return res.status(result.error.status).json({ success: false, ...result.error });
    return res.json({ success: true, data: result.category });
  } catch (error: any) {
    logger.error({ err: error }, "[Admin Websites] Error updating category:");
    return res.status(500).json({ success: false, error: "UPDATE_ERROR", message: error?.message });
  }
}

/** DELETE /post-types/:postTypeId/categories/:categoryId */

/** DELETE /post-types/:postTypeId/categories/:categoryId */
export async function deleteCategory(req: Request, res: Response): Promise<Response> {
  try {
    const { postTypeId, categoryId } = req.params;
    const result = await postTaxonomyManager.deleteCategory(postTypeId, categoryId);
    if (result.error) return res.status(result.error.status).json({ success: false, ...result.error });
    return res.json({ success: true });
  } catch (error: any) {
    logger.error({ err: error }, "[Admin Websites] Error deleting category:");
    return res.status(500).json({ success: false, error: "DELETE_ERROR", message: error?.message });
  }
}

/** GET /post-types/:postTypeId/tags */

/** GET /post-types/:postTypeId/tags */
export async function listTags(req: Request, res: Response): Promise<Response> {
  try {
    const { postTypeId } = req.params;
    const result = await postTaxonomyManager.listTags(postTypeId);
    if (result.error) return res.status(result.error.status).json({ success: false, ...result.error });
    return res.json({ success: true, data: result.tags });
  } catch (error: any) {
    logger.error({ err: error }, "[Admin Websites] Error listing tags:");
    return res.status(500).json({ success: false, error: "LIST_ERROR", message: error?.message });
  }
}

/** POST /post-types/:postTypeId/tags */

/** POST /post-types/:postTypeId/tags */
export async function createTag(req: Request, res: Response): Promise<Response> {
  try {
    const { postTypeId } = req.params;
    const result = await postTaxonomyManager.createTag(postTypeId, req.body);
    if (result.error) return res.status(result.error.status).json({ success: false, ...result.error });
    return res.status(201).json({ success: true, data: result.tag });
  } catch (error: any) {
    logger.error({ err: error }, "[Admin Websites] Error creating tag:");
    return res.status(500).json({ success: false, error: "CREATE_ERROR", message: error?.message });
  }
}

/** PATCH /post-types/:postTypeId/tags/:tagId */

/** PATCH /post-types/:postTypeId/tags/:tagId */
export async function updateTag(req: Request, res: Response): Promise<Response> {
  try {
    const { postTypeId, tagId } = req.params;
    const result = await postTaxonomyManager.updateTag(postTypeId, tagId, req.body);
    if (result.error) return res.status(result.error.status).json({ success: false, ...result.error });
    return res.json({ success: true, data: result.tag });
  } catch (error: any) {
    logger.error({ err: error }, "[Admin Websites] Error updating tag:");
    return res.status(500).json({ success: false, error: "UPDATE_ERROR", message: error?.message });
  }
}

/** DELETE /post-types/:postTypeId/tags/:tagId */

/** DELETE /post-types/:postTypeId/tags/:tagId */
export async function deleteTag(req: Request, res: Response): Promise<Response> {
  try {
    const { postTypeId, tagId } = req.params;
    const result = await postTaxonomyManager.deleteTag(postTypeId, tagId);
    if (result.error) return res.status(result.error.status).json({ success: false, ...result.error });
    return res.json({ success: true });
  } catch (error: any) {
    logger.error({ err: error }, "[Admin Websites] Error deleting tag:");
    return res.status(500).json({ success: false, error: "DELETE_ERROR", message: error?.message });
  }
}

// =====================================================================
// POSTS
// =====================================================================

/** GET /:id/posts */

/** GET /templates/:templateId/review-blocks */
export async function listReviewBlocks(req: Request, res: Response): Promise<Response> {
  try {
    const { templateId } = req.params;
    const result = await reviewBlockManager.listReviewBlocks(templateId);
    if (result.error) return res.status(result.error.status).json({ success: false, ...result.error });
    return res.json({ success: true, data: result.reviewBlocks });
  } catch (error: any) {
    logger.error({ err: error }, "[Admin Websites] Error listing review blocks:");
    return res.status(500).json({ success: false, error: "LIST_ERROR", message: error?.message });
  }
}

/** POST /templates/:templateId/review-blocks */

/** POST /templates/:templateId/review-blocks */
export async function createReviewBlock(req: Request, res: Response): Promise<Response> {
  try {
    const { templateId } = req.params;
    const result = await reviewBlockManager.createReviewBlock(templateId, req.body);
    if (result.error) return res.status(result.error.status).json({ success: false, ...result.error });
    return res.status(201).json({ success: true, data: result.reviewBlock });
  } catch (error: any) {
    logger.error({ err: error }, "[Admin Websites] Error creating review block:");
    return res.status(500).json({ success: false, error: "CREATE_ERROR", message: error?.message });
  }
}

/** GET /templates/:templateId/review-blocks/:reviewBlockId */

/** GET /templates/:templateId/review-blocks/:reviewBlockId */
export async function getReviewBlock(req: Request, res: Response): Promise<Response> {
  try {
    const { templateId, reviewBlockId } = req.params;
    const reviewBlock = await reviewBlockManager.getReviewBlock(templateId, reviewBlockId);
    if (!reviewBlock) return res.status(404).json({ success: false, error: "NOT_FOUND", message: "Review block not found" });
    return res.json({ success: true, data: reviewBlock });
  } catch (error: any) {
    logger.error({ err: error }, "[Admin Websites] Error getting review block:");
    return res.status(500).json({ success: false, error: "GET_ERROR", message: error?.message });
  }
}

/** PATCH /templates/:templateId/review-blocks/:reviewBlockId */

/** PATCH /templates/:templateId/review-blocks/:reviewBlockId */
export async function updateReviewBlock(req: Request, res: Response): Promise<Response> {
  try {
    const { templateId, reviewBlockId } = req.params;
    const result = await reviewBlockManager.updateReviewBlock(templateId, reviewBlockId, req.body);
    if (result.error) return res.status(result.error.status).json({ success: false, ...result.error });
    return res.json({ success: true, data: result.reviewBlock });
  } catch (error: any) {
    logger.error({ err: error }, "[Admin Websites] Error updating review block:");
    return res.status(500).json({ success: false, error: "UPDATE_ERROR", message: error?.message });
  }
}

/** DELETE /templates/:templateId/review-blocks/:reviewBlockId */

/** DELETE /templates/:templateId/review-blocks/:reviewBlockId */
export async function deleteReviewBlock(req: Request, res: Response): Promise<Response> {
  try {
    const { templateId, reviewBlockId } = req.params;
    const result = await reviewBlockManager.deleteReviewBlock(templateId, reviewBlockId);
    if (result.error) return res.status(result.error.status).json({ success: false, ...result.error });
    return res.json({ success: true });
  } catch (error: any) {
    logger.error({ err: error }, "[Admin Websites] Error deleting review block:");
    return res.status(500).json({ success: false, error: "DELETE_ERROR", message: error?.message });
  }
}

/** POST /:id/reviews/sync — Trigger manual review sync for a project's org */
