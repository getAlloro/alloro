/**
 * S3 Service — Upload, download, and delete files from AWS S3
 *
 * Used by the alloro_imports system to store CSS, JS, images, and other
 * assets that templates can reference via /api/imports/:filename
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const bucket = process.env.AWS_S3_IMPORTS_BUCKET || "alloro-imports";
const region = process.env.AWS_S3_IMPORTS_REGION || "us-east-1";

const s3 = new S3Client({
  region,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
  },
});

/**
 * Upload a file buffer to S3
 */
export async function uploadToS3(
  key: string,
  body: Buffer,
  contentType: string
): Promise<void> {
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );
}

/**
 * Get a file from S3 — returns the readable stream and content type
 */
export async function getFromS3(
  key: string
): Promise<{ body: ReadableStream | NodeJS.ReadableStream; contentType: string }> {
  const response = await s3.send(
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    })
  );

  return {
    body: response.Body as NodeJS.ReadableStream,
    contentType: response.ContentType || "application/octet-stream",
  };
}

/**
 * Get a full S3 object as an in-memory Buffer.
 *
 * The OS import converter needs the archived file's raw bytes (docx/xlsx/pdf
 * parsers all take a Buffer). Files are size-capped at the boundary
 * (OS_IMPORT_MAX_FILE_MB) so buffering the whole object is bounded. Uses the
 * AWS SDK's transformToByteArray() rather than manual stream draining.
 */
export async function getObjectBuffer(key: string): Promise<Buffer> {
  const response = await s3.send(
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    })
  );
  const bytes = await response.Body?.transformToByteArray();
  if (!bytes) {
    throw new Error(`S3 object ${key} returned an empty body.`);
  }
  return Buffer.from(bytes);
}

/**
 * Delete a file from S3
 */
export async function deleteFromS3(key: string): Promise<void> {
  await s3.send(
    new DeleteObjectCommand({
      Bucket: bucket,
      Key: key,
    })
  );
}

/**
 * Build an S3 key for an import file
 * Format: imports/{filename}/v{version}/{originalFilename}
 */
export function buildS3Key(
  filename: string,
  version: number,
  originalFilename: string
): string {
  return `imports/${filename}/v${version}/${originalFilename}`;
}

/**
 * Generate a pre-signed URL for downloading an S3 object.
 *
 * When `downloadFilename` is provided, the signed request overrides the
 * object's Content-Disposition to `attachment; filename="..."` so the
 * browser forces a download instead of rendering inline. Without it the
 * browser honors the object's stored disposition (usually inline for
 * images / PDFs).
 */
export async function generatePresignedUrl(
  key: string,
  expiresInSeconds: number = 3600,
  downloadFilename?: string
): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
    ...(downloadFilename
      ? {
          ResponseContentDisposition: `attachment; filename="${encodeURIComponent(
            downloadFilename
          )}"`,
        }
      : {}),
  });
  return getSignedUrl(s3, command, { expiresIn: expiresInSeconds });
}

export { bucket };
