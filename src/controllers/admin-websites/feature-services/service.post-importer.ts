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
 * This module owns orchestration: post-type resolution + the per-entry loop.
 * The per-entry handlers (scrape/extract/build/persist) live in
 * service.post-import-entries.ts, and the shared helpers (cheerio extraction,
 * image download to S3, location markdown, slug uniqueness) live in
 * feature-utils/util.post-import-helpers.ts.
 *
 * The HTTP layer enqueues a BullMQ job that calls `importFromIdentity()` —
 * see `src/workers/processors/postImporter.processor.ts`.
 */

import { PostTypeModel } from "../../../models/website-builder/PostTypeModel";
import { ProjectModel } from "../../../models/website-builder/ProjectModel";
import logger from "../../../lib/logger";
import type { scrapeUrl } from "./service.url-scrape-strategies";
import { slugify, parseIdentityJson } from "../feature-utils/util.post-import-helpers";
import {
  importDoctorOrServiceEntry,
  importLocationEntry,
} from "./service.post-import-entries";

// Public types live in util.post-import-types.ts (shared with the per-entry
// handlers to avoid a circular import). Re-exported here so existing consumers
// keep importing them from this path.
export type {
  ImportPostType,
  ImportEntryObject,
  ImportFromIdentityArgs,
  ImportEntryStatus,
  ImportEntryResult,
  ImportResultSummary,
  ImportFromIdentityCallbacks,
} from "../feature-utils/util.post-import-types";

import type {
  ImportPostType,
  ImportEntryResult,
  ImportResultSummary,
  ImportFromIdentityArgs,
  ImportFromIdentityCallbacks,
} from "../feature-utils/util.post-import-types";

const LOG_PREFIX = "[PostImporter]";
function log(msg: string, data?: Record<string, unknown>): void {
  logger.info({ detail: data ? JSON.stringify(data) : "" }, `${LOG_PREFIX} ${msg}`);
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
// Cheerio extraction, image download, location markdown, slug uniqueness, and
// the per-entry handlers live in feature-utils/util.post-import-helpers.ts and
// service.post-import-entries.ts (behavior-preserving extraction).
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Public entrypoint
// ---------------------------------------------------------------------------

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
