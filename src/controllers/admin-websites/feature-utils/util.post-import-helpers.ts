/**
 * Post Importer — shared helpers
 *
 * Pure string helpers + the IO helpers (cheerio extraction, image download to
 * S3, slug uniqueness) used by the post-importer orchestrator and its per-entry
 * handlers. Behavior-preserving extraction from service.post-importer.ts.
 *
 * Image guards: every download validates `content-type` is `image/*` and caps
 * payload size at 15 MB before the S3 upload happens.
 */

import axios from "axios";
import * as cheerio from "cheerio";
import * as crypto from "crypto";
import { uploadToS3 } from "../../../utils/core/s3";
import {
  buildMediaS3Key,
  buildS3Url,
} from "../../admin-media/feature-utils/util.s3-helpers";
import { PostModel } from "../../../models/website-builder/PostModel";
import logger from "../../../lib/logger";

export const MAX_IMAGE_BYTES = 15 * 1024 * 1024; // 15 MB cap
export const POST_CONTENT_MAX_CHARS = 60_000; // hard wall to keep TEXT row sane
export const IMAGE_DOWNLOAD_TIMEOUT_MS = 15_000;

const LOG_PREFIX = "[PostImporter]";
function log(msg: string, data?: Record<string, unknown>): void {
  logger.info({ detail: data ? JSON.stringify(data) : "" }, `${LOG_PREFIX} ${msg}`);
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max);
}

export function safeHash(input: string): string {
  return crypto.createHash("sha1").update(input).digest("hex").slice(0, 12);
}

export function parseIdentityJson(value: unknown): any {
  if (!value) return null;
  if (typeof value === "object") return value;
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Cheerio-driven extraction
// ---------------------------------------------------------------------------

export interface ExtractedPage {
  /** Best-guess plaintext of the main article body. */
  text: string;
  /** First meaningful absolute image URL we found. */
  image_url: string | null;
  /** Page title — used as a fallback if the identity entry didn't carry one. */
  title: string | null;
}

export function extractFromHtml(html: string, baseUrl: string): ExtractedPage {
  const $ = cheerio.load(html);

  // Drop non-content noise before sampling
  $("script, style, noscript, nav, footer, header, aside, form").remove();

  // Try common "main content" selectors in priority order, fall back to <body>
  const candidates = [
    "main",
    "article",
    "[role='main']",
    "#main",
    "#content",
    ".main-content",
    ".content",
  ];

  let mainEl: cheerio.Cheerio<any> | null = null;
  for (const sel of candidates) {
    const el = $(sel).first();
    if (el.length && el.text().trim().length > 200) {
      mainEl = el;
      break;
    }
  }
  if (!mainEl) mainEl = $("body");

  const rawText = (mainEl.text() || "").replace(/\s+/g, " ").trim();
  const text = clip(rawText, POST_CONTENT_MAX_CHARS);

  // First image: prefer images inside the picked main region. Skip data:/svg
  // and obviously tiny "spacer" images by checking the file extension and host.
  let image: string | null = null;
  mainEl.find("img").each((_, el) => {
    if (image) return;
    const src =
      $(el).attr("src") ||
      $(el).attr("data-src") ||
      $(el).attr("data-original") ||
      "";
    if (!src || src.startsWith("data:")) return;
    try {
      const abs = new URL(src, baseUrl).href;
      if (/\.(svg)(\?|$)/i.test(abs)) return; // skip SVG (often icons)
      image = abs;
    } catch {
      /* skip bad URL */
    }
  });

  // og:image fallback
  if (!image) {
    const og = $("meta[property='og:image']").attr("content");
    if (og) {
      try {
        image = new URL(og, baseUrl).href;
      } catch {
        /* ignore */
      }
    }
  }

  const title =
    $("h1").first().text().trim() ||
    $("title").first().text().trim() ||
    null;

  return { text, image_url: image, title };
}

// ---------------------------------------------------------------------------
// Image download with content-type + size guards
// ---------------------------------------------------------------------------

export async function downloadImageToS3(
  projectId: string,
  imageUrl: string,
): Promise<string | null> {
  try {
    const response = await axios.get(imageUrl, {
      responseType: "arraybuffer",
      timeout: IMAGE_DOWNLOAD_TIMEOUT_MS,
      maxContentLength: MAX_IMAGE_BYTES,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Accept: "image/*",
      },
      validateStatus: (s) => s >= 200 && s < 300,
    });

    const contentType = String(
      response.headers["content-type"] || "",
    ).toLowerCase();
    if (!contentType.startsWith("image/")) {
      log("Skipping non-image content-type", { url: imageUrl, contentType });
      return null;
    }

    const buffer = Buffer.from(response.data);
    if (buffer.length > MAX_IMAGE_BYTES) {
      log("Skipping oversized image", { url: imageUrl, bytes: buffer.length });
      return null;
    }

    const ext = contentType.includes("png")
      ? "png"
      : contentType.includes("webp")
        ? "webp"
        : contentType.includes("svg")
          ? "svg"
          : contentType.includes("gif")
            ? "gif"
            : "jpg";
    const filename = `post-images/${safeHash(imageUrl)}-${Date.now()}.${ext}`;
    const s3Key = buildMediaS3Key(projectId, filename);
    await uploadToS3(s3Key, buffer, contentType);
    return buildS3Url(s3Key);
  } catch (err: any) {
    log("Image download failed", { url: imageUrl, error: err?.message });
    return null;
  }
}

// ---------------------------------------------------------------------------
// Location markdown builder (F4)
// ---------------------------------------------------------------------------

export function formatLocationHours(hours: unknown): string {
  if (!hours) return "Not provided";

  // GBP shape A: array of "Monday: 9:00 AM – 5:00 PM" strings
  if (Array.isArray(hours) && hours.length > 0 && typeof hours[0] === "string") {
    return (hours as string[]).join("\n");
  }

  // GBP shape B: array of { day, hours } objects (Apify normalized output)
  if (Array.isArray(hours) && hours.length > 0 && typeof hours[0] === "object") {
    return (hours as Array<{ day?: string; hours?: string }>)
      .map((h) => {
        const day = h?.day || "";
        const time = h?.hours || "";
        return [day, time].filter(Boolean).join(": ");
      })
      .filter(Boolean)
      .join("\n");
  }

  // GBP shape C: { periods: [{ open, close, weekday }] }
  if (
    typeof hours === "object" &&
    hours !== null &&
    Array.isArray((hours as any).periods)
  ) {
    return (hours as any).periods
      .map((p: any) => {
        const day = p?.weekday ?? p?.day ?? "";
        const open = p?.open ?? "";
        const close = p?.close ?? "";
        return `${day}: ${open} – ${close}`;
      })
      .join("\n");
  }

  return "Not provided";
}

export interface LocationEntryShape {
  place_id: string;
  name?: string | null;
  address?: string | null;
  phone?: string | null;
  hours?: unknown;
  website_url?: string | null;
  /**
   * Optional photo URL that may have been captured on a per-location basis
   * (not currently stored on `identity.locations[]` in the warmup pipeline,
   * but we read it defensively in case it's added later).
   */
  featured_image_url?: string | null;
}

export function buildLocationMarkdown(loc: LocationEntryShape): string {
  const lines: string[] = [];
  lines.push(`**Address:** ${loc.address || "Not provided"}`);
  lines.push(`**Phone:** ${loc.phone || "Not provided"}`);
  lines.push(`**Hours:**`);
  lines.push(formatLocationHours(loc.hours));
  if (loc.website_url) {
    lines.push("");
    lines.push(`**Website:** ${loc.website_url}`);
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Slug uniqueness
// ---------------------------------------------------------------------------

export async function uniqueSlug(
  projectId: string,
  postTypeId: string,
  desired: string,
  ignorePostId?: string,
): Promise<string> {
  let slug = desired || `post-${Date.now().toString(36)}`;
  let attempt = 0;
  // Cap retries — extreme collisions are vanishingly rare.
  while (attempt < 5) {
    const conflict = await PostModel.findSlugCollisionForImport(
      projectId,
      postTypeId,
      slug,
      ignorePostId,
    );
    if (!conflict) return slug;
    attempt += 1;
    slug = `${desired}-${Date.now().toString(36).slice(-4)}-${attempt}`;
  }
  return slug;
}
