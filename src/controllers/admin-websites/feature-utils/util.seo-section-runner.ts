/**
 * SEO Section Runner
 *
 * Generates the 5 SEO sections for one page/post. Sections without a real
 * cross-field dependency run in parallel (tiered); insight generation never
 * blocks progression to the next tier. Shared by the single-entity "Generate
 * All" path (service.seo-generation.ts) and the bulk-generate worker
 * (workers/processors/seoBulkGenerate.processor.ts) so both get the same
 * speedup from one implementation.
 *
 * Tier shape (see SeoGeneration.moderate.md): "moderate" needs the actual
 * generated meta_title to "match or improve on" it, so it can't join the
 * first tier. "negligible" only confirms moderate's og_* fields.
 */

import { loadPrompt } from "../../../agents/service.prompt-loader";
import { runAgent, type CostContext } from "../../../agents/service.llm-runner";
import logger from "../../../lib/logger";
import {
  buildGscDemandUserBlock,
  type GscTopQuery,
} from "./util.seo-gsc-demand";

export type SeoSection =
  | "critical"
  | "high_impact"
  | "significant"
  | "moderate"
  | "negligible"
  | "geo_layer";

export interface SeoSectionRunData {
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

export interface SeoSectionResult {
  section: string;
  generated: Record<string, unknown>;
  insight: string;
}

const MODEL = "claude-sonnet-5";
const MAX_TOKENS = 4096;
const SEO_EFFORT = "medium" as const;

// "geo_layer" joins the first tier alongside "significant" — both consume
// VERIFIED PRACTICE FACTS and neither depends on another section's output,
// so it doesn't need its own tier round.
const SEO_TIERS: SeoSection[][] = [
  ["critical", "high_impact", "significant", "geo_layer"],
  ["moderate"],
  ["negligible"],
];

const SEO_SECTION_FILE_MAP: Record<SeoSection, string> = {
  critical: "websiteAgents/SeoGeneration.critical",
  high_impact: "websiteAgents/SeoGeneration.high-impact",
  significant: "websiteAgents/SeoGeneration.significant",
  moderate: "websiteAgents/SeoGeneration.moderate",
  negligible: "websiteAgents/SeoGeneration.negligible",
  geo_layer: "websiteAgents/SeoGeneration.geo-layer",
};

/**
 * Fallback VERIFIED PRACTICE FACTS block when the caller has no facts to
 * inject (e.g. callers that haven't been updated to pass one yet, or a page/
 * post with zero extracted facts). Spec requirement (T5): state explicitly
 * that nothing is sourced rather than silently falling back to BUSINESS DATA
 * only, so the model doesn't quietly treat the absence as license to invent.
 */
const DEFAULT_PRACTICE_FACTS_BLOCK = `VERIFIED PRACTICE FACTS:
No verified practice facts available — use only the service name and location from BUSINESS DATA; do not invent specifics.`;

// ---------------------------------------------------------------------------
// Prompt builders
// ---------------------------------------------------------------------------

/**
 * Split the system prompt into a stable, cacheable prefix (base rules +
 * VERIFIED PRACTICE FACTS + business data + creator context — identical
 * across every section of this page, and across every page in the same
 * bulk-generate job) and the per-section instructions, which vary every call
 * and must stay outside the cached block.
 *
 * VERIFIED PRACTICE FACTS is rendered ahead of the raw BUSINESS DATA blob so
 * the model sees source-traceable facts first; when no facts exist the block
 * still appears, explicitly instructing the model not to invent specifics
 * (T5 — never silently degrade to "BUSINESS DATA only" without saying so).
 */
function buildSystemPromptParts(
  section: SeoSection,
  businessData: Record<string, unknown>,
  creatorContext: string,
  practiceFactsBlock: string,
): { cachedPrefix: string; sectionPrompt: string } {
  const base = loadPrompt("websiteAgents/SeoGeneration");
  const sectionInstructions = loadPrompt(SEO_SECTION_FILE_MAP[section]);

  const cachedPrefix = `${base}

${practiceFactsBlock}

BUSINESS DATA:
${JSON.stringify(businessData, null, 2)}

${creatorContext ? `SEO GENERATION CRITERIA (from CroSEO mind):\n${creatorContext}\n` : ""}`;

  return { cachedPrefix, sectionPrompt: sectionInstructions };
}

function buildUserPrompt(
  section: SeoSection,
  data: SeoSectionRunData & { entityType: "page" | "post" },
  gscTopQueries: GscTopQuery[] = [],
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

  if (section === "geo_layer") {
    const gscDemandBlock = buildGscDemandUserBlock(gscTopQueries);
    if (gscDemandBlock) prompt += `\n${gscDemandBlock}\n`;
  }

  prompt += `\nGenerate the SEO data for the "${section}" section. Return ONLY valid JSON.`;

  return prompt;
}

function parseGeneratedSeo(text: string, section: SeoSection): Record<string, unknown> {
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

function costContextFor(
  stage: "generate" | "insight",
  section: SeoSection,
  entityType: "page" | "post",
  pagePath: string | undefined,
  projectId: string | undefined,
  entityId: string | undefined
): CostContext | undefined {
  if (!projectId) return undefined;
  return {
    projectId,
    eventType: "seo-generation",
    metadata: {
      section,
      entity_type: entityType,
      entity_id: entityId || null,
      page_path: pagePath || null,
      stage,
    },
  };
}

// ---------------------------------------------------------------------------
// Single-section generate (no insight) — building block for both the
// single-section path and the tiered "generate all" path.
// ---------------------------------------------------------------------------

async function runGenerateOnly(
  section: SeoSection,
  entityType: "page" | "post",
  businessData: Record<string, unknown>,
  creatorContext: string,
  data: SeoSectionRunData,
  projectId?: string,
  entityId?: string,
  practiceFactsBlock: string = DEFAULT_PRACTICE_FACTS_BLOCK,
  gscTopQueries: GscTopQuery[] = []
): Promise<{ section: string; generated: Record<string, unknown> }> {
  const { cachedPrefix, sectionPrompt } = buildSystemPromptParts(
    section,
    businessData,
    creatorContext,
    practiceFactsBlock,
  );
  const userPrompt = buildUserPrompt(
    section,
    { ...data, entityType },
    gscTopQueries,
  );

  const result = await runAgent({
    systemPrompt: sectionPrompt,
    cachedSystemBlocks: [cachedPrefix],
    userMessage: userPrompt,
    model: MODEL,
    maxTokens: MAX_TOKENS,
    effort: SEO_EFFORT,
    costContext: costContextFor("generate", section, entityType, data.page_path, projectId, entityId),
  });

  const generated = result.parsed || parseGeneratedSeo(result.raw, section);
  return { section, generated };
}

// ---------------------------------------------------------------------------
// Insight generation (never gates progression to the next tier/section)
// ---------------------------------------------------------------------------

async function generateInsight(
  section: SeoSection,
  generated: Record<string, unknown>,
  businessData: Record<string, unknown>,
  validatorContext: string,
  pagePath: string | undefined,
  postTitle: string | undefined,
  entityType: "page" | "post",
  projectId?: string,
  entityId?: string
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
      // Whole system prompt is stable per page (varies only by businessData/
      // validatorContext, not per section) — cache it as a single block.
      cachedSystemBlocks: [],
      userMessage: userPrompt,
      model: MODEL,
      maxTokens: 256,
      effort: SEO_EFFORT,
      costContext: costContextFor("insight", section, entityType, pagePath, projectId, entityId),
    });

    const parsed = result.parsed || parseGeneratedSeo(result.raw, section);
    return (parsed.insight as string) || "";
  } catch (err) {
    logger.warn({ err: err }, "[SEO] Failed to generate insight:");
    return "";
  }
}

// ---------------------------------------------------------------------------
// Public: single-section generate + insight (sequential — nothing to
// parallelize for one section). Used by the single-section generate flow.
// ---------------------------------------------------------------------------

export async function runGenerateSection(
  section: SeoSection,
  entityType: "page" | "post",
  businessData: Record<string, unknown>,
  creatorContext: string,
  validatorContext: string,
  data: SeoSectionRunData,
  projectId?: string,
  entityId?: string,
  practiceFactsBlock: string = DEFAULT_PRACTICE_FACTS_BLOCK,
  gscTopQueries: GscTopQuery[] = []
): Promise<SeoSectionResult> {
  const { generated } = await runGenerateOnly(
    section,
    entityType,
    businessData,
    creatorContext,
    data,
    projectId,
    entityId,
    practiceFactsBlock,
    gscTopQueries
  );

  const insight = await generateInsight(
    section,
    generated,
    businessData,
    validatorContext,
    data.page_path,
    data.post_title,
    entityType,
    projectId,
    entityId
  );

  return { section, generated, insight };
}

// ---------------------------------------------------------------------------
// Public: tiered "generate all" — 3 rounds instead of 5, insight decoupled
// from the blocking chain. Used by both the single-entity "Generate All"
// flow and the bulk-generate worker.
// ---------------------------------------------------------------------------

export async function runAllSeoSectionsTiered(
  entityType: "page" | "post",
  businessData: Record<string, unknown>,
  creatorContext: string,
  validatorContext: string,
  data: SeoSectionRunData,
  projectId?: string,
  entityId?: string,
  practiceFactsBlock: string = DEFAULT_PRACTICE_FACTS_BLOCK,
  gscTopQueries: GscTopQuery[] = []
): Promise<SeoSectionResult[]> {
  let accumulated = { ...(data.existing_seo_data || {}) };
  const results: SeoSectionResult[] = [];
  const insightPromises: Promise<{ section: string; insight: string }>[] = [];

  for (const tier of SEO_TIERS) {
    const tierResults = await Promise.all(
      tier.map((section) =>
        runGenerateOnly(section, entityType, businessData, creatorContext, { ...data, existing_seo_data: accumulated }, projectId, entityId, practiceFactsBlock, gscTopQueries)
      )
    );

    for (const { section, generated } of tierResults) {
      accumulated = { ...accumulated, ...generated };
      results.push({ section, generated, insight: "" });
      insightPromises.push(
        generateInsight(
          section as SeoSection,
          generated,
          businessData,
          validatorContext,
          data.page_path,
          data.post_title,
          entityType,
          projectId,
          entityId
        ).then((insight) => ({ section, insight }))
      );
    }
  }

  const insights = await Promise.all(insightPromises);
  const insightBySection = new Map(insights.map((i) => [i.section, i.insight]));
  for (const r of results) {
    r.insight = insightBySection.get(r.section) || "";
  }

  return results;
}
