/**
 * Bulk SEO Generation Processor
 *
 * Processes all pages (or posts of a given type) for a project,
 * generating SEO metadata for each one sequentially.
 * Shared context (business data, mind skills) fetched once per job.
 */

import { Job } from "bullmq";
import { SeoGenerationJobModel } from "../../models/website-builder/SeoGenerationJobModel";
import { ProjectModel } from "../../models/website-builder/ProjectModel";
import { PageModel } from "../../models/website-builder/PageModel";
import { PostModel } from "../../models/website-builder/PostModel";
import logger from "../../lib/logger";

export interface SeoBulkGenerateData {
  jobRecordId: string;
  projectId: string;
  entityType: "page" | "post";
  postTypeId?: string;
  pagePaths?: string[];
}

export async function processSeoBulkGenerate(job: Job<SeoBulkGenerateData>): Promise<void> {
  const { jobRecordId, projectId, entityType, postTypeId, pagePaths } = job.data;

  const jobStart = Date.now();
  logger.info(`[SEO-BULK] ▶ Starting bulk SEO generation`);
  logger.info(`[SEO-BULK]   job=${jobRecordId}`);
  logger.info(`[SEO-BULK]   project=${projectId} type=${entityType} postType=${postTypeId || "n/a"}`);

  try {
  await SeoGenerationJobModel.markProcessing(jobRecordId);
  logger.info(`[SEO-BULK]   Status → processing`);

  // Lazy-import the SEO generation internals to avoid circular deps
  const seoService = await import(
    "../../controllers/admin-websites/feature-services/service.seo-generation"
  );

  // Fetch shared context once
  logger.info(`[SEO-BULK]   Fetching shared context (business data + mind skills)...`);
  const sharedContext = await seoService.fetchSharedContext(projectId);
  logger.info(`[SEO-BULK]   Shared context loaded (${Date.now() - jobStart}ms)`);

  // Gather all existing SEO titles/descriptions for uniqueness
  const allMeta = await getAllSeoMeta(projectId);

  // Get project for wrapper/header/footer. findById returns the full row; the
  // wrapper/header/footer columns are not on IProject, so read them via a
  // narrow cast (mirrors the original untyped db(...).first() access).
  const project = (await ProjectModel.findById(projectId)) as
    | { wrapper?: string; header?: string; footer?: string }
    | undefined;
  const wrapperHtml = project?.wrapper || "";
  const headerHtml = project?.header || "";
  const footerHtml = project?.footer || "";

  // Fetch entities to process
  let entities: Array<{ id: string; title: string; content: string; path?: string }>;

  if (entityType === "page") {
    entities = await getPageEntities(projectId, pagePaths);
  } else {
    entities = await getPostEntities(projectId, postTypeId!);
  }

  logger.info(`[SEO-BULK]   Found ${entities.length} ${entityType}(s) to process`);
  logger.info(`[SEO-BULK]   Existing meta: ${allMeta.titles.length} titles, ${allMeta.descriptions.length} descriptions`);

  // Track accumulated titles/descriptions for uniqueness within this batch
  const batchTitles = [...allMeta.titles];
  const batchDescriptions = [...allMeta.descriptions];

  for (let i = 0; i < entities.length; i++) {
    const entity = entities[i];
    const entityStart = Date.now();
    logger.info(`[SEO-BULK]   [${i + 1}/${entities.length}] Generating SEO for "${entity.title}" (${entity.id})...`);
    try {
      const results = await seoService.generateAllWithSharedContext(
        sharedContext,
        entityType,
        {
          page_content: entity.content,
          homepage_content: "",
          header_html: headerHtml,
          footer_html: footerHtml,
          wrapper_html: wrapperHtml,
          existing_seo_data: {},
          all_page_titles: batchTitles,
          all_page_descriptions: batchDescriptions,
          page_path: entity.path,
          post_title: entityType === "post" ? entity.title : undefined,
        },
        projectId,
        entity.id
      );

      // Merge all generated sections into a single seo_data object
      const mergedSeoData: Record<string, unknown> = {};
      const mergedInsights: Record<string, string> = {};
      for (const r of results) {
        Object.assign(mergedSeoData, r.generated);
        if (r.insight) mergedInsights[r.section] = r.insight;
      }
      mergedSeoData.insights = mergedInsights;

      // Track new titles/descriptions for uniqueness in subsequent entities
      if (mergedSeoData.meta_title) batchTitles.push(mergedSeoData.meta_title as string);
      if (mergedSeoData.meta_description) batchDescriptions.push(mergedSeoData.meta_description as string);

      // Save seo_data to DB
      const seoDataJson = JSON.stringify(mergedSeoData);
      if (entityType === "page") {
        await PageModel.updateSeoDataById(entity.id, seoDataJson);
      } else {
        await PostModel.updateSeoDataByIdJsClock(entity.id, seoDataJson);
      }

      // For pages, propagate seo_data to all sibling versions with null seo_data
      if (entityType === "page" && entity.path) {
        const propagated = await PageModel.propagateSeoDataToSiblings({
          projectId,
          path: entity.path,
          excludePageId: entity.id,
          seoDataValue: seoDataJson,
        });
        if (propagated > 0) {
          logger.info(`[SEO-BULK]     Propagated seo_data to ${propagated} sibling version(s)`);
        }
      }

      await SeoGenerationJobModel.incrementCompleted(jobRecordId);
      logger.info(`[SEO-BULK]   [${i + 1}/${entities.length}] ✓ Done "${entity.title}" (${Date.now() - entityStart}ms)`);
    } catch (err: any) {
      logger.error({ err: err.message }, `[SEO-BULK]   [${i + 1}/${entities.length}] ✗ Failed "${entity.title}" (${Date.now() - entityStart}ms):`);
      await SeoGenerationJobModel.incrementFailed(jobRecordId, {
        id: entity.id,
        title: entity.title,
        error: err.message || "Unknown error",
      });
    }
  }

  // Final status
  const finalJob = await SeoGenerationJobModel.findById(jobRecordId);
  if (finalJob && finalJob.failed_count > 0 && finalJob.completed_count === 0) {
    await SeoGenerationJobModel.markFailed(jobRecordId);
  } else {
    await SeoGenerationJobModel.markCompleted(jobRecordId);
  }

  const elapsed = Math.round((Date.now() - jobStart) / 1000);
  logger.info(`[SEO-BULK] ■ Job ${jobRecordId} finished in ${elapsed}s: ${finalJob?.completed_count} completed, ${finalJob?.failed_count} failed`);

  } catch (err: any) {
    logger.error({ err: err.message }, `[SEO-BULK] ✗ Job ${jobRecordId} crashed:`);
    await SeoGenerationJobModel.markFailed(jobRecordId);
    throw err; // Re-throw so BullMQ also marks it failed
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getPageEntities(projectId: string, pagePaths?: string[]) {
  // Get pages — filtered by paths if specified, otherwise all
  if (pagePaths && pagePaths.length > 0) {
    logger.info(`[SEO-BULK]   Filtering to ${pagePaths.length} selected paths`);
  }

  const pages = await PageModel.findByProjectIdForSeo(projectId, pagePaths);

  // Group by path: prefer published, fallback to draft, then highest version
  const grouped = new Map<string, any[]>();
  for (const page of pages) {
    const group = grouped.get(page.path) || [];
    group.push(page);
    grouped.set(page.path, group);
  }

  const entities: Array<{ id: string; title: string; content: string; path: string }> = [];

  for (const [path, versions] of grouped) {
    const best =
      versions.find((p: any) => p.status === "published") ||
      versions.find((p: any) => p.status === "draft") ||
      versions[0]; // highest version fallback

    // Extract text content from sections
    let sections: any[] = [];
    try {
      const raw = typeof best.sections === "string" ? JSON.parse(best.sections) : best.sections;
      sections = Array.isArray(raw) ? raw : [];
    } catch {
      sections = [];
    }
    const content = sections.map((s: any) => s.content || "").join("\n");

    entities.push({
      id: best.id,
      title: path,
      content,
      path,
    });
  }

  return entities;
}

async function getPostEntities(projectId: string, postTypeId: string) {
  const posts = await PostModel.findByProjectAndTypeForSeo(projectId, postTypeId);

  return posts.map((post: any) => ({
    id: post.id,
    title: post.title,
    content: post.content || "",
    path: undefined,
  }));
}

async function getAllSeoMeta(projectId: string): Promise<{ titles: string[]; descriptions: string[] }> {
  const titles: string[] = [];
  const descriptions: string[] = [];

  const pages = await PageModel.findSeoDataByProjectId(projectId);
  const posts = await PostModel.findSeoDataByProjectId(projectId);

  for (const row of [...pages, ...posts]) {
    const data = typeof row.seo_data === "string" ? JSON.parse(row.seo_data) : row.seo_data;
    if (data?.meta_title) titles.push(data.meta_title);
    if (data?.meta_description) descriptions.push(data.meta_description);
  }

  return { titles, descriptions };
}
