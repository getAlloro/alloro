import crypto from "crypto";
import {
  uploadToS3,
  deleteFromS3,
  buildS3Key,
  bucket,
} from "../../../utils/core/s3";
import logger from "../../../lib/logger";

export interface S3UploadResult {
  s3_key: string;
  s3_bucket: string;
  content_hash: string;
}

/** Upload an import file to S3 and return the key, bucket, and content hash */
export async function uploadImport(
  filename: string,
  version: number,
  originalFilename: string,
  buffer: Buffer,
  mimeType: string
): Promise<S3UploadResult> {
  const content_hash = hashContent(buffer);
  const s3_key = buildS3Key(filename, version, originalFilename);

  await uploadToS3(s3_key, buffer, mimeType);

  return { s3_key, s3_bucket: bucket, content_hash };
}

/** Delete a single import's S3 object */
export async function deleteImport(s3Key: string): Promise<void> {
  await deleteFromS3(s3Key);
}

/** Delete all S3 objects for multiple versions, logging failures without throwing */
export async function deleteAllVersions(
  versions: Array<{ s3_key: string | null }>
): Promise<void> {
  for (const version of versions) {
    if (version.s3_key) {
      try {
        await deleteFromS3(version.s3_key);
      } catch (s3Err) {
        logger.warn({ detail: s3Err }, `[Admin Imports] Failed to delete S3 object ${version.s3_key}:`);
      }
    }
  }
}

/** Compute SHA-256 hash of a buffer */
export function hashContent(buffer: Buffer): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}
