/**
 * User Website — Post & Taxonomy Handlers
 *
 * Thin HTTP handlers for owner-facing posts, post types, categories, and tags.
 * Each handler resolves the org's project/template, calls the shared manager or
 * content service, and shapes the response. No business logic lives here.
 *
 * Re-exported from UserWebsiteController so the route file's
 * `import * as controller` surface stays unchanged.
 */

import { Response } from "express";
import { RBACRequest } from "../../middleware/rbac";
import * as postManager from "../admin-websites/feature-services/service.post-manager";
import * as postTypeManager from "../admin-websites/feature-services/service.post-type-manager";
import * as contentService from "./user-website-services/websiteContent.service";
import { handleError, sendManagerResult } from "./user-website-utils/responses";

/** Resolve projectId + templateId from orgId (null when no website). */
async function getProjectAndTemplate(orgId: number) {
  return contentService.resolveProjectIds(orgId);
}

/** GET /api/user/website/posts */
export async function listPosts(req: RBACRequest, res: Response): Promise<Response> {
  try {
    const orgId = req.organizationId;
    if (!orgId) return res.status(400).json({ error: "No organization found" });
    const ids = await getProjectAndTemplate(orgId);
    if (!ids) return res.status(404).json({ error: "No website found" });

    const { post_type_id, status } = req.query as Record<string, string>;
    const result = await postManager.listPosts(ids.projectId, { post_type_id, status });
    return sendManagerResult(res, result, { data: result.posts });
  } catch (error) {
    return handleError(res, error, "List posts");
  }
}

/** POST /api/user/website/posts */
export async function createUserPost(req: RBACRequest, res: Response): Promise<Response> {
  try {
    const orgId = req.organizationId;
    if (!orgId) return res.status(400).json({ error: "No organization found" });
    const ids = await getProjectAndTemplate(orgId);
    if (!ids) return res.status(404).json({ error: "No website found" });

    const result = await postManager.createPost(ids.projectId, req.body);
    return sendManagerResult(res, result, { successStatus: 201, data: result.post });
  } catch (error) {
    return handleError(res, error, "Create post");
  }
}

/** GET /api/user/website/posts/:postId */
export async function getPost(req: RBACRequest, res: Response): Promise<Response> {
  try {
    const orgId = req.organizationId;
    if (!orgId) return res.status(400).json({ error: "No organization found" });
    const ids = await getProjectAndTemplate(orgId);
    if (!ids) return res.status(404).json({ error: "No website found" });

    const post = await postManager.getPost(ids.projectId, req.params.postId);
    if (!post) return res.status(404).json({ error: "Post not found" });
    return res.json({ success: true, data: post });
  } catch (error) {
    return handleError(res, error, "Get post");
  }
}

/** PATCH /api/user/website/posts/:postId */
export async function updateUserPost(req: RBACRequest, res: Response): Promise<Response> {
  try {
    const orgId = req.organizationId;
    if (!orgId) return res.status(400).json({ error: "No organization found" });
    const ids = await getProjectAndTemplate(orgId);
    if (!ids) return res.status(404).json({ error: "No website found" });

    const result = await postManager.updatePost(ids.projectId, req.params.postId, req.body);
    return sendManagerResult(res, result, { data: result.post });
  } catch (error) {
    return handleError(res, error, "Update post");
  }
}

/** DELETE /api/user/website/posts/:postId */
export async function deleteUserPost(req: RBACRequest, res: Response): Promise<Response> {
  try {
    const orgId = req.organizationId;
    if (!orgId) return res.status(400).json({ error: "No organization found" });
    const ids = await getProjectAndTemplate(orgId);
    if (!ids) return res.status(404).json({ error: "No website found" });

    const result = await postManager.deletePost(ids.projectId, req.params.postId);
    return sendManagerResult(res, result);
  } catch (error) {
    return handleError(res, error, "Delete post");
  }
}

/** GET /api/user/website/post-types */
export async function listPostTypes(req: RBACRequest, res: Response): Promise<Response> {
  try {
    const orgId = req.organizationId;
    if (!orgId) return res.status(400).json({ error: "No organization found" });
    const ids = await getProjectAndTemplate(orgId);
    if (!ids || !ids.templateId) return res.status(404).json({ error: "No website or template found" });

    const result = await postTypeManager.listPostTypes(ids.templateId);
    return sendManagerResult(res, result, { data: result.postTypes });
  } catch (error) {
    return handleError(res, error, "List post types");
  }
}

/** GET /api/user/website/post-types/:postTypeId/categories */
export async function listCategories(req: RBACRequest, res: Response): Promise<Response> {
  try {
    const orgId = req.organizationId;
    if (!orgId) return res.status(400).json({ error: "No organization found" });
    const ids = await getProjectAndTemplate(orgId);
    if (!ids) return res.status(404).json({ error: "No website found" });

    const categories = await contentService.listCategories(req.params.postTypeId);
    return res.json({ success: true, data: categories });
  } catch (error) {
    return handleError(res, error, "List categories");
  }
}

/** POST /api/user/website/post-types/:postTypeId/categories */
export async function createUserCategory(req: RBACRequest, res: Response): Promise<Response> {
  try {
    const orgId = req.organizationId;
    if (!orgId) return res.status(400).json({ error: "No organization found" });
    const ids = await getProjectAndTemplate(orgId);
    if (!ids) return res.status(404).json({ error: "No website found" });

    const { name, slug, parent_id } = req.body;
    const category = await contentService.createCategory({
      postTypeId: req.params.postTypeId,
      name,
      slug,
      parentId: parent_id,
    });
    return res.status(201).json({ success: true, data: category });
  } catch (error) {
    return handleError(res, error, "Create category");
  }
}

/** GET /api/user/website/post-types/:postTypeId/tags */
export async function listTags(req: RBACRequest, res: Response): Promise<Response> {
  try {
    const orgId = req.organizationId;
    if (!orgId) return res.status(400).json({ error: "No organization found" });
    const ids = await getProjectAndTemplate(orgId);
    if (!ids) return res.status(404).json({ error: "No website found" });

    const tags = await contentService.listTags(req.params.postTypeId);
    return res.json({ success: true, data: tags });
  } catch (error) {
    return handleError(res, error, "List tags");
  }
}

/** POST /api/user/website/post-types/:postTypeId/tags */
export async function createUserTag(req: RBACRequest, res: Response): Promise<Response> {
  try {
    const orgId = req.organizationId;
    if (!orgId) return res.status(400).json({ error: "No organization found" });
    const ids = await getProjectAndTemplate(orgId);
    if (!ids) return res.status(404).json({ error: "No website found" });

    const { name, slug } = req.body;
    const tag = await contentService.createTag({
      postTypeId: req.params.postTypeId,
      name,
      slug,
    });
    return res.status(201).json({ success: true, data: tag });
  } catch (error) {
    return handleError(res, error, "Create tag");
  }
}

/** PATCH /api/user/website/posts/:postId/seo */
export async function updateUserPostSeo(req: RBACRequest, res: Response): Promise<Response> {
  try {
    const orgId = req.organizationId;
    if (!orgId) return res.status(400).json({ error: "No organization found" });
    const ids = await getProjectAndTemplate(orgId);
    if (!ids) return res.status(404).json({ error: "No website found" });

    const ok = await contentService.updatePostSeo({
      projectId: ids.projectId,
      postId: req.params.postId,
      seo: req.body,
    });
    if (!ok) return res.status(404).json({ error: "Post not found" });

    return res.json({ success: true });
  } catch (error) {
    return handleError(res, error, "Update post SEO");
  }
}
