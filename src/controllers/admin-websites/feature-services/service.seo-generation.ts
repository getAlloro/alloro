/**
 * SEO Generation Service
 *
 * AI-powered SEO content generation using Claude Sonnet 5.
 * Generates meta tags, descriptions, schema markup section by section.
 * Uses CroSEO mind skills for enhanced context.
 *
 * Section execution (tiering, insight scheduling, prompt caching) lives in
 * feature-utils/util.seo-section-runner.ts, shared with the bulk-generate
 * worker (workers/processors/seoBulkGenerate.processor.ts).
 */

import { LocationModel } from "../../../models/LocationModel";
import { OrganizationModel } from "../../../models/OrganizationModel";
import { ProjectModel } from "../../../models/website-builder/ProjectModel";
import { loadPrompt } from "../../../agents/service.prompt-loader";
import { runAgent } from "../../../agents/service.llm-runner";
import {
  runGenerateSection,
  runAllSeoSectionsTiered,
  type SeoSection,
} from "../feature-utils/util.seo-section-runner";
import logger from "../../../lib/logger";

const MODEL = "claude-sonnet-5";

const SKILLS_BASE_URL = "https://app.getalloro.com/api/skills";
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;

interface GenerateRequest {
  section: SeoSection;
  location_context: string | null; // location_id or "organization"
  page_content: string;
  homepage_content?: string;
  header_html?: string;
  footer_html?: string;
  wrapper_html?: string;
  existing_seo_data?: Record<string, unknown>;
  all_page_titles?: string[];
  all_page_descriptions?: string[];
  page_path?: string;
  post_title?: string;
}

interface AnalyzeRequest {
  section: SeoSection;
  location_context: string | null;
  page_content: string;
  existing_seo_data: Record<string, unknown>;
  page_path?: string;
  post_title?: string;
}

// ---------------------------------------------------------------------------
// Mind skill context fetchers (cached per process)
// ---------------------------------------------------------------------------

let cachedCreatorContext: string | null = null;
let cachedValidatorContext: string | null = null;

async function fetchMindSkillCreator(): Promise<string> {
  if (cachedCreatorContext) return cachedCreatorContext;
  try {
    const res = await fetch(
      `${SKILLS_BASE_URL}/seo-head-meta-tags-creator/portal`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-internal-key": INTERNAL_API_KEY || "",
        },
        body: JSON.stringify({
          query:
            "Generate the head seo meta tag criteria list to add as context in generating a complete Head SEO meta tag for the current page",
        }),
      }
    );
    if (!res.ok) {
      logger.warn({ detail: res.status }, "[SEO] Mind skill creator returned");
      return "";
    }
    const data = await res.json();
    cachedCreatorContext = data.response || data.result || data.output || "";
    return cachedCreatorContext as string;
  } catch (err) {
    logger.warn({ err: err }, "[SEO] Failed to fetch mind skill creator context:");
    return "";
  }
}

async function fetchMindSkillValidator(): Promise<string> {
  if (cachedValidatorContext) return cachedValidatorContext;
  try {
    const res = await fetch(
      `${SKILLS_BASE_URL}/seo-head-meta-tags-validator/portal`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-internal-key": INTERNAL_API_KEY || "",
        },
        body: JSON.stringify({
          query:
            "Generate the prompt that will validate, evaluate and score a given head seo meta tag object",
        }),
      }
    );
    if (!res.ok) {
      logger.warn({ detail: res.status }, "[SEO] Mind skill validator returned");
      return "";
    }
    const data = await res.json();
    cachedValidatorContext = data.response || data.result || data.output || "";
    return cachedValidatorContext as string;
  } catch (err) {
    logger.warn({ err: err }, "[SEO] Failed to fetch mind skill validator context:");
    return "";
  }
}

// ---------------------------------------------------------------------------
// Generate SEO for a section
// ---------------------------------------------------------------------------

export async function generateSeoForSection(
  projectId: string,
  entityId: string,
  entityType: "page" | "post",
  body: GenerateRequest
): Promise<{ section: string; generated: Record<string, unknown>; insight: string }> {
  const {
    section,
    location_context,
    page_content,
    homepage_content,
    header_html,
    footer_html,
    wrapper_html,
    existing_seo_data,
    all_page_titles,
    all_page_descriptions,
    page_path,
    post_title,
  } = body;

  // Fetch business data and mind skill context in parallel
  const [businessData, creatorContext, validatorContext] = await Promise.all([
    fetchBusinessData(projectId, location_context),
    fetchMindSkillCreator(),
    fetchMindSkillValidator(),
  ]);

  if (!businessData) {
    throw new Error(
      "Business data not found. Refresh business data in Settings > Integrations first."
    );
  }

  return runGenerateSection(section, entityType, businessData, creatorContext, validatorContext, {
    page_content,
    homepage_content,
    header_html,
    footer_html,
    wrapper_html,
    existing_seo_data,
    all_page_titles,
    all_page_descriptions,
    page_path,
    post_title,
  }, projectId, entityId);
}

// ---------------------------------------------------------------------------
// Generate ALL sections in one call (fetches shared context once)
// ---------------------------------------------------------------------------

interface GenerateAllRequest {
  location_context: string | null;
  page_content: string;
  homepage_content?: string;
  header_html?: string;
  footer_html?: string;
  wrapper_html?: string;
  existing_seo_data?: Record<string, unknown>;
  all_page_titles?: string[];
  all_page_descriptions?: string[];
  page_path?: string;
  post_title?: string;
}

export async function generateAllSeoSections(
  projectId: string,
  entityId: string,
  entityType: "page" | "post",
  body: GenerateAllRequest
): Promise<{ results: Array<{ section: string; generated: Record<string, unknown>; insight: string }> }> {
  const { location_context, ...rest } = body;

  // Single fetch for all shared context
  const [businessData, creatorContext, validatorContext] = await Promise.all([
    fetchBusinessData(projectId, location_context),
    fetchMindSkillCreator(),
    fetchMindSkillValidator(),
  ]);

  if (!businessData) {
    throw new Error(
      "Business data not found. Refresh business data in Settings > Integrations first."
    );
  }

  const results = await runAllSeoSectionsTiered(
    entityType,
    businessData,
    creatorContext,
    validatorContext,
    rest,
    projectId,
    entityId
  );

  return { results };
}

// ---------------------------------------------------------------------------
// Analyze existing SEO (no regeneration, insights only)
// ---------------------------------------------------------------------------

export async function analyzeSeoForSection(
  projectId: string,
  entityId: string,
  entityType: "page" | "post",
  body: AnalyzeRequest
): Promise<{ section: string; insight: string }> {
  const { section, location_context, page_content, existing_seo_data, page_path, post_title } = body;

  const [businessData, validatorContext] = await Promise.all([
    fetchBusinessData(projectId, location_context),
    fetchMindSkillValidator(),
  ]);

  if (!businessData) {
    throw new Error("Business data not found.");
  }

  // Extract only the fields relevant to this section
  const sectionFields = extractSectionFields(section, existing_seo_data);

  const basePrompt = loadPrompt("websiteAgents/SeoAnalysis");
  const systemPrompt = `${basePrompt}

BUSINESS DATA:
${JSON.stringify(businessData, null, 2)}

${validatorContext ? `SEO VALIDATION CRITERIA (from CroSEO mind):\n${validatorContext}\n` : ""}`;

  const userPrompt = `SECTION: ${section}
${page_path ? `PAGE PATH: ${page_path}\n` : ""}${post_title ? `POST TITLE: ${post_title}\n` : ""}
PAGE CONTENT (summary):
${truncate(page_content, 3000)}

CURRENT SEO DATA FOR THIS SECTION:
${JSON.stringify(sectionFields, null, 2)}

FULL SEO DATA:
${JSON.stringify(existing_seo_data, null, 2)}

Analyze the "${section}" section's SEO data. Return ONLY valid JSON: { "insight": "..." }`;

  const result = await runAgent({
    systemPrompt,
    // Whole system prompt is stable per page (varies only by businessData/
    // validatorContext, not per section) — cache it as a single block.
    cachedSystemBlocks: [],
    userMessage: userPrompt,
    model: MODEL,
    maxTokens: 512,
    costContext: {
      projectId,
      eventType: "seo-generation",
      metadata: {
        section,
        entity_type: entityType,
        entity_id: entityId,
        page_path: page_path || null,
        stage: "analyze",
      },
    },
  });

  const parsed = result.parsed || parseGeneratedSeo(result.raw, section);

  return {
    section,
    insight: (parsed.insight as string) || "Analysis complete — no specific issues found.",
  };
}

// ---------------------------------------------------------------------------
// Section field extraction (for targeted analysis)
// ---------------------------------------------------------------------------

function extractSectionFields(
  section: SeoSection,
  data: Record<string, unknown>
): Record<string, unknown> {
  const fieldMap: Record<SeoSection, string[]> = {
    critical: ["meta_title", "canonical_url", "robots"],
    high_impact: ["meta_description", "max_image_preview"],
    significant: ["schema_json"],
    moderate: ["og_title", "og_description", "og_image", "og_type"],
    negligible: ["og_type", "og_description"],
  };
  const fields = fieldMap[section] || [];
  const result: Record<string, unknown> = {};
  for (const f of fields) {
    if (data[f] !== undefined) result[f] = data[f];
  }
  return result;
}

// ---------------------------------------------------------------------------
// Shared context for bulk generation (used by worker processor)
// ---------------------------------------------------------------------------

export interface SharedSeoContext {
  businessData: Record<string, unknown>;
  creatorContext: string;
  validatorContext: string;
}

export async function fetchSharedContext(
  projectId: string,
  locationContext?: string | null
): Promise<SharedSeoContext> {
  const [businessData, creatorContext, validatorContext] = await Promise.all([
    fetchBusinessData(projectId, locationContext || null),
    fetchMindSkillCreator(),
    fetchMindSkillValidator(),
  ]);

  if (!businessData) {
    throw new Error(
      "Business data not found. Refresh business data in Settings > Integrations first."
    );
  }

  return { businessData, creatorContext, validatorContext };
}

export async function generateAllWithSharedContext(
  ctx: SharedSeoContext,
  entityType: "page" | "post",
  data: {
    page_content: string;
    homepage_content?: string;
    header_html?: string;
    footer_html?: string;
    wrapper_html?: string;
    existing_seo_data?: Record<string, unknown>;
    all_page_titles?: string[];
    all_page_descriptions?: string[];
    page_path?: string;
    post_title?: string;
  },
  projectId?: string,
  entityId?: string
): Promise<Array<{ section: string; generated: Record<string, unknown>; insight: string }>> {
  return runAllSeoSectionsTiered(
    entityType,
    ctx.businessData,
    ctx.creatorContext,
    ctx.validatorContext,
    data,
    projectId,
    entityId
  );
}

// ---------------------------------------------------------------------------
// Business data fetching
// ---------------------------------------------------------------------------

async function fetchBusinessData(
  projectId: string,
  locationContext: string | null
): Promise<Record<string, unknown> | null> {
  const project = await ProjectModel.findOrganizationIdById(projectId);
  if (!project?.organization_id) return null;

  const orgId = project.organization_id;
  const org = await OrganizationModel.findById(orgId);
  if (!org) return null;

  const orgData = (org.business_data as Record<string, unknown>) || {};

  if (locationContext && locationContext !== "organization") {
    const locationId = parseInt(locationContext, 10);
    if (!isNaN(locationId)) {
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
  }

  const locations = await LocationModel.findByOrganizationId(orgId);
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

// ---------------------------------------------------------------------------
// Response parsing
// ---------------------------------------------------------------------------

function parseGeneratedSeo(
  text: string,
  section: SeoSection
): Record<string, unknown> {
  let cleaned = text.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }

  try {
    return JSON.parse(cleaned);
  } catch {
    logger.error({ err: cleaned.slice(0, 200) }, `[SEO Generation] Failed to parse response for section "${section}":`);
    return {};
  }
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + "\n... (truncated)";
}
