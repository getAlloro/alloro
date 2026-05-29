/**
 * Media Upload Service
 *
 * Orchestrates bulk file upload:
 * - MIME validation per file
 * - Image processing (WebP conversion, thumbnail generation)
 * - Video/PDF passthrough (no processing)
 * - S3 upload
 * - DB record creation
 *
 * Individual file failures are caught and returned in the failed array
 * without aborting the entire batch.
 */

import sharp from "sharp";
import { MediaModel, IMedia } from "../../../models/website-builder/MediaModel";
import { ProjectModel } from "../../../models/website-builder/ProjectModel";
import { uploadToS3 } from "../../../utils/core/s3";
import {
  processImage,
  isProcessableImage,
  isVideo,
  isPDF,
} from "../feature-utils/util.media-processor";
import { validateMimeType } from "../feature-utils/util.validation";
import { buildMediaS3Key, buildS3Url } from "../feature-utils/util.s3-helpers";
import * as mediaQuotaService from "./service.media-quota";

export interface UploadResult {
  succeeded: IMedia[];
  failed: UploadFailure[];
  quota: mediaQuotaService.QuotaInfo;
}

export interface UploadFailure {
  error: true;
  filename: string;
  message: string;
}

export interface UploadOptions {
  preserveImageFormat?: boolean;
}

/**
 * Upload multiple files for a project.
 *
 * Validates project existence, checks quota, then processes all files
 * in parallel. Returns succeeded/failed arrays and updated quota.
 *
 * Throws with statusCode for request-level errors (no files, project not found, quota exceeded).
 */
export async function uploadBulk(
  projectId: string,
  files: Express.Multer.File[],
  options: UploadOptions = {}
): Promise<UploadResult> {
  if (!files || files.length === 0) {
    const error: any = new Error("No files provided for upload");
    error.statusCode = 400;
    error.errorCode = "NO_FILES";
    throw error;
  }

  console.log(
    `[Media] Uploading ${files.length} files for project ${projectId}`
  );

  // Verify project exists (security check)
  const project = await ProjectModel.findById(projectId);
  if (!project) {
    const error: any = new Error("Project not found");
    error.statusCode = 404;
    error.errorCode = "PROJECT_NOT_FOUND";
    throw error;
  }

  // Check quota BEFORE processing
  const totalNewSize = files.reduce((sum, f) => sum + f.size, 0);
  const quotaCheck = await mediaQuotaService.checkQuota(projectId, totalNewSize);

  if (!quotaCheck.allowed) {
    const error: any = new Error(
      `Storage quota exceeded. Used: ${(quotaCheck.used / 1024 / 1024 / 1024).toFixed(2)} GB, Limit: 5 GB`
    );
    error.statusCode = 507;
    error.errorCode = "QUOTA_EXCEEDED";
    error.quota = {
      used: quotaCheck.used,
      limit: quotaCheck.limit,
      percentage: Math.round((quotaCheck.used / quotaCheck.limit) * 100),
    };
    throw error;
  }

  // Process and upload files in parallel
  const uploadPromises = files.map(async (file) => {
    return processFile(projectId, file, options);
  });

  const results = await Promise.all(uploadPromises);

  // Separate successes and failures
  const succeeded = results.filter(
    (r): r is IMedia => !(r as any).error
  );
  const failed = results.filter(
    (r): r is UploadFailure => (r as any).error === true
  );

  // Get updated quota
  const quota = await mediaQuotaService.getCurrentUsage(projectId);

  return { succeeded, failed, quota };
}

/**
 * Process and upload a single file.
 * Returns the created IMedia record on success, or an UploadFailure on error.
 */
async function processFile(
  projectId: string,
  file: Express.Multer.File,
  options: UploadOptions
): Promise<IMedia | UploadFailure> {
  try {
    // Validate MIME type
    if (!validateMimeType(file.mimetype)) {
      throw new Error(`File type not supported: ${file.mimetype}`);
    }

    const originalFilename = file.originalname;
    const displayName = originalFilename;

    let s3Key: string;
    let s3Url: string;
    let thumbnailS3Key: string | null = null;
    let thumbnailS3Url: string | null = null;
    let width: number | null = null;
    let height: number | null = null;
    let finalMimeType = file.mimetype;
    let originalMimeType: string | null = null;
    let compressed = false;
    let finalBuffer = file.buffer;

    // Process based on file type
    if (isProcessableImage(file.mimetype) && options.preserveImageFormat) {
      const metadata = await sharp(file.buffer).metadata();
      finalBuffer = file.buffer;
      finalMimeType = file.mimetype === "image/jpg" ? "image/jpeg" : file.mimetype;
      width = metadata.width || null;
      height = metadata.height || null;
      originalMimeType = file.mimetype;
      compressed = false;

      s3Key = buildMediaS3Key(projectId, originalFilename);
      await uploadToS3(s3Key, finalBuffer, finalMimeType);
      s3Url = buildS3Url(s3Key);
    } else if (isProcessableImage(file.mimetype)) {
      // Image: compress, convert to WebP, generate thumbnail
      const processed = await processImage(file.buffer, file.mimetype);

      finalBuffer = processed.buffer;
      finalMimeType = processed.mimeType;
      width = processed.width;
      height = processed.height;
      originalMimeType = processed.originalMimeType;
      compressed = processed.compressed;

      // Upload main file (WebP)
      s3Key = buildMediaS3Key(projectId, originalFilename) + ".webp";
      await uploadToS3(s3Key, finalBuffer, finalMimeType);
      s3Url = buildS3Url(s3Key);

      // Upload thumbnail
      if (processed.thumbnailBuffer) {
        thumbnailS3Key = buildMediaS3Key(projectId, originalFilename, true);
        await uploadToS3(thumbnailS3Key, processed.thumbnailBuffer, "image/webp");
        thumbnailS3Url = buildS3Url(thumbnailS3Key);
      }
    } else if (isVideo(file.mimetype) || isPDF(file.mimetype)) {
      // Video/PDF: upload as-is (no processing)
      s3Key = buildMediaS3Key(projectId, originalFilename);
      await uploadToS3(s3Key, finalBuffer, finalMimeType);
      s3Url = buildS3Url(s3Key);
    } else {
      throw new Error(`Unsupported file type: ${file.mimetype}`);
    }

    // Insert DB record
    const record = await MediaModel.create({
      project_id: projectId,
      filename: originalFilename,
      display_name: displayName,
      s3_key: s3Key,
      s3_url: s3Url,
      file_size: file.size,
      mime_type: finalMimeType,
      width,
      height,
      thumbnail_s3_key: thumbnailS3Key,
      thumbnail_s3_url: thumbnailS3Url,
      original_mime_type: originalMimeType,
      compressed,
    });

    console.log(`[Media] Uploaded ${originalFilename} -> ${s3Key}`);

    return record;
  } catch (error) {
    console.error(
      `[Media] Error processing file ${file.originalname}:`,
      error
    );
    return {
      error: true,
      filename: file.originalname,
      message: error instanceof Error ? error.message : "Upload failed",
    };
  }
}
