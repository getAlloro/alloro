/**
 * Media Processor Service
 *
 * Handles image processing before S3 upload:
 * - Compress images and convert to WebP (80% quality)
 * - Generate 200px width thumbnails (75% quality)
 * - Extract dimensions
 *
 * NOTE: No video thumbnail extraction (FFmpeg removed per user request)
 * Videos are uploaded as-is and display with static icon in UI
 */

import sharp from "sharp";
import logger from "../../../lib/logger";

export interface ProcessedMedia {
  buffer: Buffer;
  mimeType: string;
  width: number;
  height: number;
  thumbnailBuffer?: Buffer;
  originalMimeType: string;
  compressed: boolean;
}

/**
 * Process image: compress, convert to WebP, generate thumbnail
 *
 * @param originalBuffer - Original image buffer from upload
 * @param originalMimeType - Original MIME type (e.g., "image/jpeg")
 * @returns Processed image data with thumbnail
 */
export async function processImage(
  originalBuffer: Buffer,
  originalMimeType: string
): Promise<ProcessedMedia> {
  try {
    const image = sharp(originalBuffer);
    const metadata = await image.metadata();

    // Compress and convert to WebP (80% quality for good balance)
    const processedBuffer = await image.webp({ quality: 80 }).toBuffer();

    // Generate 200px width thumbnail (maintains aspect ratio)
    const thumbnailBuffer = await sharp(originalBuffer)
      .resize(200, null, { withoutEnlargement: true })
      .webp({ quality: 75 })
      .toBuffer();

    return {
      buffer: processedBuffer,
      mimeType: "image/webp",
      width: metadata.width || 0,
      height: metadata.height || 0,
      thumbnailBuffer,
      originalMimeType,
      compressed: true,
    };
  } catch (error) {
    logger.error({ err: error }, "[MediaProcessor] Error processing image:");
    throw new Error(`Image processing failed: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}

/**
 * Validate if a MIME type is an image that can be processed
 *
 * @param mimeType - MIME type to check
 * @returns true if processable image type
 */
export function isProcessableImage(mimeType: string): boolean {
  return ["image/jpeg", "image/jpg", "image/png", "image/webp"].includes(
    mimeType
  );
}

/**
 * Validate if a MIME type is a video
 *
 * @param mimeType - MIME type to check
 * @returns true if video type
 */
export function isVideo(mimeType: string): boolean {
  return mimeType === "video/mp4";
}

/**
 * Validate if a MIME type is a PDF
 *
 * @param mimeType - MIME type to check
 * @returns true if PDF type
 */
export function isPDF(mimeType: string): boolean {
  return mimeType === "application/pdf";
}
