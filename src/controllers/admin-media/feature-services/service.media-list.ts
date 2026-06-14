/**
 * Media List Service
 *
 * Fetches paginated media for a project with optional type/search filters,
 * per-item usage tracking, and quota information.
 */

import { MediaModel, IMedia, MediaFilters } from "../../../models/website-builder/MediaModel";
import * as mediaUsageService from "./service.media-usage";
import * as mediaQuotaService from "./service.media-quota";
import logger from "../../../lib/logger";

export interface MediaListOptions {
  type?: string;
  search?: string;
  page: number;
  limit: number;
}

export interface MediaListResult {
  data: (IMedia & { usedInPages: number })[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    hasMore: boolean;
  };
  quota: mediaQuotaService.QuotaInfo;
}

/**
 * List media for a project with pagination, filters, usage tracking, and quota.
 */
export async function list(
  projectId: string,
  options: MediaListOptions
): Promise<MediaListResult> {
  logger.info(
    `[Media] Fetching media for project ${projectId} (page ${options.page})`
  );

  const filters: MediaFilters = {};
  if (options.type && options.type !== "all") {
    filters.type = options.type as MediaFilters["type"];
  }
  if (options.search) {
    filters.search = options.search as string;
  }

  const { data: media, total } = await MediaModel.findByProjectWithFilters(
    projectId,
    filters,
    { page: options.page, limit: options.limit }
  );

  const offset = (options.page - 1) * options.limit;
  const hasMore = offset + media.length < total;

  // Add usage tracking for each media item
  const mediaWithUsage = await Promise.all(
    media.map(async (item) => {
      const pagesUsing = await mediaUsageService.findUsageByUrl(
        projectId,
        item.s3_url
      );
      return {
        ...item,
        usedInPages: pagesUsing.length,
      };
    })
  );

  // Get quota
  const quota = await mediaQuotaService.getCurrentUsage(projectId);

  return {
    data: mediaWithUsage,
    pagination: {
      page: options.page,
      limit: options.limit,
      total,
      hasMore,
    },
    quota,
  };
}
