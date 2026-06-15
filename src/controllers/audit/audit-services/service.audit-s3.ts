/**
 * Audit S3 Service — Upload leadgen audit screenshots to S3
 *
 * Ports the n8n screenshot-upload step into the backend. The leadgen tool
 * frontend fetches these URLs directly, so the returned URL must be the
 * public canonical S3 URL (same shape n8n produced).
 *
 * Reference pattern: src/utils/core/s3.ts (uploadToS3) +
 * src/controllers/admin-media/feature-utils/util.s3-helpers.ts (buildS3Url)
 */

import { uploadToS3 } from "../../../utils/core/s3";
import logger from "../../../lib/logger";

type ScreenshotVariant = "desktop" | "mobile";

/**
 * Strip an optional data URL prefix (`data:image/png;base64,...`) and
 * decode the remaining base64 payload to a Buffer.
 */
function decodeBase64Image(base64Data: string): Buffer {
  if (!base64Data || typeof base64Data !== "string") {
    throw new Error("[AUDIT-S3] base64Data is required and must be a string");
  }

  const commaIdx = base64Data.indexOf(",");
  const payload =
    base64Data.startsWith("data:") && commaIdx !== -1
      ? base64Data.slice(commaIdx + 1)
      : base64Data;

  const buffer = Buffer.from(payload, "base64");
  if (buffer.length === 0) {
    throw new Error("[AUDIT-S3] base64Data decoded to empty buffer");
  }

  return buffer;
}

/**
 * Upload a leadgen audit screenshot to S3 and return the canonical public URL.
 *
 * Key format: `leadgen-screenshots/{auditId}-{variant}.png`
 * URL format: `https://{bucket}.s3.{region}.amazonaws.com/{key}`
 */
export async function uploadAuditScreenshot(
  auditId: string,
  variant: ScreenshotVariant,
  base64Data: string
): Promise<string> {
  if (!auditId || typeof auditId !== "string") {
    throw new Error("[AUDIT-S3] auditId is required");
  }

  if (variant !== "desktop" && variant !== "mobile") {
    throw new Error(
      `[AUDIT-S3] invalid variant "${variant}" (expected "desktop" | "mobile")`
    );
  }

  const bucket = process.env.AWS_S3_IMPORTS_BUCKET;
  const region = process.env.AWS_S3_IMPORTS_REGION;

  if (!bucket) {
    throw new Error("[AUDIT-S3] AWS_S3_IMPORTS_BUCKET env var is not set");
  }
  if (!region) {
    throw new Error("[AUDIT-S3] AWS_S3_IMPORTS_REGION env var is not set");
  }
  if (
    !process.env.AWS_ACCESS_KEY_ID ||
    !process.env.AWS_SECRET_ACCESS_KEY
  ) {
    throw new Error(
      "[AUDIT-S3] AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY not configured"
    );
  }

  const buffer = decodeBase64Image(base64Data);
  const key = `leadgen-screenshots/${auditId}-${variant}.png`;

  await uploadToS3(key, buffer, "image/png");

  const sizeKB = Math.round(buffer.length / 1024);
  logger.info(`[AUDIT-S3] Uploaded ${key}, ${sizeKB}KB`);

  return `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
}
