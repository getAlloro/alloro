/**
 * Media Delete Service
 *
 * Handles media deletion with:
 * - Project ownership verification
 * - Usage check (unless force=true)
 * - S3 cleanup (main file + thumbnail)
 * - DB record removal
 *
 * S3 deletion is non-blocking: failures are logged but don't prevent
 * DB cleanup (prevents orphaned DB records).
 */

import { MediaModel } from "../../../models/website-builder/MediaModel";
import { deleteFromS3 } from "../../../utils/core/s3";
import * as mediaUsageService from "./service.media-usage";
import logger from "../../../lib/logger";

/**
 * Delete a media item.
 *
 * Throws with statusCode for request-level errors:
 * - 404: media not found or doesn't belong to project
 * - 400: media in use and force not set
 */
export async function deleteMedia(
  projectId: string,
  mediaId: string,
  force: boolean
): Promise<void> {
  logger.info(`[Media] Deleting media ${mediaId}`);

  // Verify media belongs to project
  const media = await MediaModel.findByIdAndProject(mediaId, projectId);

  if (!media) {
    const error: any = new Error("Media not found");
    error.statusCode = 404;
    error.errorCode = "NOT_FOUND";
    throw error;
  }

  // Check usage (unless force=true)
  if (!force) {
    const pagesUsing = await mediaUsageService.findUsageByUrl(
      projectId,
      media.s3_url
    );

    if (pagesUsing.length > 0) {
      const error: any = new Error(
        `Media is used in ${pagesUsing.length} page(s)`
      );
      error.statusCode = 400;
      error.errorCode = "MEDIA_IN_USE";
      error.pagesUsing = pagesUsing;
      throw error;
    }
  }

  // Delete from S3 (non-blocking)
  try {
    await deleteFromS3(media.s3_key);
  } catch (s3Err) {
    logger.warn({ detail: s3Err }, `[Media] Failed to delete S3 object ${media.s3_key}:`);
  }

  // Delete thumbnail if exists
  if (media.thumbnail_s3_key) {
    try {
      await deleteFromS3(media.thumbnail_s3_key);
    } catch (s3Err) {
      logger.warn({ detail: s3Err }, `[Media] Failed to delete S3 thumbnail ${media.thumbnail_s3_key}:`);
    }
  }

  // Delete from DB
  await MediaModel.deleteById(mediaId);

  logger.info(`[Media] Deleted ${media.filename}`);
}
