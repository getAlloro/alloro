/**
 * Website Generation Processor
 *
 * Two job types:
 *   - wb-project-scrape: Runs project-level data collection (Apify + website scrape + image analysis),
 *     then enqueues one wb-page-generate job per page.
 *   - wb-page-generate: Generates HTML for a single page, component by component.
 *
 * Both check the project's cancellation flag at startup and pass an AbortController
 * signal into the pipeline functions for mid-flight cancellation.
 */

import { Job } from "bullmq";
import {
  scrapeAndCacheProject,
  generatePageComponents,
  isCancelled,
  resetCancelFlag,
  type ScrapeParams,
  type GenerateParams,
} from "../../controllers/admin-websites/feature-services/service.generation-pipeline";
import { getWbQueue } from "../wb-queues";
import { PageModel } from "../../models/website-builder/PageModel";
import logger from "../../lib/logger";

const LOG_PREFIX = "[WB-GEN]";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ProjectScrapeJobData {
  projectId: string;
  placeId: string;
  practiceSearchString?: string;
  websiteUrl?: string;
  scrapedData?: string | null;
  templateId?: string;
  /** Pages to generate after scraping completes */
  pages: Array<{
    pageId: string;
    templatePageId?: string;
    path: string;
  }>;
  /** Business metadata passed through to page generation */
  primaryColor?: string;
  accentColor?: string;
  pageContext?: string;
  businessName?: string;
  formattedAddress?: string;
  city?: string;
  state?: string;
  phone?: string;
  category?: string;
  rating?: number;
  reviewCount?: number;
  // Page Creation Enhancements (Plan B)
  gradientEnabled?: boolean;
  gradientFrom?: string;
  gradientTo?: string;
  gradientDirection?: string;
  dynamicSlotValues?: Record<string, string>;
}

export interface PageGenerateJobData {
  pageId: string;
  projectId: string;
  primaryColor?: string;
  accentColor?: string;
  pageContext?: string;
  businessName?: string;
  formattedAddress?: string;
  city?: string;
  state?: string;
  phone?: string;
  category?: string;
  rating?: number;
  reviewCount?: number;
  // Page Creation Enhancements (Plan B)
  gradientEnabled?: boolean;
  gradientFrom?: string;
  gradientTo?: string;
  gradientDirection?: string;
  dynamicSlotValues?: Record<string, string>;
  /** Per-component regenerate (Plan B T14) */
  singleComponent?: string;
  regenerateInstruction?: string;
}

// ---------------------------------------------------------------------------
// Project Scrape Processor
// ---------------------------------------------------------------------------

export async function processProjectScrape(
  job: Job<ProjectScrapeJobData>,
): Promise<void> {
  const { projectId, pages, ...rest } = job.data;
  const log = (msg: string) =>
    logger.info(`${LOG_PREFIX} [scrape:${job.id}] ${msg}`);

  log(`Starting project scrape for ${projectId} (${pages.length} pages queued)`);

  // Check if already cancelled before starting
  if (await isCancelled(projectId)) {
    log("Cancelled before start, skipping");
    return;
  }

  // Reset cancel flag for fresh run
  await resetCancelFlag(projectId);

  const controller = new AbortController();

  try {
    const scrapeParams: ScrapeParams = {
      placeId: rest.placeId,
      practiceSearchString: rest.practiceSearchString,
      websiteUrl: rest.websiteUrl,
      scrapedData: rest.scrapedData,
    };

    await scrapeAndCacheProject(projectId, scrapeParams, controller.signal);

    // Check cancel again after scrape
    if (await isCancelled(projectId)) {
      log("Cancelled after scrape, not enqueuing page jobs");
      return;
    }

    // Enqueue one page-generate job per page
    const pageQueue = getWbQueue("page-generate");
    const generateParams: Omit<PageGenerateJobData, "pageId" | "projectId"> = {
      primaryColor: rest.primaryColor,
      accentColor: rest.accentColor,
      pageContext: rest.pageContext,
      businessName: rest.businessName,
      formattedAddress: rest.formattedAddress,
      city: rest.city,
      state: rest.state,
      phone: rest.phone,
      category: rest.category,
      rating: rest.rating,
      reviewCount: rest.reviewCount,
      gradientEnabled: rest.gradientEnabled,
      gradientFrom: rest.gradientFrom,
      gradientTo: rest.gradientTo,
      gradientDirection: rest.gradientDirection,
      dynamicSlotValues: rest.dynamicSlotValues,
    };

    for (const page of pages) {
      await pageQueue.add(
        "generate-page",
        {
          pageId: page.pageId,
          projectId,
          ...generateParams,
        } satisfies PageGenerateJobData,
        {
          removeOnComplete: { count: 50 },
          removeOnFail: { count: 25 },
        },
      );
      log(`Enqueued page-generate for ${page.pageId} (${page.path})`);
    }

    log("Project scrape complete, all page jobs enqueued");
  } catch (err: any) {
    if (err.message === "Generation cancelled") {
      log("Cancelled during scrape");
      return;
    }

    log(`Project scrape failed: ${err.message}`);

    // Mark all queued pages as failed
    await PageModel.markQueuedGeneratingAsFailed(projectId);

    throw err;
  }
}

// ---------------------------------------------------------------------------
// Page Generate Processor
// ---------------------------------------------------------------------------

export async function processPageGenerate(
  job: Job<PageGenerateJobData>,
): Promise<void> {
  const { pageId, projectId, ...params } = job.data;
  const log = (msg: string) =>
    logger.info(`${LOG_PREFIX} [page:${job.id}] ${msg}`);

  log(`Starting page generation for ${pageId}`);

  // Check if cancelled
  if (await isCancelled(projectId)) {
    log("Cancelled before start, marking page cancelled");
    await PageModel.setGenerationStatusById(pageId, "cancelled");
    return;
  }

  const controller = new AbortController();

  // Poll for cancellation in the background
  const cancelPollInterval = setInterval(async () => {
    try {
      if (await isCancelled(projectId)) {
        controller.abort();
      }
    } catch { /* ignore poll errors */ }
  }, 10000); // Check every 10s

  try {
    const generateParams: GenerateParams & {
      singleComponent?: string;
      regenerateInstruction?: string;
    } = {
      primaryColor: params.primaryColor,
      accentColor: params.accentColor,
      pageContext: params.pageContext,
      businessName: params.businessName,
      formattedAddress: params.formattedAddress,
      city: params.city,
      state: params.state,
      phone: params.phone,
      category: params.category,
      rating: params.rating,
      reviewCount: params.reviewCount,
      gradientEnabled: params.gradientEnabled,
      gradientFrom: params.gradientFrom,
      gradientTo: params.gradientTo,
      gradientDirection: params.gradientDirection,
      dynamicSlotValues: params.dynamicSlotValues,
      singleComponent: params.singleComponent,
      regenerateInstruction: params.regenerateInstruction,
    };

    await generatePageComponents(
      pageId,
      projectId,
      generateParams,
      controller.signal,
    );

    log("Page generation complete");
  } catch (err: any) {
    if (err.message === "Generation cancelled" || controller.signal.aborted) {
      log("Cancelled during generation");
      await PageModel.setGenerationStatusById(pageId, "cancelled");
      return;
    }

    log(`Page generation failed: ${err.message}`);
    await PageModel.setGenerationStatusById(pageId, "failed");

    throw err;
  } finally {
    clearInterval(cancelPollInterval);
  }
}
