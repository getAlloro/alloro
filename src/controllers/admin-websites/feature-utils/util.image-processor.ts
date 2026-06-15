/**
 * Image Processor Utility
 *
 * Collects image URLs from scraped sources, downloads them, uploads to S3,
 * and runs Claude vision analysis in batches.
 *
 * Extracted from service.generation-pipeline.ts so both the generation
 * pipeline and the identity warmup pipeline can reuse it.
 */

import axios from "axios";
import crypto from "crypto";
import path from "path";
import { runAgent } from "../../../agents/service.llm-runner";
import { loadPrompt } from "../../../agents/service.prompt-loader";
import { uploadToS3 } from "../../../utils/core/s3";
import {
  buildMediaS3Key,
  buildS3Url,
} from "../../admin-media/feature-utils/util.s3-helpers";
import { MediaModel } from "../../../models/website-builder/MediaModel";
import logger from "../../../lib/logger";

function log(msg: string, data?: Record<string, unknown>): void {
  logger.info({ detail: data ? JSON.stringify(data) : "" }, `[ImageProcessor] ${msg}`);
}

function checkCancel(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new Error("Generation cancelled");
  }
}

/**
 * Collect unique image URLs from GBP + website scrape data.
 */
export function collectImageUrls(
  gbpData: any,
  websiteData: any,
  extraUrls?: string[],
): string[] {
  const urls: string[] = [];

  if (gbpData?.imageUrls && Array.isArray(gbpData.imageUrls)) {
    urls.push(...gbpData.imageUrls);
  }

  if (websiteData?.images && Array.isArray(websiteData.images)) {
    urls.push(...websiteData.images);
  }

  if (extraUrls) {
    urls.push(...extraUrls);
  }

  return [...new Set(urls.filter((u) => u && typeof u === "string"))];
}

export interface ImageAnalysisResult {
  source_url: string;
  s3_url: string;
  description: string | null;
  use_case: string | null;
  resolution: string | null;
  is_logo: boolean;
  usability_rank: number | null;
}

/**
 * Download images, upload to S3, and analyze with Claude vision.
 * Batches images in groups of 5 to reduce LLM calls.
 *
 * Returns analysis results in the unified identity image shape.
 */
export async function processImages(
  projectId: string,
  imageUrls: string[],
  signal?: AbortSignal,
): Promise<ImageAnalysisResult[]> {
  const uploadedImages: Array<{
    url: string;
    s3Url: string;
    buffer: Buffer;
    mimeType: string;
  }> = [];

  // Content-hash dedup: same image served from CDN + origin (common for WP
  // sites) produces distinct URLs but identical bytes. Skip re-upload + skip
  // re-analysis for byte-identical downloads so the token budget isn't
  // wasted describing the same headshot twice.
  const seenHashes = new Set<string>();
  let dedupSkipped = 0;

  for (const imageUrl of imageUrls) {
    checkCancel(signal);

    try {
      const response = await axios.get(imageUrl, {
        responseType: "arraybuffer",
        timeout: 15000,
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          Accept: "image/*",
        },
        signal,
      });

      const buffer = Buffer.from(response.data);
      const hash = crypto.createHash("sha1").update(buffer).digest("hex");
      if (seenHashes.has(hash)) {
        dedupSkipped++;
        continue;
      }
      seenHashes.add(hash);

      const contentType = response.headers["content-type"] || "image/jpeg";
      const ext = contentType.includes("png")
        ? "png"
        : contentType.includes("webp")
          ? "webp"
          : "jpg";
      const filename = `gen-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const s3Key = buildMediaS3Key(projectId, filename);

      await uploadToS3(s3Key, buffer, contentType);
      const s3Url = buildS3Url(s3Key);

      uploadedImages.push({
        url: imageUrl,
        s3Url,
        buffer,
        mimeType: contentType,
      });
    } catch (err: any) {
      log(`Image download/upload failed: ${imageUrl}`, { error: err.message });
    }
  }

  if (dedupSkipped > 0) {
    log(`Deduped ${dedupSkipped} byte-identical image(s) before upload/analysis`, {
      unique: uploadedImages.length,
      total: imageUrls.length,
    });
  }

  if (uploadedImages.length === 0) return [];

  const imageAnalysisPrompt = loadPrompt("websiteAgents/builder/ImageAnalysis");
  const batchSize = 5;
  const analysisResults: ImageAnalysisResult[] = [];

  for (let i = 0; i < uploadedImages.length; i += batchSize) {
    checkCancel(signal);

    const batch = uploadedImages.slice(i, i + batchSize);
    const images = batch.map((img) => ({
      mediaType: (img.mimeType.startsWith("image/")
        ? img.mimeType
        : "image/jpeg") as "image/jpeg" | "image/png" | "image/webp" | "image/gif",
      base64: img.buffer.toString("base64"),
    }));

    const userMsg = `Analyze these ${batch.length} image(s). Their S3 URLs are:\n${batch
      .map((img, idx) => `${idx + 1}. ${img.s3Url}`)
      .join("\n")}`;

    try {
      const result = await runAgent({
        systemPrompt: imageAnalysisPrompt,
        userMessage: userMsg,
        images,
        maxTokens: 4096,
      });

      const parsedImages =
        result.parsed?.images && Array.isArray(result.parsed.images)
          ? result.parsed.images
          : [];

      for (const img of parsedImages) {
        // Match analysis back to upload (by S3 URL in user message)
        const match = batch.find((u) => img.imageUrl === u.s3Url);
        analysisResults.push({
          source_url: match?.url || img.imageUrl,
          s3_url: match?.s3Url || img.imageUrl,
          description: img.description || null,
          use_case: img.useCase || img["use-case"] || null,
          resolution: img.resolution || null,
          is_logo: !!img.isLogo,
          usability_rank: img.usabilityRank ?? null,
        });

        // Fire-and-forget: mirror this image into website_builder.media so the
        // Media Browser picks up warmup-captured photos. Failures here must
        // never tank the warmup — log + continue.
        if (match) {
          const description =
            typeof img.description === "string" ? img.description : null;
          const s3Key = match.s3Url.replace(/^https?:\/\/[^/]+\//, "");
          const filename =
            path.basename(s3Key) || path.basename(match.url) || "unknown.jpg";
          const mimeType = match.mimeType || "image/jpeg";

          try {
            await MediaModel.create({
              project_id: projectId,
              filename,
              display_name: description ? description.slice(0, 255) : null,
              s3_key: s3Key,
              s3_url: match.s3Url,
              file_size: match.buffer.length,
              mime_type: mimeType,
              alt_text: description,
              width: null,
              height: null,
              thumbnail_s3_key: null,
              thumbnail_s3_url: null,
              original_mime_type: mimeType,
              compressed: false,
            });
          } catch (err: any) {
            log(`Media row insert failed (non-fatal)`, {
              s3_url: match.s3Url,
              error: err?.message || String(err),
            });
          }
        }
      }
    } catch (err: any) {
      log(`Image analysis batch failed`, { error: err.message, batch: i });
    }
  }

  return analysisResults;
}
