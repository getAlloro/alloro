/**
 * Admin Websites — Posts Controller
 *
 * Project post CRUD plus AI post generation.
 *
 * Behavior-preserving split from the former monolithic AdminWebsitesController.
 * Handlers and helpers are moved verbatim; logic is unchanged. Bound by the
 * matching resource sub-router under src/routes/admin/websites/.
 */

import { Request, Response } from "express";
import * as postManager from "./feature-services/service.post-manager";
import { PostTypeModel } from "../../models/website-builder/PostTypeModel";
import logger from "../../lib/logger";

/** GET /:id/posts */
export async function listPosts(req: Request, res: Response): Promise<Response> {
  try {
    const projectId = req.params.id;
    const { post_type_id, status } = req.query;
    const result = await postManager.listPosts(projectId, {
      post_type_id: post_type_id as string | undefined,
      status: status as string | undefined,
    });
    if (result.error) return res.status(result.error.status).json({ success: false, ...result.error });
    return res.json({ success: true, data: result.posts });
  } catch (error: any) {
    logger.error({ err: error }, "[Admin Websites] Error listing posts:");
    return res.status(500).json({ success: false, error: "LIST_ERROR", message: error?.message });
  }
}

/** POST /:id/posts */

/** POST /:id/posts */
export async function createPost(req: Request, res: Response): Promise<Response> {
  try {
    const projectId = req.params.id;
    const result = await postManager.createPost(projectId, req.body);
    if (result.error) return res.status(result.error.status).json({ success: false, ...result.error });
    return res.status(201).json({ success: true, data: result.post });
  } catch (error: any) {
    logger.error({ err: error }, "[Admin Websites] Error creating post:");
    return res.status(500).json({ success: false, error: "CREATE_ERROR", message: error?.message });
  }
}

/** GET /:id/posts/:postId */

/** GET /:id/posts/:postId */
export async function getPost(req: Request, res: Response): Promise<Response> {
  try {
    const { id: projectId, postId } = req.params;
    const post = await postManager.getPost(projectId, postId);
    if (!post) return res.status(404).json({ success: false, error: "NOT_FOUND", message: "Post not found" });
    return res.json({ success: true, data: post });
  } catch (error: any) {
    logger.error({ err: error }, "[Admin Websites] Error getting post:");
    return res.status(500).json({ success: false, error: "GET_ERROR", message: error?.message });
  }
}

/** PATCH /:id/posts/:postId */

/** PATCH /:id/posts/:postId */
export async function updatePost(req: Request, res: Response): Promise<Response> {
  try {
    const { id: projectId, postId } = req.params;
    const result = await postManager.updatePost(projectId, postId, req.body);
    if (result.error) return res.status(result.error.status).json({ success: false, ...result.error });
    return res.json({ success: true, data: result.post });
  } catch (error: any) {
    logger.error({ err: error }, "[Admin Websites] Error updating post:");
    return res.status(500).json({ success: false, error: "UPDATE_ERROR", message: error?.message });
  }
}

/** DELETE /:id/posts/:postId */

/** DELETE /:id/posts/:postId */
export async function deletePost(req: Request, res: Response): Promise<Response> {
  try {
    const { id: projectId, postId } = req.params;
    const result = await postManager.deletePost(projectId, postId);
    if (result.error) return res.status(result.error.status).json({ success: false, ...result.error });
    return res.json({ success: true });
  } catch (error: any) {
    logger.error({ err: error }, "[Admin Websites] Error deleting post:");
    return res.status(500).json({ success: false, error: "DELETE_ERROR", message: error?.message });
  }
}

/** POST /:id/posts/:postId/duplicate */
export async function duplicatePost(req: Request, res: Response): Promise<Response> {
  try {
    const { id: projectId, postId } = req.params;
    const result = await postManager.duplicatePost(projectId, postId);
    if (result.error) return res.status(result.error.status).json({ success: false, ...result.error });
    return res.status(201).json({ success: true, data: result.post });
  } catch (error: any) {
    logger.error({ err: error }, "[Admin Websites] Error duplicating post:");
    return res.status(500).json({ success: false, error: "DUPLICATE_ERROR", message: error?.message });
  }
}

// =====================================================================
// MENUS
// =====================================================================

/** GET /:id/menus */

/** POST /:id/posts/ai-generate — Generate post content with AI */
export async function aiGeneratePost(req: Request, res: Response): Promise<Response> {
  try {
    const { id: projectId } = req.params;
    const { post_type_id, title, reference_url, reference_content } = req.body;

    if (!title || !post_type_id) {
      return res.status(400).json({ success: false, error: "INVALID_INPUT", message: "title and post_type_id are required" });
    }

    if (!reference_url && !reference_content) {
      return res.status(400).json({ success: false, error: "INVALID_INPUT", message: "reference_url or reference_content is required" });
    }

    // Resolve reference content
    let refContent = reference_content || "";
    if (reference_url && !refContent) {
      try {
        const scrapeResponse = await fetch(reference_url, {
          headers: { "User-Agent": "AlloroBot/1.0" },
          signal: AbortSignal.timeout(15000),
        });
        if (scrapeResponse.ok) {
          const html = await scrapeResponse.text();
          refContent = html
            .replace(/<script[\s\S]*?<\/script>/gi, "")
            .replace(/<style[\s\S]*?<\/style>/gi, "")
            .replace(/<[^>]+>/g, " ")
            .replace(/\s+/g, " ")
            .trim()
            .substring(0, 8000);
        }
      } catch {
        // Scrape failed — continue with empty content
      }
    }

    // Get post type info
    const postType = await PostTypeModel.findRawById(post_type_id);
    const typeName = postType?.name || "post";

    // Generate content via dedicated post content prompt
    const { generatePostContent } = await import("../../utils/website-utils/aiCommandService");
    const result = await generatePostContent({
      title,
      postTypeName: typeName,
      purpose: "",
      referenceContent: refContent,
      styleContext: "",
      customFieldsHint: "",
    });

    return res.json({ success: true, data: { content: result.html } });
  } catch (error: any) {
    logger.error({ err: error }, "[Admin Websites] Error generating post content:");
    return res.status(500).json({ success: false, error: "GENERATE_ERROR", message: error?.message });
  }
}

// =====================================================================
// PAGE DISPLAY NAME
// =====================================================================

/** PATCH /:id/pages/display-name — Update page display name for a path */
