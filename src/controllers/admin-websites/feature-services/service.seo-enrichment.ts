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

  // T2 — sanitize invalid schema.org business types
  if (Array.isArray(enriched.schema_json)) {
    const sanitized = sanitizeSchemaJsonTypes(enriched.schema_json);
    if (JSON.stringify(sanitized) !== JSON.stringify(enriched.schema_json)) {
      enriched.schema_json = sanitized;
      changed.push("schema_json:type");
    }
  }

  // T3 — og_image from the post's own featured_image
  if (post.featured_image && enriched.og_image !== post.featured_image) {
    enriched.og_image = post.featured_image;
    changed.push("og_image");
  }

  // T4 — real aggregateRating (never LLM-authored)
  if (Array.isArray(enriched.schema_json)) {
    const project = await ProjectModel.findOrganizationIdById(projectId);
    if (project?.organization_id) {
      const rating = await fetchProjectAggregateRating(project.organization_id);
      if (rating) {
        const withRating = injectAggregateRating(enriched.schema_json, rating);
        if (JSON.stringify(withRating) !== JSON.stringify(enriched.schema_json)) {
          enriched.schema_json = withRating;
          changed.push("schema_json:aggregateRating");
        }
      }
    }
  }

  // T5 — faq_candidates -> FAQPage schema
  if (Array.isArray(enriched.faq_candidates) && Array.isArray(enriched.schema_json)) {
    if (!hasFaqPageSchema(enriched.schema_json)) {
      const faqSchema = buildFaqPageSchema(enriched.faq_candidates);
      if (faqSchema) {
        enriched.schema_json = [...(enriched.schema_json as unknown[]), faqSchema];
        changed.push("schema_json:faqpage");
      }
    }
  }

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
