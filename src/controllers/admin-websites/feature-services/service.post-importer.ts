/**
 * Post Importer Service
 *
 * Bridges Project Identity → website_builder.posts.
 *
 * Two flavors of import:
 *   - Doctor / Service: scrape the source URL via the existing scrape strategy
 *     stack (fetch → browser → screenshot fallback), parse main content with
 *     cheerio, download the first meaningful image to S3, and create a draft
 *     post.
 *   - Location: skip URL scraping. Pull the structured GBP data from
 *     `identity.locations[]` and build markdown content (address / phone /
 *     hours). No image download today (per-location photo URLs aren't stored
 *     on the location entry — see edge case note in the spec).
 *
 * Dedup: posts are matched by `(project_id, post_type_id, source_url)` where
 * `source_url` = original URL for doctor/service or `place_id` for location.
 * Existing matches are skipped unless `overwrite=true`.
 *
 * Image guards: every download validates `content-type` is `image/*` and
 * caps payload size at 15 MB before the S3 upload happens. This matches the
 * 15 MB ceiling stated in the plan's Constraints.
 *
 * Reused helpers:
 *   - `scrapeUrl` from service.url-scrape-strategies.ts (fetch+browser+screenshot)
 *   - `uploadToS3` / `buildMediaS3Key` / `buildS3Url` from S3 helpers
 *
 * The HTTP layer enqueues a BullMQ job that calls `importFromIdentity()` —
 * see `src/workers/processors/postImporter.processor.ts`.
 */

import axios from "axios";
import * as cheerio from "cheerio";
import * as crypto from "crypto";
import { uploadToS3 } from "../../../utils/core/s3";
import {
  buildMediaS3Key,
  buildS3Url,
} from "../../admin-media/feature-utils/util.s3-helpers";
import { scrapeUrl, type ScrapeStrategy } from "./service.url-scrape-strategies";
import { PostModel } from "../../../models/website-builder/PostModel";
import { PostTypeModel } from "../../../models/website-builder/PostTypeModel";
import { ProjectModel } from "../../../models/website-builder/ProjectModel";
import logger from "../../../lib/logger";

const MAX_IMAGE_BYTES = 15 * 1024 * 1024; // 15 MB cap
const POST_CONTENT_MAX_CHARS = 60_000; // hard wall to keep TEXT row sane
const IMAGE_DOWNLOAD_TIMEOUT_MS = 15_000;

const LOG_PREFIX = "[PostImporter]";
function log(msg: string, data?: Record<string, unknown>): void {
  logger.info({ detail: data ? JSON.stringify(data) : "" }, `${LOG_PREFIX} ${msg}`);
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ImportPostType = "doctor" | "service" | "location";

export interface ImportEntryObject {
  source_url: string;
  name: string;
}

export interface ImportFromIdentityArgs {
  postType: ImportPostType;
  /**
   * For location: list of `place_id` strings.
   * For doctor/service: `{ source_url, name }` objects (or legacy bare-URL strings).
   */
  entries: Array<string | ImportEntryObject>;
  overwrite?: boolean;
}

export type ImportEntryStatus = "created" | "updated" | "skipped" | "failed";

export interface ImportEntryResult {
  /** Echo of the entry key (URL for doctor/service, place_id for location). */
  key: string;
  status: ImportEntryStatus;
  post_id?: string;
  /** Title we persisted (helps the UI render a friendly result row). */
  title?: string;
  /** Reason — populated for skipped + failed. */
  error?: string;
  /** True if the scrape ran via browser/screenshot fallback (admin should review). */
  used_fallback?: boolean;
}

export interface ImportResultSummary {
  total: number;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  results: ImportEntryResult[];
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max);
}

function safeHash(input: string): string {
  return crypto.createHash("sha1").update(input).digest("hex").slice(0, 12);
}

function parseIdentityJson(value: unknown): any {
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
// Post type resolution
// ---------------------------------------------------------------------------

/**
 * Resolve the `post_types.id` for a given (template, slug) pair. Slugs match
 * `post-type.slug` exactly (lowercased). Returns `null` if the template doesn't
 * define one — caller decides how loud to be about that.
 */
async function resolvePostTypeId(
  templateId: string,
  postType: ImportPostType,
): Promise<string | null> {
  // Some templates use plural forms ("doctors", "services", "locations") and
  // some use singular. We try both, preferring an exact match.
  const candidates = [postType, `${postType}s`];
  const row = await PostTypeModel.findByTemplateAndCandidateSlugs(
    templateId,
    candidates.map((c) => c.toLowerCase()),
    postType.toLowerCase(),
  );
  return row?.id ?? null;
}

// ---------------------------------------------------------------------------
// Cheerio-driven extraction
// ---------------------------------------------------------------------------

interface ExtractedPage {
  /** Best-guess plaintext of the main article body. */
  text: string;
  /** First meaningful absolute image URL we found. */
  image_url: string | null;
  /** Page title — used as a fallback if the identity entry didn't carry one. */
  title: string | null;
}

function extractFromHtml(html: string, baseUrl: string): ExtractedPage {
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

async function downloadImageToS3(
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

function formatLocationHours(hours: unknown): string {
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

interface LocationEntryShape {
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

function buildLocationMarkdown(loc: LocationEntryShape): string {
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

async function uniqueSlug(
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

// ---------------------------------------------------------------------------
// Doctor / service entry handler
// ---------------------------------------------------------------------------

async function importDoctorOrServiceEntry(args: {
  projectId: string;
  postTypeId: string;
  postType: ImportPostType;
  entryUrl: string;
  entryName: string | null;
  compositeKey: string;
  identity: any;
  overwrite: boolean;
  scrapeCache: Map<string, Awaited<ReturnType<typeof scrapeUrl>> | null>;
}): Promise<ImportEntryResult> {
  const {
    projectId, postTypeId, postType, entryUrl, entryName, compositeKey,
    identity, overwrite, scrapeCache,
  } = args;

  const dedupKey = compositeKey;

  const list = postType === "doctor"
    ? identity?.content_essentials?.doctors
    : identity?.content_essentials?.services;
  const identityEntry = Array.isArray(list)
    ? entryName
      ? list.find((e: any) => e?.name === entryName)
      : list.find((e: any) => e?.source_url === entryUrl)
    : null;

  // Dedup check — match on composite key stored in source_url
  const existing = await PostModel.findByImportDedupKey(
    projectId,
    postTypeId,
    dedupKey,
  );
  if (existing && !overwrite) {
    return {
      key: dedupKey,
      status: "skipped",
      title: existing.title,
      post_id: existing.id,
      error: "Already imported. Toggle overwrite to refresh.",
    };
  }

  // Scrape with cache — reuse result when multiple entries share a URL
  let scraped: Awaited<ReturnType<typeof scrapeUrl>> | null = null;
  let used_fallback = false;
  let lastError: string | null = null;

  if (scrapeCache.has(entryUrl)) {
    scraped = scrapeCache.get(entryUrl) ?? null;
    used_fallback = scraped ? scraped.strategy_used !== "fetch" : false;
  } else {
    const strategies: ScrapeStrategy[] = ["fetch", "browser", "screenshot"];
    for (let i = 0; i < strategies.length; i++) {
      const strat = strategies[i];
      try {
        const r = await scrapeUrl(entryUrl, strat);
        if (!r.was_blocked && Object.keys(r.pages).length > 0) {
          scraped = r;
          if (strat !== "fetch") used_fallback = true;
          break;
        }
        lastError = `${strat} returned empty`;
      } catch (err: any) {
        lastError = err?.message || String(err);
      }
    }
    scrapeCache.set(entryUrl, scraped);
  }

  if (!scraped) {
    return {
      key: dedupKey,
      status: "failed",
      title: identityEntry?.name,
      error: `Scrape failed for all strategies: ${lastError || "unknown"}`,
    };
  }

  let extractedText = "";
  let extractedImage: string | null = null;
  let extractedTitle: string | null = null;

  if (scraped.strategy_used === "screenshot") {
    extractedText = clip(scraped.extracted_text || "", POST_CONTENT_MAX_CHARS);
    extractedImage = scraped.images[0] || null;
  } else {
    const html = Object.values(scraped.pages)[0] || "";
    if (!html.trim()) {
      return {
        key: dedupKey,
        status: "failed",
        title: identityEntry?.name,
        error: "Scrape returned an empty document.",
        used_fallback,
      };
    }
    try {
      const parsed = extractFromHtml(html, entryUrl);
      extractedText = parsed.text;
      extractedImage = parsed.image_url || scraped.images[0] || null;
      extractedTitle = parsed.title;
    } catch (err: any) {
      log("cheerio parse failed, using raw scrape", {
        url: entryUrl,
        error: err?.message,
      });
      extractedImage = scraped.images[0] || null;
    }
  }

  const title =
    entryName?.trim() ||
    identityEntry?.name?.trim() ||
    extractedTitle?.trim() ||
    `Imported from ${entryUrl}`;

  let featuredImageUrl: string | null = null;
  if (extractedImage) {
    featuredImageUrl = await downloadImageToS3(projectId, extractedImage);
  }

  if (existing && overwrite) {
    const slug = existing.slug;
    await PostModel.updateFieldsById(existing.id, {
      title,
      slug,
      content: extractedText,
      excerpt: identityEntry?.short_blurb
        ? clip(identityEntry.short_blurb, 1000)
        : null,
      featured_image: featuredImageUrl ?? existing.featured_image,
      source_url: dedupKey,
    });
    return {
      key: dedupKey,
      status: "updated",
      post_id: existing.id,
      title,
      used_fallback,
    };
  }

  const desiredSlug = slugify(title) || `post-${safeHash(dedupKey)}`;
  const slug = await uniqueSlug(projectId, postTypeId, desiredSlug);

  try {
    const post = await PostModel.insertReturning({
      project_id: projectId,
      post_type_id: postTypeId,
      title,
      slug,
      content: extractedText,
      excerpt: identityEntry?.short_blurb
        ? clip(identityEntry.short_blurb, 1000)
        : null,
      featured_image: featuredImageUrl,
      source_url: dedupKey,
      status: "draft",
      custom_fields: JSON.stringify({}),
    });
    return {
      key: dedupKey,
      status: "created",
      post_id: post.id,
      title,
      used_fallback,
    };
  } catch (err: any) {
    if (
      err?.code === "23505" ||
      String(err?.message || "").includes("idx_posts_project_type_source")
    ) {
      const collided = await PostModel.findByImportDedupKey(
        projectId,
        postTypeId,
        dedupKey,
      );
      return {
        key: dedupKey,
        status: "skipped",
        post_id: collided?.id,
        title: collided?.title,
        error: "Duplicate detected after scrape (race).",
        used_fallback,
      };
    }
    return {
      key: dedupKey,
      status: "failed",
      title,
      error: err?.message || String(err),
      used_fallback,
    };
  }
}

// ---------------------------------------------------------------------------
// Location entry handler (F4)
// ---------------------------------------------------------------------------

async function importLocationEntry(args: {
  projectId: string;
  postTypeId: string;
  placeId: string;
  identity: any;
  overwrite: boolean;
}): Promise<ImportEntryResult> {
  const { projectId, postTypeId, placeId, identity, overwrite } = args;

  const locations: LocationEntryShape[] = Array.isArray(identity?.locations)
    ? identity.locations
    : [];
  const loc = locations.find((l) => l?.place_id === placeId);

  if (!loc) {
    return {
      key: placeId,
      status: "failed",
      error: "Location not found in identity.locations",
    };
  }

  // Dedup against (project, post_type, source_url=place_id)
  const existing = await PostModel.findByImportDedupKey(
    projectId,
    postTypeId,
    placeId,
  );
  if (existing && !overwrite) {
    return {
      key: placeId,
      status: "skipped",
      post_id: existing.id,
      title: existing.title,
      error: "Already imported. Toggle overwrite to refresh.",
    };
  }

  const title = (loc.name || "Untitled location").trim();
  const content = buildLocationMarkdown(loc);

  // Image: today the warmup pipeline doesn't stamp a per-location photo URL
  // on the location entry. We read `featured_image_url` defensively so this
  // works the moment that field shows up.
  let featuredImageUrl: string | null = null;
  if (loc.featured_image_url) {
    featuredImageUrl = await downloadImageToS3(
      projectId,
      loc.featured_image_url,
    );
  }

  if (existing && overwrite) {
    await PostModel.updateFieldsById(existing.id, {
      title,
      content,
      excerpt: loc.address ? clip(loc.address, 1000) : null,
      featured_image: featuredImageUrl ?? existing.featured_image,
      source_url: placeId,
    });
    return {
      key: placeId,
      status: "updated",
      post_id: existing.id,
      title,
    };
  }

  const desiredSlug = slugify(title) || `location-${safeHash(placeId)}`;
  const slug = await uniqueSlug(projectId, postTypeId, desiredSlug);

  try {
    const post = await PostModel.insertReturning({
      project_id: projectId,
      post_type_id: postTypeId,
      title,
      slug,
      content,
      excerpt: loc.address ? clip(loc.address, 1000) : null,
      featured_image: featuredImageUrl,
      source_url: placeId,
      status: "draft",
      custom_fields: JSON.stringify({}),
    });
    return {
      key: placeId,
      status: "created",
      post_id: post.id,
      title,
    };
  } catch (err: any) {
    if (
      err?.code === "23505" ||
      String(err?.message || "").includes("idx_posts_project_type_source")
    ) {
      const collided = await PostModel.findByImportDedupKey(
        projectId,
        postTypeId,
        placeId,
      );
      return {
        key: placeId,
        status: "skipped",
        post_id: collided?.id,
        title: collided?.title,
        error: "Duplicate detected after build (race).",
      };
    }
    return {
      key: placeId,
      status: "failed",
      title,
      error: err?.message || String(err),
    };
  }
}

// ---------------------------------------------------------------------------
// Public entrypoint
// ---------------------------------------------------------------------------

export interface ImportFromIdentityCallbacks {
  /** Optional progress hook — called after each entry settles. */
  onEntry?: (
    result: ImportEntryResult,
    progress: { completed: number; total: number },
  ) => Promise<void> | void;
}

export async function importFromIdentity(
  projectId: string,
  args: ImportFromIdentityArgs,
  callbacks?: ImportFromIdentityCallbacks,
): Promise<ImportResultSummary> {
  const { postType, entries, overwrite = false } = args;

  if (!Array.isArray(entries) || entries.length === 0) {
    return {
      total: 0,
      created: 0,
      updated: 0,
      skipped: 0,
      failed: 0,
      results: [],
    };
  }

  // Load project + identity once. Same identity blob is reused across entries.
  const project = await ProjectModel.findIdentityContextById(projectId);

  if (!project) {
    throw new Error(`Project not found: ${projectId}`);
  }
  if (!project.template_id) {
    throw new Error(
      `Project ${projectId} has no template — post types can't be resolved.`,
    );
  }

  const identity = parseIdentityJson(project.project_identity) || {};

  const postTypeId = await resolvePostTypeId(project.template_id, postType);
  if (!postTypeId) {
    throw new Error(
      `Template ${project.template_id} has no post type matching "${postType}". Add the post type before importing.`,
    );
  }

  // Normalize entries: objects carry { source_url, name }, strings are bare keys.
  type NormalizedEntry = { key: string; sourceUrl: string; entryName: string | null };
  const seen = new Set<string>();
  const normalizedEntries: NormalizedEntry[] = [];
  for (const raw of entries) {
    if (!raw) continue;
    let ne: NormalizedEntry;
    if (typeof raw === "object" && raw.source_url) {
      const compositeKey = `${raw.source_url}#${slugify(raw.name || "")}`;
      ne = { key: compositeKey, sourceUrl: raw.source_url, entryName: raw.name || null };
    } else if (typeof raw === "string") {
      ne = { key: raw, sourceUrl: raw, entryName: null };
    } else {
      continue;
    }
    if (seen.has(ne.key)) continue;
    seen.add(ne.key);
    normalizedEntries.push(ne);
  }

  const total = normalizedEntries.length;
  const results: ImportEntryResult[] = [];
  let completed = 0;

  // Scrape cache: avoids re-fetching the same URL when multiple entries share it.
  const scrapeCache = new Map<string, Awaited<ReturnType<typeof scrapeUrl>> | null>();

  for (const ne of normalizedEntries) {
    let result: ImportEntryResult;
    try {
      if (postType === "location") {
        result = await importLocationEntry({
          projectId,
          postTypeId,
          placeId: ne.sourceUrl,
          identity,
          overwrite,
        });
      } else {
        result = await importDoctorOrServiceEntry({
          projectId,
          postTypeId,
          postType,
          entryUrl: ne.sourceUrl,
          entryName: ne.entryName,
          compositeKey: ne.key,
          identity,
          overwrite,
          scrapeCache,
        });
      }
    } catch (err: any) {
      log("Entry handler threw", { key: ne.key, error: err?.message });
      result = {
        key: ne.key,
        status: "failed",
        error: err?.message || String(err),
      };
    }

    results.push(result);
    completed += 1;
    if (callbacks?.onEntry) {
      try {
        await callbacks.onEntry(result, { completed, total });
      } catch (cbErr: any) {
        log("onEntry callback threw", { error: cbErr?.message });
      }
    }
  }

  const summary: ImportResultSummary = {
    total,
    created: results.filter((r) => r.status === "created").length,
    updated: results.filter((r) => r.status === "updated").length,
    skipped: results.filter((r) => r.status === "skipped").length,
    failed: results.filter((r) => r.status === "failed").length,
    results,
  };

  return summary;
}
