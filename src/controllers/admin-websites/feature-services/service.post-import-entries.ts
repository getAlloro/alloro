/**
 * Post Importer — per-entry handlers
 *
 * The two "one source → one draft post" handlers the importer orchestrator
 * (service.post-importer.ts) loops over:
 *   - importDoctorOrServiceEntry — scrape the source URL (fetch → browser →
 *     screenshot fallback), parse with cheerio, download the first meaningful
 *     image to S3, create/update a draft post.
 *   - importLocationEntry — skip URL scraping; build markdown from the
 *     structured GBP location entry on `identity.locations[]`.
 *
 * Dedup: posts are matched by `(project_id, post_type_id, source_url)` where
 * `source_url` = original URL for doctor/service or `place_id` for location.
 * Existing matches are skipped unless `overwrite=true`.
 *
 * Behavior-preserving extraction from service.post-importer.ts.
 */

import { scrapeUrl, type ScrapeStrategy } from "./service.url-scrape-strategies";
import { PostModel } from "../../../models/website-builder/PostModel";
import logger from "../../../lib/logger";
import {
  type ImportPostType,
  type ImportEntryResult,
} from "../feature-utils/util.post-import-types";
import {
  POST_CONTENT_MAX_CHARS,
  slugify,
  clip,
  safeHash,
  extractFromHtml,
  downloadImageToS3,
  buildLocationMarkdown,
  uniqueSlug,
  type LocationEntryShape,
} from "../feature-utils/util.post-import-helpers";

const LOG_PREFIX = "[PostImporter]";
function log(msg: string, data?: Record<string, unknown>): void {
  logger.info({ detail: data ? JSON.stringify(data) : "" }, `${LOG_PREFIX} ${msg}`);
}

// ---------------------------------------------------------------------------
// Doctor / service entry handler
// ---------------------------------------------------------------------------

export async function importDoctorOrServiceEntry(args: {
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

export async function importLocationEntry(args: {
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
