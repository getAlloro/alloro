/**
 * Practice Fact Extraction Processor
 *
 * Extracts source-traceable "practice facts" (credentials, sedation options,
 * languages spoken, insurance accepted, years established, staff names,
 * technology used, etc.) from a page's or post's business_data + content,
 * via the FactExtraction.md prompt. Every fact the LLM returns must carry a
 * literal source_excerpt that is independently verified (§structural
 * no-fabrication enforcement) against the actual input sent to the model —
 * a fact whose excerpt cannot be found verbatim is discarded before write.
 *
 * Idempotent (§21.1): clears prior facts for the page/post before writing
 * the new verified set, so a retried or re-triggered run never duplicates
 * rows. Bounded retries + backoff + dead-letter routing (§21.2) are
 * configured by the caller's `queue.add()` (see SeoController, T6) — this
 * processor's only contribution to that contract is to throw on failure
 * instead of swallowing, so BullMQ's retry machinery actually engages.
 *
 * Mirrors workers/processors/seoBulkGenerate.processor.ts (house style):
 * job data shape, Pino logging, calling into model/service layers rather
 * than inline DB/LLM logic (§21.3).
 */

import { Job } from "bullmq";
import { OrganizationModel } from "../../models/OrganizationModel";
import { LocationModel } from "../../models/LocationModel";
import {
  PracticeFactModel,
  IPracticeFact,
  PracticeFactSourceField,
} from "../../models/website-builder/PracticeFactModel";
import { loadPrompt } from "../../agents/service.prompt-loader";
import { runAgent } from "../../agents/service.llm-runner";
import logger from "../../lib/logger";

export interface ExtractPracticeFactsData {
  organizationId: number;
  locationId?: number | null;
  pageId?: string;
  pageContent?: string;
  postId?: string;
  postContent?: string;
}

interface RawFactCandidate {
  fact_text?: unknown;
  source_field?: unknown;
  source_excerpt?: unknown;
}

const VALID_SOURCE_FIELDS: PracticeFactSourceField[] = [
  "business_data",
  "page_content",
  "post_content",
];

export async function processExtractPracticeFacts(
  job: Job<ExtractPracticeFactsData>
): Promise<void> {
  const { organizationId, locationId, pageId, pageContent, postId, postContent } =
    job.data;

  const entityType = pageId ? "page" : postId ? "post" : null;
  const entityId = pageId || postId || null;

  if (!entityType || !entityId) {
    throw new Error(
      `[FACT-EXTRACT] job=${job.id} missing both pageId and postId — nothing to extract for`
    );
  }

  logger.info(
    `[FACT-EXTRACT] ▶ job=${job.id} org=${organizationId} location=${locationId ?? "n/a"} ` +
      `${entityType}=${entityId}`
  );

  try {
    const content = entityType === "page" ? pageContent : postContent;
    if (!content || content.trim().length === 0) {
      logger.warn(
        `[FACT-EXTRACT] job=${job.id} ${entityType}=${entityId} — empty content, skipping extraction`
      );
      return;
    }

    // business_data is frequently null/sparse (many orgs never populate it) —
    // that must not block extraction from page/post content, which is often
    // where the actual distinguishing facts (equipment, technology, staff
    // credentials named in body copy) live. Only skip entirely when there's
    // truly nothing to extract from either source.
    const businessData = await fetchBusinessData(organizationId, locationId ?? null);
    if (!businessData) {
      logger.info(
        `[FACT-EXTRACT] job=${job.id} org=${organizationId} — no business_data, extracting from ${entityType} content only`
      );
    }

    const businessDataJson = businessData ? JSON.stringify(businessData, null, 2) : "{}";
    const userMessage = buildUserMessage(entityType, businessDataJson, content);
    const systemPrompt = loadPrompt("websiteAgents/FactExtraction");

    const result = await runAgent({
      systemPrompt,
      userMessage,
      maxTokens: 4096,
      costContext: {
        projectId: null,
        eventType: "practice-fact-extraction",
        metadata: { entityType, entityId, organizationId },
      },
    });

    const candidates = extractCandidateArray(result.parsed);
    if (candidates.length === 0) {
      logger.info(
        `[FACT-EXTRACT] job=${job.id} ${entityType}=${entityId} — model returned 0 candidate facts`
      );
    }

    const verified = verifyFacts(
      candidates,
      businessDataJson,
      content,
      organizationId,
      locationId ?? null,
      entityType === "page" ? entityId : null,
      entityType === "post" ? entityId : null
    );

    const discardedCount = candidates.length - verified.length;
    if (discardedCount > 0) {
      logger.warn(
        `[FACT-EXTRACT] job=${job.id} ${entityType}=${entityId} — discarded ${discardedCount} ` +
          `candidate fact(s) with no verbatim source_excerpt match`
      );
    }

    // Idempotent clear-and-replace (§21.1): re-running this job (retry, or a
    // manual re-trigger) must not accumulate duplicate fact rows.
    if (entityType === "page") {
      await PracticeFactModel.deleteByPageId(entityId);
    } else {
      await PracticeFactModel.deleteByPostId(entityId);
    }

    const written = await PracticeFactModel.createMany(verified);

    logger.info(
      `[FACT-EXTRACT] ■ job=${job.id} ${entityType}=${entityId} — wrote ${written.length} ` +
        `verified fact(s) (${discardedCount} discarded, ${candidates.length} candidate(s) total)`
    );
  } catch (err: any) {
    logger.error(
      {
        err: err?.message,
        jobId: job.id,
        attemptsMade: job.attemptsMade,
        organizationId,
        locationId: locationId ?? null,
        entityType,
        entityId,
      },
      `[FACT-EXTRACT] ✗ job=${job.id} ${entityType}=${entityId} failed (attempt ${job.attemptsMade + 1}):`
    );
    throw err; // Re-throw so BullMQ retries/dead-letters per the queue's configured policy.
  }
}

// ---------------------------------------------------------------------------
// Business data fetch — mirrors service.seo-generation.ts's fetchBusinessData,
// re-scoped to organizationId/locationId (this worker's job payload is
// org/location-keyed, not project-keyed). Not imported from there: that file
// is owned by T5 of this spec and out of this task's edit scope; the logic
// itself is a thin, stable read already proven in production by the SEO
// generation service, so duplication risk is low and bounded to this file.
// ---------------------------------------------------------------------------

async function fetchBusinessData(
  organizationId: number,
  locationId: number | null
): Promise<Record<string, unknown> | null> {
  const org = await OrganizationModel.findById(organizationId);
  if (!org) return null;

  const orgData = (org.business_data as Record<string, unknown>) || {};

  if (locationId !== null) {
    const location = await LocationModel.findById(locationId);
    if (location?.business_data) {
      return {
        type: "location",
        organization: orgData,
        location: location.business_data as Record<string, unknown>,
        location_name: location.name,
      };
    }
  }

  const locations = await LocationModel.findByOrganizationId(organizationId);
  const primaryLoc = locations.find((l) => l.is_primary) || locations[0];

  if (primaryLoc?.business_data) {
    return {
      type: "organization",
      organization: orgData,
      location: primaryLoc.business_data as Record<string, unknown>,
      location_name: primaryLoc.name,
    };
  }

  if (Object.keys(orgData).length > 0) {
    return { type: "organization", organization: orgData, location: null };
  }

  return null;
}

function buildUserMessage(
  entityType: "page" | "post",
  businessDataJson: string,
  content: string
): string {
  const contentLabel = entityType === "page" ? "PAGE CONTENT" : "POST CONTENT";
  return [
    "BUSINESS DATA:",
    businessDataJson,
    "",
    `${contentLabel}:`,
    content,
  ].join("\n");
}

function extractCandidateArray(parsed: unknown): RawFactCandidate[] {
  if (Array.isArray(parsed)) return parsed as RawFactCandidate[];
  // Tolerate a wrapped { facts: [...] } shape in case the model nests it.
  if (
    parsed &&
    typeof parsed === "object" &&
    Array.isArray((parsed as Record<string, unknown>).facts)
  ) {
    return (parsed as Record<string, unknown>).facts as RawFactCandidate[];
  }
  return [];
}

/**
 * Normalize whitespace for substring comparison only — collapses runs of
 * whitespace to a single space and trims. This allows minor
 * newline/indentation differences between what the model echoes back and
 * the literal source string, without weakening the "verbatim" requirement
 * to a fuzzy match.
 */
function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/**
 * Structural no-fabrication enforcement: a candidate fact is kept only if
 * its declared source_field maps to an input we actually sent the model,
 * and its source_excerpt is a verbatim (whitespace-normalized) substring of
 * that input. Everything else is discarded — this is the hard backstop the
 * prompt's instructions alone cannot guarantee.
 */
function verifyFacts(
  candidates: RawFactCandidate[],
  businessDataJson: string,
  entityContent: string,
  organizationId: number,
  locationId: number | null,
  pageId: string | null,
  postId: string | null
): Array<Omit<IPracticeFact, "id" | "extracted_at">> {
  const normalizedBusinessData = normalizeWhitespace(businessDataJson);
  const normalizedContent = normalizeWhitespace(entityContent);

  const verified: Array<Omit<IPracticeFact, "id" | "extracted_at">> = [];

  for (const candidate of candidates) {
    const factText = typeof candidate.fact_text === "string" ? candidate.fact_text.trim() : "";
    const sourceExcerpt =
      typeof candidate.source_excerpt === "string" ? candidate.source_excerpt.trim() : "";
    const sourceFieldRaw =
      typeof candidate.source_field === "string" ? candidate.source_field : "";

    if (!factText || !sourceExcerpt) continue;

    const sourceField: PracticeFactSourceField | null = VALID_SOURCE_FIELDS.includes(
      sourceFieldRaw as PracticeFactSourceField
    )
      ? (sourceFieldRaw as PracticeFactSourceField)
      : null;
    if (!sourceField) continue;

    // post_content and page_content both verify against the same
    // entity-content input; business_data verifies against the JSON blob.
    const haystack =
      sourceField === "business_data" ? normalizedBusinessData : normalizedContent;
    const needle = normalizeWhitespace(sourceExcerpt);

    if (needle.length === 0 || !haystack.includes(needle)) {
      continue; // Fabricated or non-verbatim excerpt — discard the fact entirely.
    }

    verified.push({
      organization_id: organizationId,
      location_id: locationId,
      page_id: pageId,
      post_id: postId,
      fact_text: factText,
      source_field: sourceField,
      source_excerpt: sourceExcerpt,
    });
  }

  return verified;
}
