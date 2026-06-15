/**
 * Admin Websites — SEO Controller
 *
 * Per-page/per-post SEO meta update + generate + analyze, bulk SEO generate
 * (start/active/status), and combined SEO meta listing.
 *
 * Behavior-preserving split from the former monolithic AdminWebsitesController.
 * Handlers and helpers are moved verbatim; logic is unchanged. Bound by the
 * matching resource sub-router under src/routes/admin/websites/.
 */

import { Request, Response } from "express";
import * as pageEditor from "./feature-services/service.page-editor";
import * as postManager from "./feature-services/service.post-manager";
import { PageModel } from "../../models/website-builder/PageModel";
import { PostModel } from "../../models/website-builder/PostModel";
import logger from "../../lib/logger";

/** PATCH /:id/pages/:pageId/seo — Update page SEO data */
export async function updatePageSeo(req: Request, res: Response): Promise<Response> {
  try {
    const { id: projectId, pageId } = req.params;
    const { seo_data } = req.body;
    if (!seo_data) {
      return res.status(400).json({ success: false, error: "INVALID_INPUT", message: "seo_data is required" });
    }
    const { page, error } = await pageEditor.updatePageSeo(projectId, pageId, seo_data);
    if (error) return res.status(error.status).json({ success: false, ...error });
    return res.json({ success: true, data: page });
  } catch (error: any) {
    logger.error({ err: error }, "[Admin Websites] Error updating page SEO:");
    return res.status(500).json({ success: false, error: "UPDATE_ERROR", message: error?.message });
  }
}

/** PATCH /:id/posts/:postId/seo — Update post SEO data */

/** PATCH /:id/posts/:postId/seo — Update post SEO data */
export async function updatePostSeo(req: Request, res: Response): Promise<Response> {
  try {
    const { id: projectId, postId } = req.params;
    const { seo_data } = req.body;
    if (!seo_data) {
      return res.status(400).json({ success: false, error: "INVALID_INPUT", message: "seo_data is required" });
    }
    const result = await postManager.updatePost(projectId, postId, { seo_data });
    if (result.error) return res.status(result.error.status).json({ success: false, ...result.error });
    return res.json({ success: true, data: result.post });
  } catch (error: any) {
    logger.error({ err: error }, "[Admin Websites] Error updating post SEO:");
    return res.status(500).json({ success: false, error: "UPDATE_ERROR", message: error?.message });
  }
}

/** POST /:id/pages/:pageId/seo/generate — AI generate SEO for a page */

/** POST /:id/pages/:pageId/seo/generate — AI generate SEO for a page */
export async function generatePageSeo(req: Request, res: Response): Promise<Response> {
  try {
    const { id: projectId, pageId } = req.params;
    const { generateSeoForSection } = await import(
      "./feature-services/service.seo-generation"
    );
    const result = await generateSeoForSection(projectId, pageId, "page", req.body);
    return res.json({ success: true, ...result });
  } catch (error: any) {
    logger.error({ err: error }, "[Admin Websites] Error generating page SEO:");
    return res.status(500).json({ success: false, error: "GENERATION_ERROR", message: error?.message });
  }
}

/** POST /:id/posts/:postId/seo/generate — AI generate SEO for a post */

/** POST /:id/posts/:postId/seo/generate — AI generate SEO for a post */
export async function generatePostSeo(req: Request, res: Response): Promise<Response> {
  try {
    const { id: projectId, postId } = req.params;
    const { generateSeoForSection } = await import(
      "./feature-services/service.seo-generation"
    );
    const result = await generateSeoForSection(projectId, postId, "post", req.body);
    return res.json({ success: true, ...result });
  } catch (error: any) {
    logger.error({ err: error }, "[Admin Websites] Error generating post SEO:");
    return res.status(500).json({ success: false, error: "GENERATION_ERROR", message: error?.message });
  }
}

/** POST /:id/pages/:pageId/seo/generate-all — AI generate ALL SEO sections at once */

/** POST /:id/pages/:pageId/seo/generate-all — AI generate ALL SEO sections at once */
export async function generateAllPageSeo(req: Request, res: Response): Promise<Response> {
  try {
    const { id: projectId, pageId } = req.params;
    const { generateAllSeoSections } = await import(
      "./feature-services/service.seo-generation"
    );
    const result = await generateAllSeoSections(projectId, pageId, "page", req.body);
    return res.json({ success: true, ...result });
  } catch (error: any) {
    logger.error({ err: error }, "[Admin Websites] Error generating all page SEO:");
    return res.status(500).json({ success: false, error: "GENERATION_ERROR", message: error?.message });
  }
}

/** POST /:id/posts/:postId/seo/generate-all — AI generate ALL SEO sections at once */

/** POST /:id/posts/:postId/seo/generate-all — AI generate ALL SEO sections at once */
export async function generateAllPostSeo(req: Request, res: Response): Promise<Response> {
  try {
    const { id: projectId, postId } = req.params;
    const { generateAllSeoSections } = await import(
      "./feature-services/service.seo-generation"
    );
    const result = await generateAllSeoSections(projectId, postId, "post", req.body);
    return res.json({ success: true, ...result });
  } catch (error: any) {
    logger.error({ err: error }, "[Admin Websites] Error generating all post SEO:");
    return res.status(500).json({ success: false, error: "GENERATION_ERROR", message: error?.message });
  }
}

/** POST /:id/pages/:pageId/seo/analyze — AI analyze existing SEO for a page */

/** POST /:id/pages/:pageId/seo/analyze — AI analyze existing SEO for a page */
export async function analyzePageSeo(req: Request, res: Response): Promise<Response> {
  try {
    const { id: projectId, pageId } = req.params;
    const { analyzeSeoForSection } = await import(
      "./feature-services/service.seo-generation"
    );
    const result = await analyzeSeoForSection(projectId, pageId, "page", req.body);
    return res.json({ success: true, ...result });
  } catch (error: any) {
    logger.error({ err: error }, "[Admin Websites] Error analyzing page SEO:");
    return res.status(500).json({ success: false, error: "ANALYSIS_ERROR", message: error?.message });
  }
}

/** POST /:id/posts/:postId/seo/analyze — AI analyze existing SEO for a post */

/** POST /:id/posts/:postId/seo/analyze — AI analyze existing SEO for a post */
export async function analyzePostSeo(req: Request, res: Response): Promise<Response> {
  try {
    const { id: projectId, postId } = req.params;
    const { analyzeSeoForSection } = await import(
      "./feature-services/service.seo-generation"
    );
    const result = await analyzeSeoForSection(projectId, postId, "post", req.body);
    return res.json({ success: true, ...result });
  } catch (error: any) {
    logger.error({ err: error }, "[Admin Websites] Error analyzing post SEO:");
    return res.status(500).json({ success: false, error: "ANALYSIS_ERROR", message: error?.message });
  }
}

/** POST /:id/seo/bulk-generate — Start a bulk SEO generation background job */

/** POST /:id/seo/bulk-generate — Start a bulk SEO generation background job */
export async function startBulkSeoGenerate(req: Request, res: Response): Promise<Response> {
  try {
    const projectId = req.params.id;
    const { entity_type, post_type_id, page_paths } = req.body;

    if (!entity_type || !["page", "post"].includes(entity_type)) {
      return res.status(400).json({ success: false, error: "INVALID_INPUT", message: "entity_type must be 'page' or 'post'" });
    }
    if (entity_type === "post" && !post_type_id) {
      return res.status(400).json({ success: false, error: "INVALID_INPUT", message: "post_type_id is required for post entity type" });
    }

    const { SeoGenerationJobModel } = await import("../../models/website-builder/SeoGenerationJobModel");
    const { getMindsQueue } = await import("../../workers/queues");

    // Check for existing active job
    const active = await SeoGenerationJobModel.findActive(projectId, entity_type, post_type_id);
    if (active) {
      logger.info(`[BULK-SEO] Returning existing active job: ${active.id} status=${active.status} ${active.completed_count}/${active.total_count}`);
      return res.json({ success: true, job_id: active.id, already_active: true });
    }

    // Count entities
    let totalCount: number;
    const selectedPaths: string[] | undefined = Array.isArray(page_paths) && page_paths.length > 0 ? page_paths : undefined;

    if (entity_type === "page") {
      if (selectedPaths) {
        totalCount = selectedPaths.length;
      } else {
        const pages = await PageModel.findPathsByProjectId(projectId);
        const uniquePaths = new Set(pages.map((p: any) => p.path));
        totalCount = uniquePaths.size;
      }
    } else {
      totalCount = await PostModel.countByProjectAndType(
        projectId,
        post_type_id,
      );
    }

    if (totalCount === 0) {
      return res.status(400).json({ success: false, error: "NO_ENTITIES", message: `No ${entity_type}s found to generate SEO for.` });
    }

    // Create job record
    const jobRecord = await SeoGenerationJobModel.create({
      project_id: projectId,
      entity_type,
      post_type_id: post_type_id || null,
      total_count: totalCount,
    });

    // Enqueue BullMQ job
    logger.info(`[BULK-SEO] Created new job: ${jobRecord.id} type=${entity_type} postType=${post_type_id || "n/a"} total=${totalCount}`);
    const queue = getMindsQueue("seo-bulk-generate");
    await queue.add("seo-bulk-generate", {
      jobRecordId: jobRecord.id,
      projectId,
      entityType: entity_type,
      postTypeId: post_type_id,
      pagePaths: selectedPaths,
    }, { jobId: jobRecord.id });
    logger.info(`[BULK-SEO] Enqueued to BullMQ queue: minds-seo-bulk-generate`);

    return res.json({ success: true, job_id: jobRecord.id });
  } catch (error: any) {
    logger.error({ err: error }, "[Admin Websites] Error starting bulk SEO generation:");
    return res.status(500).json({ success: false, error: "BULK_GENERATE_ERROR", message: error?.message });
  }
}

/** GET /:id/seo/bulk-generate/active — Check for any active bulk SEO job */

/** GET /:id/seo/bulk-generate/active — Check for any active bulk SEO job */
export async function getActiveBulkSeoJob(req: Request, res: Response): Promise<Response> {
  try {
    const projectId = req.params.id;
    const { entity_type, post_type_id } = req.query;
    const { SeoGenerationJobModel } = await import("../../models/website-builder/SeoGenerationJobModel");

    const job = await SeoGenerationJobModel.findActive(
      projectId,
      (entity_type as "page" | "post") || "page",
      (post_type_id as string) || undefined
    );

    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");

    if (!job) {
      return res.json({ success: true, data: null });
    }

    return res.json({
      success: true,
      data: {
        id: job.id,
        status: job.status,
        total_count: job.total_count,
        completed_count: job.completed_count,
        failed_count: job.failed_count,
        failed_items: job.failed_items,
      },
    });
  } catch (error: any) {
    logger.error({ err: error }, "[Admin Websites] Error checking active bulk SEO job:");
    return res.status(500).json({ success: false, error: "FETCH_ERROR", message: error?.message });
  }
}

/** GET /:id/seo/bulk-generate/:jobId/status — Poll bulk SEO generation progress */

/** GET /:id/seo/bulk-generate/:jobId/status — Poll bulk SEO generation progress */
export async function getBulkSeoStatus(req: Request, res: Response): Promise<Response> {
  try {
    const { jobId } = req.params;
    const { SeoGenerationJobModel } = await import("../../models/website-builder/SeoGenerationJobModel");

    const job = await SeoGenerationJobModel.findById(jobId);
    if (!job) {
      return res.status(404).json({ success: false, error: "NOT_FOUND", message: "Job not found" });
    }

    // No caching
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    res.setHeader("Pragma", "no-cache");

    return res.json({
      success: true,
      data: {
        id: job.id,
        status: job.status,
        total_count: job.total_count,
        completed_count: job.completed_count,
        failed_count: job.failed_count,
        failed_items: job.failed_items,
      },
    });
  } catch (error: any) {
    logger.error({ err: error }, "[Admin Websites] Error fetching bulk SEO status:");
    return res.status(500).json({ success: false, error: "FETCH_ERROR", message: error?.message });
  }
}

/** GET /:id/seo/all-meta — Get all page/post titles and descriptions for uniqueness checking */

/** GET /:id/seo/all-meta — Get all page/post titles and descriptions for uniqueness checking */
export async function getAllSeoMeta(req: Request, res: Response): Promise<Response> {
  try {
    const projectId = req.params.id;
    const pages = await PageModel.findSeoMetaByProjectId(projectId);

    // Deduplicate by path: prefer published, then highest version draft.
    // Uniqueness checks are across different page paths, not across versions.
    const pagesByPath = new Map<string, any>();
    for (const p of pages) {
      const existing = pagesByPath.get(p.path);
      if (
        !existing ||
        (p.status === "published" && existing.status !== "published") ||
        (p.status === existing.status && p.version > existing.version)
      ) {
        pagesByPath.set(p.path, p);
      }
    }

    const posts = await PostModel.findSeoMetaByProjectId(projectId);

    const meta = {
      pages: Array.from(pagesByPath.values()).map((p: any) => ({
        id: p.id,
        path: p.path,
        meta_title: p.seo_data?.meta_title || null,
        meta_description: p.seo_data?.meta_description || null,
      })),
      posts: posts.map((p: any) => ({
        id: p.id,
        title: p.title,
        slug: p.slug,
        meta_title: p.seo_data?.meta_title || null,
        meta_description: p.seo_data?.meta_description || null,
      })),
    };

    return res.json({ success: true, data: meta });
  } catch (error: any) {
    logger.error({ err: error }, "[Admin Websites] Error fetching SEO meta:");
    return res.status(500).json({ success: false, error: "FETCH_ERROR", message: error?.message });
  }
}

// =====================================================================
// REVIEW BLOCKS
// =====================================================================

/** GET /templates/:templateId/review-blocks */
