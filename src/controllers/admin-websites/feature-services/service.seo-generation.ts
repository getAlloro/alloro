/**
 * SEO Generation Service
 *
 * AI-powered SEO content generation using Claude Sonnet 4.6.
 * Generates meta tags, descriptions, schema markup section by section.
 * Uses CroSEO mind skills for enhanced context.
 */

import { LocationModel } from "../../../models/LocationModel";
import { OrganizationModel } from "../../../models/OrganizationModel";
import { ProjectModel } from "../../../models/website-builder/ProjectModel";
import { loadPrompt } from "../../../agents/service.prompt-loader";
import { runAgent } from "../../../agents/service.llm-runner";
import logger from "../../../lib/logger";

const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 4096;

const SKILLS_BASE_URL = "https://app.getalloro.com/api/skills";
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;

type SeoSection =
  | "critical"
  | "high_impact"
  | "significant"
  | "moderate"
  | "negligible";

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

const ALL_SECTIONS: SeoSection[] = [
  "critical", "high_impact", "significant", "moderate", "negligible",
];

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

  const results: Array<{ section: string; generated: Record<string, unknown>; insight: string }> = [];
  let accumulated = { ...(rest.existing_seo_data || {}) };

  for (const section of ALL_SECTIONS) {
    const result = await runGenerateSection(section, entityType, businessData, creatorContext, validatorContext, {
      ...rest,
      existing_seo_data: accumulated,
    }, projectId, entityId);
    accumulated = { ...accumulated, ...result.generated };
    results.push(result);
  }

  return { results };
}

// ---------------------------------------------------------------------------
// Internal: run generation for a single section with pre-fetched context
// ---------------------------------------------------------------------------

async function runGenerateSection(
  section: SeoSection,
  entityType: "page" | "post",
  businessData: Record<string, unknown>,
  creatorContext: string,
  validatorContext: string,
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
): Promise<{ section: string; generated: Record<string, unknown>; insight: string }> {
  const systemPrompt = buildSystemPrompt(section, businessData, creatorContext);
  const userPrompt = buildUserPrompt(section, { ...data, entityType });

  const result = await runAgent({
    systemPrompt,
    userMessage: userPrompt,
    model: MODEL,
    maxTokens: MAX_TOKENS,
    costContext: projectId
      ? {
          projectId,
          eventType: "seo-generation",
          metadata: {
            section,
            entity_type: entityType,
            entity_id: entityId || null,
            page_path: data.page_path || null,
            stage: "generate",
          },
        }
      : undefined,
  });

  const generated = result.parsed || parseGeneratedSeo(result.raw, section);

  const insight = await generateInsight(
    section,
    generated,
    businessData,
    validatorContext,
    data.page_path,
    data.post_title,
    projectId,
    entityId,
    entityType
  );

  return { section, generated, insight };
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
// Insight generation (called after generation)
// ---------------------------------------------------------------------------

async function generateInsight(
  section: SeoSection,
  generated: Record<string, unknown>,
  businessData: Record<string, unknown>,
  validatorContext: string,
  pagePath?: string,
  postTitle?: string,
  projectId?: string,
  entityId?: string,
  entityType?: "page" | "post"
): Promise<string> {
  try {
    const basePrompt = loadPrompt("websiteAgents/SeoInsight");
    const systemPrompt = `${basePrompt}

BUSINESS DATA:
${JSON.stringify(businessData, null, 2)}

${validatorContext ? `SEO VALIDATION CRITERIA (from CroSEO mind):\n${validatorContext}\n` : ""}`;

    const userPrompt = `SECTION: ${section}
${pagePath ? `PAGE PATH: ${pagePath}\n` : ""}${postTitle ? `POST TITLE: ${postTitle}\n` : ""}
GENERATED SEO DATA:
${JSON.stringify(generated, null, 2)}

Provide a brief insight about this generated "${section}" section. Return ONLY valid JSON: { "insight": "..." }`;

    const result = await runAgent({
      systemPrompt,
      userMessage: userPrompt,
      model: MODEL,
      maxTokens: 256,
      costContext: projectId
        ? {
            projectId,
            eventType: "seo-generation",
            metadata: {
              section,
              entity_type: entityType || null,
              entity_id: entityId || null,
              page_path: pagePath || null,
              stage: "insight",
            },
          }
        : undefined,
    });

    const parsed = result.parsed || parseGeneratedSeo(result.raw, section);
    return (parsed.insight as string) || "";
  } catch (err) {
    logger.warn({ err: err }, "[SEO] Failed to generate insight:");
    return "";
  }
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
  const results: Array<{ section: string; generated: Record<string, unknown>; insight: string }> = [];
  let accumulated = { ...(data.existing_seo_data || {}) };

  for (const section of ALL_SECTIONS) {
    const result = await runGenerateSection(
      section,
      entityType,
      ctx.businessData,
      ctx.creatorContext,
      ctx.validatorContext,
      { ...data, existing_seo_data: accumulated },
      projectId,
      entityId
    );
    accumulated = { ...accumulated, ...result.generated };
    results.push(result);
  }

  return results;
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
// Prompt builders
// ---------------------------------------------------------------------------

const SEO_SECTION_FILE_MAP: Record<SeoSection, string> = {
  critical: "websiteAgents/SeoGeneration.critical",
  high_impact: "websiteAgents/SeoGeneration.high-impact",
  significant: "websiteAgents/SeoGeneration.significant",
  moderate: "websiteAgents/SeoGeneration.moderate",
  negligible: "websiteAgents/SeoGeneration.negligible",
};

function buildSystemPrompt(
  section: SeoSection,
  businessData: Record<string, unknown>,
  creatorContext: string = ""
): string {
  const base = loadPrompt("websiteAgents/SeoGeneration");
  const sectionInstructions = loadPrompt(SEO_SECTION_FILE_MAP[section]);

  return `${base}

BUSINESS DATA:
${JSON.stringify(businessData, null, 2)}

${creatorContext ? `SEO GENERATION CRITERIA (from CroSEO mind):\n${creatorContext}\n` : ""}

${sectionInstructions}`;
}

function buildUserPrompt(
  section: SeoSection,
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
    entityType: "page" | "post";
  }
): string {
  let prompt = `ENTITY TYPE: ${data.entityType}\n`;

  if (data.page_path) prompt += `PAGE PATH: ${data.page_path}\n`;
  if (data.post_title) prompt += `POST TITLE: ${data.post_title}\n`;

  prompt += `\nPAGE CONTENT (the page being optimized):\n${truncate(data.page_content, 8000)}\n`;

  if (data.homepage_content) {
    prompt += `\nHOMEPAGE CONTENT (for context):\n${truncate(data.homepage_content, 4000)}\n`;
  }
  if (data.header_html) {
    prompt += `\nHEADER HTML:\n${truncate(data.header_html, 2000)}\n`;
  }
  if (data.footer_html) {
    prompt += `\nFOOTER HTML:\n${truncate(data.footer_html, 2000)}\n`;
  }

  if (data.existing_seo_data && Object.keys(data.existing_seo_data).length > 0) {
    prompt += `\nEXISTING SEO DATA (for reference, avoid duplicating):\n${JSON.stringify(data.existing_seo_data, null, 2)}\n`;
  }

  if (data.all_page_titles?.length) {
    prompt += `\nEXISTING PAGE TITLES (must be unique from these):\n${data.all_page_titles.join("\n")}\n`;
  }

  if (data.all_page_descriptions?.length) {
    prompt += `\nEXISTING META DESCRIPTIONS (must be unique from these):\n${data.all_page_descriptions.join("\n")}\n`;
  }

  prompt += `\nGenerate the SEO data for the "${section}" section. Return ONLY valid JSON.`;

  return prompt;
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
