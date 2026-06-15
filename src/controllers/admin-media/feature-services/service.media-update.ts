/**
 * Media Update Service
 *
 * Updates media metadata (display_name, alt_text).
 * Enforces project ownership before allowing updates.
 */

import { MediaModel, IMedia } from "../../../models/website-builder/MediaModel";
import logger from "../../../lib/logger";

/**
 * Update metadata for a media item.
 *
 * Throws with statusCode=404 if media not found or doesn't belong to project.
 */
export async function updateMetadata(
  projectId: string,
  mediaId: string,
  updates: { display_name?: string; alt_text?: string }
): Promise<IMedia> {
  logger.info(`[Media] Updating media ${mediaId}`);

  // Verify media belongs to project
  const media = await MediaModel.findByIdAndProject(mediaId, projectId);

  if (!media) {
    const error: any = new Error("Media not found");
    error.statusCode = 404;
    error.errorCode = "NOT_FOUND";
    throw error;
  }

  // Update fields
  const updated = await MediaModel.updateMetadata(mediaId, {
    display_name: updates.display_name,
    alt_text: updates.alt_text,
  });

  return updated;
}
