/**
 * SEO Enrichment Service
 *
 * Deterministic, non-LLM post-processing for a post's seo_data: sanitizes
 * invalid schema.org business types, sources og_image from the post's own
 * featured_image, injects a real aggregateRating from stored review data, and
 * converts faq_candidates into FAQPage schema. Every step is additive and
 * read-patch-write — PostModel.updateSeoDataByIdJsClock is a full-column
 * replace, so this always starts from the post's CURRENT seo_data and only
 * changes the four targeted fields, never re-running title/description/
 * canonical/target-query generation.
 *
 * Distinct from service.seo-generation.ts (LLM-driven generation) and
 * workers/processors/seoBulkGenerate.processor.ts (full regeneration from
 * an empty seo_data object — unsafe to reuse here, see plans/07022026-seo-
 * metatag-fixes/spec.html Risk section).
 */

import { PostModel } from "../../../models/website-builder/PostModel";
import { PageModel } from "../../../models/website-builder/PageModel";
import { ProjectModel } from "../../../models/website-builder/ProjectModel";
import { LocationModel } from "../../../models/LocationModel";
import { ReviewModel } from "../../../models/website-builder/ReviewModel";
import {
  sanitizeSchemaJsonTypes,
} from "../feature-utils/util.schema-business-type";
import {
  injectAggregateRating,
  type RealAggregateRating,
} from "../feature-utils/util.aggregate-rating-schema";
import { buildFaqPageSchema, hasFaqPageSchema } from "../feature-utils/util.faq-schema";
import { trimTitleLength } from "../feature-utils/util.title-length";
import logger from "../../../lib/logger";

export interface PostEnrichmentResult {
  postId: string;
  changed: string[];
}

/**
 * Real average rating + review count for a project's business, sourced from
 * stored `website_builder.reviews` rows (no live Google API call) for the
 * organization's primary location — the same location `fetchBusinessData`
 * (service.seo-generation.ts) already resolves as "the" business for every
 * other business-data field. Returns null when the org has no primary
 * location or no stored reviews, so callers never inject a fabricated value.
 */
export async function fetchProjectAggregateRating(
  organizationId: number
): Promise<RealAggregateRating | null> {
  const primaryLocation = await LocationModel.findPrimaryByOrganizationId(organizationId);
  if (!primaryLocation) return null;

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  const summary = await ReviewModel.getReviewSummaryForLocation(
    primaryLocation.id,
    monthStart,
    monthEnd
  );

  if (summary.rating === null || summary.count === null || summary.count === 0) {
    return null;
  }

  return { ratingValue: summary.rating, reviewCount: summary.count };
}

function parseSeoData(raw: unknown): Record<string, unknown> {
  if (!raw) return {};
  const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
  return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
}

/**
 * Shared title-length enrichment step for both posts and pages: trims an
 * over-60-char meta_title in place on `enriched` and records the change.
 * No-op (including the unresolvable case) when the title already fits or
 * can't be trimmed without cutting the first segment.
 */
function applyTitleTrim(enriched: Record<string, unknown>, changed: string[]): void {
  if (typeof enriched.meta_title !== "string") return;
  const result = trimTitleLength(enriched.meta_title);
  if (result.trimmed) {
    enriched.meta_title = result.title;
    changed.push("meta_title:trimmed");
  }
}

/**
 * Shared invalid-schema-type + aggregateRating enrichment for both posts and
 * pages: mutates `enriched.schema_json` in place when a fix applies and
 * records each change. Both steps are guarded — never fabricate a rating,
 * never invent a schema type beyond the safe fallback.
 */
async function applySchemaTypeAndRating(
  enriched: Record<string, unknown>,
  changed: string[],
  projectId: string
): Promise<void> {
  if (!Array.isArray(enriched.schema_json)) return;

  const sanitized = sanitizeSchemaJsonTypes(enriched.schema_json);
  if (JSON.stringify(sanitized) !== JSON.stringify(enriched.schema_json)) {
    enriched.schema_json = sanitized;
    changed.push("schema_json:type");
  }

  const project = await ProjectModel.findOrganizationIdById(projectId);
  if (!project?.organization_id) return;

  const rating = await fetchProjectAggregateRating(project.organization_id);
  if (!rating) return;

  const withRating = injectAggregateRating(enriched.schema_json as unknown[], rating);
  if (JSON.stringify(withRating) !== JSON.stringify(enriched.schema_json)) {
    enriched.schema_json = withRating;
    changed.push("schema_json:aggregateRating");
  }
}

/**
 * Shared faq_candidates -> FAQPage enrichment for both posts and pages.
 */
function applyFaqPageConversion(enriched: Record<string, unknown>, changed: string[]): void {
  if (!Array.isArray(enriched.faq_candidates) || !Array.isArray(enriched.schema_json)) return;
  if (hasFaqPageSchema(enriched.schema_json)) return;

  const faqSchema = buildFaqPageSchema(enriched.faq_candidates);
  if (faqSchema) {
    enriched.schema_json = [...(enriched.schema_json as unknown[]), faqSchema];
    changed.push("schema_json:faqpage");
  }
}

/**
 * Enrich one post's seo_data in place: fix invalid schema @type, set
 * og_image from featured_image, inject real aggregateRating, convert
 * faq_candidates to FAQPage. Writes only when something actually changed.
 * Never throws for missing rating/featured_image/faq data — those are
 * optional enrichments, not required fields.
 */
export async function enrichPostSeoData(
  postId: string,
  projectId: string
): Promise<PostEnrichmentResult> {
  const post = await PostModel.findRawById(postId);
  if (!post) {
    throw new Error(`[SEO Enrichment] Post not found: ${postId}`);
  }

  const current = parseSeoData(post.seo_data);
  const enriched: Record<string, unknown> = { ...current };
  const changed: string[] = [];

  // og_image from the post's own featured_image (posts only — pages have no featured_image column)
  if (post.featured_image && enriched.og_image !== post.featured_image) {
    enriched.og_image = post.featured_image;
    changed.push("og_image");
  }

  await applySchemaTypeAndRating(enriched, changed, projectId);
  applyFaqPageConversion(enriched, changed);
  applyTitleTrim(enriched, changed);

  if (changed.length === 0) {
    return { postId, changed: [] };
  }

  await PostModel.updateSeoDataByIdJsClock(postId, JSON.stringify(enriched));
  return { postId, changed };
}

export interface EnrichPostsSummary {
  total: number;
  enriched: number;
  unchanged: number;
  failed: Array<{ postId: string; error: string }>;
}

/**
 * Enrich every post of a project (optionally filtered to specific post
 * types), sequentially with per-post error isolation — mirrors
 * workers/processors/seoBulkGenerate.processor.ts's per-entity loop shape,
 * without the LLM generation calls this pipeline deliberately skips.
 */
export async function enrichPostsForProject(
  projectId: string,
  postTypeIds?: string[]
): Promise<EnrichPostsSummary> {
  const posts = postTypeIds && postTypeIds.length > 0
    ? (await Promise.all(postTypeIds.map((id) => PostModel.findByProjectAndTypeForSeo(projectId, id)))).flat()
    : await PostModel.findByProjectFiltered(projectId, { status: "published" });

  const summary: EnrichPostsSummary = { total: posts.length, enriched: 0, unchanged: 0, failed: [] };

  for (const post of posts) {
    try {
      const result = await enrichPostSeoData(post.id, projectId);
      if (result.changed.length > 0) {
        summary.enriched += 1;
        logger.info(
          { postId: post.id, changed: result.changed },
          "[SEO Enrichment] Post enriched"
        );
      } else {
        summary.unchanged += 1;
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      summary.failed.push({ postId: post.id, error: message });
      logger.error({ err, postId: post.id }, "[SEO Enrichment] Post enrichment failed");
    }
  }

  return summary;
}

export interface PageEnrichmentResult {
  pageId: string;
  changed: string[];
}

/**
 * Enrich one page's seo_data in place: fix invalid schema @type, inject a
 * real aggregateRating, convert faq_candidates to FAQPage, trim an
 * over-length title. Same read-patch-write discipline as
 * {@link enrichPostSeoData} — no og_image step here, pages have no
 * featured_image column to source one from (see plans/07022026-seo-full-
 * coverage — page-level og_image was a one-time direct data fix instead).
 */
export async function enrichPageSeoData(
  pageId: string,
  projectId: string
): Promise<PageEnrichmentResult> {
  const page = await PageModel.findRawById(pageId);
  if (!page) {
    throw new Error(`[SEO Enrichment] Page not found: ${pageId}`);
  }

  const current = parseSeoData(page.seo_data);
  const enriched: Record<string, unknown> = { ...current };
  const changed: string[] = [];

  await applySchemaTypeAndRating(enriched, changed, projectId);
  applyFaqPageConversion(enriched, changed);
  applyTitleTrim(enriched, changed);

  if (changed.length === 0) {
    return { pageId, changed: [] };
  }

  await PageModel.updateSeoDataById(pageId, JSON.stringify(enriched));
  return { pageId, changed };
}

export interface EnrichPagesSummary {
  total: number;
  enriched: number;
  unchanged: number;
  failed: Array<{ pageId: string; error: string }>;
}

/**
 * Enrich every published page of a project, sequentially with per-page
 * error isolation — mirrors {@link enrichPostsForProject}.
 */
export async function enrichPagesForProject(projectId: string): Promise<EnrichPagesSummary> {
  const pages = await PageModel.findPublishedByProjectId(projectId);

  const summary: EnrichPagesSummary = { total: pages.length, enriched: 0, unchanged: 0, failed: [] };

  for (const page of pages) {
    try {
      const result = await enrichPageSeoData(page.id, projectId);
      if (result.changed.length > 0) {
        summary.enriched += 1;
        logger.info(
          { pageId: page.id, changed: result.changed },
          "[SEO Enrichment] Page enriched"
        );
      } else {
        summary.unchanged += 1;
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      summary.failed.push({ pageId: page.id, error: message });
      logger.error({ err, pageId: page.id }, "[SEO Enrichment] Page enrichment failed");
    }
  }

  return summary;
}
