/**
 * Website Generation Pipeline Service
 *
 * Replaces the n8n Website Builder Workflow with a backend-native pipeline.
 * Two main flows:
 *   1. scrapeAndCacheProject — project-level data collection (Apify + website scrape + image analysis)
 *   2. generatePageComponents — per-page HTML generation (component-by-component via Claude)
 *
 * All LLM calls go through service.llm-runner.ts (Claude Sonnet).
 * All scraping reuses existing services (no HTTP round-trips to own endpoints).
 */

import { db } from "../../../database/connection";
import {
  runWithTools,
  type ToolSchema,
  type ToolCall,
  type CostContext,
} from "../../../agents/service.llm-runner";
import { loadPrompt } from "../../../agents/service.prompt-loader";
import { scrapeWebsite } from "./service.website-scraper";
import { normalizeSections } from "../feature-utils/util.section-normalizer";
import { scrapeGbp } from "../feature-utils/util.gbp-scraper";
import {
  processImages as processImagesShared,
  collectImageUrls as collectImageUrlsShared,
} from "../feature-utils/util.image-processor";
import { normalizeComponentHtml } from "../feature-utils/util.html-normalizer";
import {
  buildStableIdentityContext,
  buildComponentContext,
  resolveImageUrl,
  type ProjectIdentity,
} from "../feature-utils/util.identity-context";
import { hasUsableIdentityForPageGeneration } from "../feature-utils/util.project-identity";
import { ProjectIdentityModel } from "../../../models/website-builder/ProjectIdentityModel";
import logger from "../../../lib/logger";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PROJECTS_TABLE = "website_builder.projects";
const PAGES_TABLE = "website_builder.pages";
const TEMPLATES_TABLE = "website_builder.templates";
const TEMPLATE_PAGES_TABLE = "website_builder.template_pages";

const LOG_PREFIX = "[GenPipeline]";
function log(msg: string, data?: Record<string, unknown>): void {
  logger.info({ detail: data ? JSON.stringify(data) : "" }, `${LOG_PREFIX} ${msg}`);
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ScrapeParams {
  placeId: string;
  practiceSearchString?: string;
  websiteUrl?: string;
  scrapedData?: string | null;
}

export interface GenerateParams {
  primaryColor?: string;
  accentColor?: string;
  pageContext?: string;
  businessName?: string;
  formattedAddress?: string;
  city?: string;
  state?: string;
  phone?: string;
  category?: string;
  rating?: number;
  reviewCount?: number;
  // Page Creation Enhancements (Plan B)
  gradientEnabled?: boolean;
  gradientFrom?: string;
  gradientTo?: string;
  gradientDirection?: string;
  dynamicSlotValues?: Record<string, string>;
}

// ---------------------------------------------------------------------------
// 1. PROJECT-LEVEL SCRAPE & CACHE
// ---------------------------------------------------------------------------

/**
 * Scrape GBP + website + images and cache results on the project row.
 * This runs ONCE per project, and the cached data is reused by all page generations.
 */
export async function scrapeAndCacheProject(
  projectId: string,
  params: ScrapeParams,
  signal?: AbortSignal,
): Promise<void> {
  const { placeId, practiceSearchString, websiteUrl, scrapedData } = params;

  // --- Step 1: GBP Scrape via Apify ---
  log("Step 1: GBP scrape", { projectId, placeId });
  checkCancel(signal);

  let gbpData: any = null;
  try {
    gbpData = await scrapeGbp(placeId, practiceSearchString, signal);
  } catch (err: any) {
    log("GBP scrape failed, continuing without", { error: err.message });
  }

  await db(PROJECTS_TABLE).where("id", projectId).update({
    step_gbp_scrape: gbpData ? JSON.stringify(gbpData) : null,
    status: "GBP_SCRAPED",
    updated_at: db.fn.now(),
  });

  checkCancel(signal);

  // --- Step 2: Website Scrape ---
  log("Step 2: Website scrape", { projectId, websiteUrl });

  let websiteScrapeData: any = null;
  if (scrapedData) {
    // Pre-scraped data provided — use it directly
    websiteScrapeData = { content: scrapedData };
    log("Using pre-scraped data");
  } else if (websiteUrl) {
    try {
      const scrapeResult = await scrapeWebsite(websiteUrl, undefined);
      if (scrapeResult.result) {
        websiteScrapeData = scrapeResult.result;
      }
    } catch (err: any) {
      log("Website scrape failed, continuing without", { error: err.message });
    }
  }

  await db(PROJECTS_TABLE).where("id", projectId).update({
    step_website_scrape: websiteScrapeData
      ? JSON.stringify(websiteScrapeData)
      : null,
    status: "WEBSITE_SCRAPED",
    updated_at: db.fn.now(),
  });

  checkCancel(signal);

  // --- Step 3: Image Collection, S3 Upload, Analysis ---
  log("Step 3: Image collection + analysis", { projectId });

  const imageUrls = collectImageUrlsShared(gbpData, websiteScrapeData);
  let imageAnalysis: any[] = [];

  if (imageUrls.length > 0) {
    imageAnalysis = await processImagesShared(projectId, imageUrls, signal);
  }

  await db(PROJECTS_TABLE).where("id", projectId).update({
    step_image_analysis: JSON.stringify({ images: imageAnalysis }),
    status: "IMAGES_ANALYZED",
    updated_at: db.fn.now(),
  });

  log("Project scrape complete", {
    projectId,
    gbp: !!gbpData,
    website: !!websiteScrapeData,
    images: imageAnalysis.length,
  });
}

// ---------------------------------------------------------------------------
// 2. PER-PAGE COMPONENT GENERATION
// ---------------------------------------------------------------------------

/**
 * Generate HTML for a single page, section by section.
 *
 * Architecture:
 *  - Reads project_identity through ProjectIdentityModel
 *  - Gates on layouts being generated (refuses if project has no wrapper yet)
 *  - Sections only — wrapper/header/footer are owned by the Layouts pipeline
 *  - Per-component context derivation (~1-3kb per call instead of full identity)
 *  - Prompt caching on stable system prompt + identity context
 *  - `select_image` tool calling (eliminates image URL hallucination)
 *  - `report_critique` second pass per component (regenerates once if fails)
 *
 * On the singleComponent option — used by per-component regenerate from the editor.
 */
export async function generatePageComponents(
  pageId: string,
  projectId: string,
  generateParams: GenerateParams & {
    singleComponent?: string;
    regenerateInstruction?: string;
  },
  signal?: AbortSignal,
): Promise<void> {
  await db(PAGES_TABLE).where("id", pageId).update({
    generation_status: "generating",
    updated_at: db.fn.now(),
  });

  const project = await db(PROJECTS_TABLE).where("id", projectId).first();
  if (!project) throw new Error(`Project ${projectId} not found`);

  const page = await db(PAGES_TABLE).where("id", pageId).first();
  if (!page) throw new Error(`Page ${pageId} not found`);

  // Gate: refuse if layouts haven't been generated yet
  const hasLayouts =
    !!project.layouts_generated_at ||
    (project.wrapper && project.wrapper.length > 100);
  if (!hasLayouts) {
    await markPageFailed(pageId, "LAYOUTS_NOT_GENERATED");
    throw new Error("LAYOUTS_NOT_GENERATED");
  }

  const identity = await ProjectIdentityModel.findByProjectId<ProjectIdentity>(
    projectId,
  );

  if (!identity || !hasUsableIdentityForPageGeneration(identity)) {
    await markPageFailed(pageId, "IDENTITY_NOT_READY");
    throw new Error("IDENTITY_NOT_READY");
  }

  const template = project.template_id
    ? await db(TEMPLATES_TABLE).where("id", project.template_id).first()
    : null;
  const templatePage = page.template_page_id
    ? await db(TEMPLATE_PAGES_TABLE).where("id", page.template_page_id).first()
    : null;

  if (!template) {
    await markPageFailed(pageId, "No template found");
    return;
  }

  // Guard: single-component regen requires a linked template_page to
  // resolve the source section markup. Without it, buildComponentList
  // returns [] and the job would silently mark the page "ready" — the
  // editor shows no toast, no error, nothing regenerates. Fail loudly.
  if (generateParams.singleComponent && !templatePage) {
    await markPageFailed(
      pageId,
      "NO_TEMPLATE_PAGE: regenerate requires template_page_id; page is unlinked",
    );
    return;
  }

  const allComponents = buildComponentList(templatePage);
  const components = generateParams.singleComponent
    ? allComponents.filter((c) => c.name === generateParams.singleComponent)
    : allComponents;
  const totalComponents = components.length;

  if (totalComponents === 0) {
    log("No components to generate", { pageId, single: generateParams.singleComponent });
    await db(PAGES_TABLE).where("id", pageId).update({
      generation_status: "ready",
      generation_progress: null,
      updated_at: db.fn.now(),
    });
    return;
  }

  log("Generating components", { pageId, total: totalComponents });

  await db(PAGES_TABLE)
    .where("id", pageId)
    .update({
      generation_progress: JSON.stringify({
        total: totalComponents,
        completed: 0,
        current_component: components[0]?.name || "unknown",
      }),
      updated_at: db.fn.now(),
    });

  const generatorPrompt = loadPrompt("websiteAgents/builder/ComponentGenerator");
  const criticPrompt = loadPrompt("websiteAgents/builder/ComponentCritic");
  const stableContext = buildStableIdentityContext(identity);

  // Cost-tracking event type: differentiate a full build vs single-component regen.
  const generateEventType = generateParams.singleComponent
    ? "section-regenerate"
    : "page-generate";

  // Keep existing sections for regenerate-single case
  const existingSections = normalizeSections(page.sections);
  const generatedSections: Array<{ name: string; content: string }> = generateParams.singleComponent
    ? existingSections.map((s: any) => ({ name: s.name, content: s.content }))
    : [];

  for (let i = 0; i < components.length; i++) {
    checkCancel(signal);

    const component = components[i];
    log(`Generating: ${component.name} (${i + 1}/${totalComponents})`, { pageId });

    await db(PAGES_TABLE)
      .where("id", pageId)
      .update({
        generation_progress: JSON.stringify({
          total: totalComponents,
          completed: i,
          current_component: component.name,
        }),
        updated_at: db.fn.now(),
      });

    const ctx = buildComponentContext(
      identity,
      component,
      generateParams.dynamicSlotValues,
      generateParams.pageContext,
    );

    // If every slot in this component was set to __skip__ and the template body
    // is empty after stripping, there's nothing left to generate — omit the
    // whole section from the page without spending an LLM call.
    if (ctx.skipGeneration) {
      log(`Skipping component (all slots skipped, body empty): ${component.name}`, {
        pageId,
        stripped: ctx.strippedSlotGroups,
      });
      continue;
    }

    // Optional regenerate instruction for per-component regen
    const userMessageWithInstruction = generateParams.regenerateInstruction
      ? `${ctx.variableUserMessage}\n\n## ADMIN INSTRUCTION FOR REGENERATION\n${generateParams.regenerateInstruction}`
      : ctx.variableUserMessage;

    const componentCostContext: CostContext = {
      projectId,
      eventType: generateEventType,
      metadata: {
        page_id: pageId,
        component_name: component.name,
      },
    };

    let html: string | null = null;
    try {
      html = await generateSingleComponent(
        identity,
        generatorPrompt,
        stableContext,
        userMessageWithInstruction,
        signal,
        componentCostContext,
      );
    } catch (err: any) {
      log(`Component generation failed: ${component.name}`, { error: err.message });
    }

    // Deterministic normalizer: strip LLM-emitted inline styles, convert
    // badge-shaped anchors to <span>, and collapse mixed button radii.
    // Runs before the critic so the critic evaluates the cleaned HTML.
    if (html) {
      const { html: normalized, report } = normalizeComponentHtml(html);
      if (
        report.inlineStylesStripped > 0 ||
        report.badgeAnchorsConverted > 0 ||
        report.buttonRadiiRewritten > 0
      ) {
        log(`Normalizer cleaned ${component.name}`, report as any);
      }
      html = normalized;
    }

    // Critique pass
    if (html) {
      const critique = await runCritique(
        identity,
        criticPrompt,
        component.name,
        html,
        {
          projectId,
          eventType: "critic",
          metadata: { page_id: pageId, component_name: component.name },
        },
      ).catch(() => null);

      if (critique && !critique.pass) {
        log(`Critique failed for ${component.name}, regenerating once`, {
          issues: critique.issues,
        });
        try {
          const retryMessage = `${userMessageWithInstruction}\n\n## PREVIOUS ATTEMPT HAD ISSUES\n${critique.issues.join("\n- ")}\n\nRegenerate addressing each issue.`;
          const retryHtml = await generateSingleComponent(
            identity,
            generatorPrompt,
            stableContext,
            retryMessage,
            signal,
            {
              ...componentCostContext,
              metadata: {
                ...(componentCostContext.metadata || {}),
                retry: true,
              },
            },
          );
          if (retryHtml) html = retryHtml;
        } catch (err: any) {
          log(`Regenerate after critique failed: ${component.name}`, {
            error: err.message,
          });
        }
      }
    }

    if (!html) {
      log(`Skipping component (no HTML): ${component.name}`);
      continue;
    }

    // Merge into sections (replace by name if singleComponent, else append)
    if (generateParams.singleComponent) {
      const idx = generatedSections.findIndex((s) => s.name === component.name);
      if (idx >= 0) {
        generatedSections[idx] = { name: component.name, content: html };
      } else {
        generatedSections.push({ name: component.name, content: html });
      }
    } else {
      generatedSections.push({ name: component.name, content: html });
    }

    await db(PAGES_TABLE)
      .where("id", pageId)
      .update({
        sections: JSON.stringify({ sections: generatedSections }),
        generation_progress: JSON.stringify({
          total: totalComponents,
          completed: i + 1,
          current_component:
            i + 1 < totalComponents ? components[i + 1].name : "done",
        }),
        updated_at: db.fn.now(),
      });
  }

  // Whole-page critic — one LLM pass over the concatenated HTML, checking
  // cross-section consistency. Soft gate: logs verdict, does not block
  // publish.
  try {
    const wholePageHtml = generatedSections.map((s) => s.content).join("\n");
    const wholePageVerdict = await runWholePageCritique(
      identity,
      wholePageHtml,
      page.name || page.path || "page",
      {
        projectId,
        eventType: "whole_page_critic",
        metadata: { page_id: pageId },
      },
    );
    if (wholePageVerdict) {
      if (wholePageVerdict.pass) {
        log("Whole-page critic passed", { pageId });
      } else {
        log("Whole-page critic flagged issues", {
          pageId,
          issues: wholePageVerdict.issues,
          suggestions: wholePageVerdict.suggested_improvements,
        });
      }
    }
  } catch (err: any) {
    log("Whole-page critique threw", { error: err.message, pageId });
  }

  await db(PAGES_TABLE).where("id", pageId).update({
    generation_status: "ready",
    generation_progress: null,
    status: "published",
    updated_at: db.fn.now(),
  });

  const isHomepage = page.path === "/";
  if (isHomepage) {
    await db(PROJECTS_TABLE).where("id", projectId).update({
      status: "LIVE",
      updated_at: db.fn.now(),
    });
  }

  log("Page generation complete", { pageId });
}

// ---------------------------------------------------------------------------
// COMPONENT GENERATION (single call with select_image tool loop)
// ---------------------------------------------------------------------------

const SELECT_IMAGE_TOOL: ToolSchema = {
  name: "select_image",
  description:
    "Retrieve the actual S3 URL for an image by its manifest id (e.g., 'img-0'). Call this when you need an image for the section you're generating. Returns the hosted URL and description.",
  input_schema: {
    type: "object",
    properties: {
      image_id: {
        type: "string",
        description: "The manifest id of the image (e.g., 'img-0') from the Available Images list",
      },
    },
    required: ["image_id"],
  },
};

async function generateSingleComponent(
  identity: ProjectIdentity,
  generatorPrompt: string,
  stableContext: string,
  userMessage: string,
  signal?: AbortSignal,
  costContext?: CostContext,
): Promise<string | null> {
  // Use runWithTools so Claude can call select_image. Loop up to 3 times
  // for tool calls, then extract final HTML.
  const messages: any[] = [{ role: "user", content: userMessage }];
  let toolIterations = 0;
  const maxIterations = 3;

  // Thread the root cost event id through all turns so tool-use follow-ups
  // roll up under the top-level call instead of appearing as siblings.
  let rootCostEventId: string | null = null;

  while (toolIterations < maxIterations) {
    checkCancel(signal);

    const turnCostContext: CostContext | undefined = costContext
      ? rootCostEventId
        ? {
            ...costContext,
            eventType: "select-image-tool",
            parentEventId: rootCostEventId,
            metadata: {
              ...(costContext.metadata || {}),
              tool_iteration: toolIterations,
            },
          }
        : costContext
      : undefined;

    const result = await runWithTools({
      systemPrompt: generatorPrompt,
      userMessage,
      messages,
      tools: [SELECT_IMAGE_TOOL],
      toolChoice: "auto",
      maxTokens: 16384,
      cachedSystemBlocks: [stableContext],
      costContext: turnCostContext,
    });

    if (rootCostEventId === null && result.costEventId) {
      rootCostEventId = result.costEventId;
    }

    if (result.toolCalls.length === 0) {
      // Claude finished — extract HTML from final text response
      return extractHtmlFromResponse(result.textResponse);
    }

    // Append assistant message and tool results to continue the conversation
    messages.push({ role: "assistant", content: result.assistantContent });
    const toolResultBlocks = result.toolCalls.map((call: ToolCall) => {
      if (call.name !== "select_image") {
        return {
          type: "tool_result",
          tool_use_id: call.id,
          content: JSON.stringify({ error: `Unknown tool: ${call.name}` }),
          is_error: true,
        };
      }
      const imageId = String(call.input.image_id || "");
      const resolved = resolveImageUrl(identity, imageId);
      if (!resolved) {
        return {
          type: "tool_result",
          tool_use_id: call.id,
          content: JSON.stringify({ error: `Image id not found: ${imageId}` }),
          is_error: true,
        };
      }
      return {
        type: "tool_result",
        tool_use_id: call.id,
        content: JSON.stringify({
          image_url: resolved.s3_url,
          description: resolved.description,
        }),
      };
    });
    messages.push({ role: "user", content: toolResultBlocks });

    toolIterations++;
  }

  // Max iterations reached — force a final call without tools
  log("select_image loop exhausted, finalizing without tools", {});
  messages.push({
    role: "user",
    content:
      "You've used the maximum image lookups. Now return the final component HTML as a JSON object with `{name, html}`. Do not call any more tools.",
  });
  try {
    const finalResult = await runWithTools({
      systemPrompt: generatorPrompt,
      userMessage,
      messages,
      tools: [],
      toolChoice: "auto",
      maxTokens: 16384,
      cachedSystemBlocks: [stableContext],
      costContext: costContext
        ? {
            ...costContext,
            eventType: "select-image-tool",
            parentEventId: rootCostEventId,
            metadata: {
              ...(costContext.metadata || {}),
              final_turn: true,
            },
          }
        : undefined,
    });
    return extractHtmlFromResponse(finalResult.textResponse);
  } catch {
    return null;
  }
}

function extractHtmlFromResponse(textResponse: string | null): string | null {
  if (!textResponse) return null;
  const trimmed = textResponse.trim();

  // Try JSON first
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed.html) return String(parsed.html);
    if (parsed.content) return String(parsed.content);
  } catch {
    // Try to extract JSON from markdown fences or prose
    const jsonMatch = trimmed.match(/\{[\s\S]*"html"[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.html) return String(parsed.html);
      } catch {
        /* fall through */
      }
    }
  }

  // Fallback: raw HTML
  if (trimmed.startsWith("<") && trimmed.includes("</")) return trimmed;
  return null;
}

// ---------------------------------------------------------------------------
// CRITIQUE PASS
// ---------------------------------------------------------------------------

const REPORT_CRITIQUE_TOOL: ToolSchema = {
  name: "report_critique",
  description:
    "Report the result of reviewing a generated HTML section. Must be called exactly once.",
  input_schema: {
    type: "object",
    properties: {
      pass: {
        type: "boolean",
        description:
          "true if the section is production-ready; false if it needs regeneration.",
      },
      issues: {
        type: "array",
        items: { type: "string" },
        description:
          "List of specific problems found. Empty array if pass=true.",
      },
      suggested_improvements: {
        type: "string",
        description:
          "Brief guidance for the regeneration (empty string if pass=true).",
      },
    },
    required: ["pass", "issues", "suggested_improvements"],
  },
};

async function runCritique(
  identity: ProjectIdentity,
  criticPrompt: string,
  componentName: string,
  html: string,
  costContext?: CostContext,
): Promise<{ pass: boolean; issues: string[]; suggested_improvements: string } | null> {
  const archetype = identity.voice_and_tone?.archetype || "family-friendly";
  const tone = identity.voice_and_tone?.tone_descriptor || "professional";
  const businessName = identity.business?.name || "the practice";

  const stableContext = [
    `## PRACTICE CONTEXT`,
    `Business: ${businessName}`,
    `Archetype: ${archetype}`,
    `Tone: ${tone}`,
  ].join("\n");

  const userMessage = `## COMPONENT: ${componentName}\n\n## GENERATED HTML\n\`\`\`html\n${html}\n\`\`\`\n\nReview this HTML and call the report_critique tool with your findings.`;

  try {
    const result = await runWithTools({
      systemPrompt: criticPrompt,
      userMessage,
      tools: [REPORT_CRITIQUE_TOOL],
      toolChoice: { type: "tool", name: "report_critique" },
      maxTokens: 1024,
      cachedSystemBlocks: [stableContext],
      costContext,
    });
    const call = result.toolCalls.find((c) => c.name === "report_critique");
    if (!call) return null;
    return {
      pass: !!call.input.pass,
      issues: Array.isArray(call.input.issues)
        ? (call.input.issues as string[])
        : [],
      suggested_improvements: String(call.input.suggested_improvements || ""),
    };
  } catch (err: any) {
    log("Critique call failed", { error: err.message });
    return null;
  }
}

/**
 * Whole-page critique — one LLM call over the concatenated page HTML,
 * evaluating cross-section consistency (button shape uniformity, border
 * weight, shortcode coverage, duplicate CTAs, inline styles). Soft gate:
 * logs issues but does not block publish.
 */
async function runWholePageCritique(
  identity: ProjectIdentity,
  wholePageHtml: string,
  pageName: string,
  costContext?: CostContext,
): Promise<{ pass: boolean; issues: string[]; suggested_improvements: string } | null> {
  if (!wholePageHtml || wholePageHtml.trim().length === 0) return null;

  const wholePagePrompt = loadPrompt("websiteAgents/builder/WholePageCritic");
  const archetype = identity.voice_and_tone?.archetype || "family-friendly";
  const tone = identity.voice_and_tone?.tone_descriptor || "professional";
  const businessName = identity.business?.name || "the practice";

  const stableContext = [
    `## PRACTICE CONTEXT`,
    `Business: ${businessName}`,
    `Archetype: ${archetype}`,
    `Tone: ${tone}`,
  ].join("\n");

  const userMessage = `## PAGE: ${pageName}\n\n## FULL PAGE HTML\n\`\`\`html\n${wholePageHtml}\n\`\`\`\n\nReview this entire page for cross-section consistency and call the report_critique tool with your findings.`;

  try {
    const result = await runWithTools({
      systemPrompt: wholePagePrompt,
      userMessage,
      tools: [REPORT_CRITIQUE_TOOL],
      toolChoice: { type: "tool", name: "report_critique" },
      maxTokens: 1024,
      cachedSystemBlocks: [stableContext],
      costContext,
    });
    const call = result.toolCalls.find((c) => c.name === "report_critique");
    if (!call) return null;
    return {
      pass: !!call.input.pass,
      issues: Array.isArray(call.input.issues)
        ? (call.input.issues as string[])
        : [],
      suggested_improvements: String(call.input.suggested_improvements || ""),
    };
  } catch (err: any) {
    log("Whole-page critique call failed", { error: err.message });
    return null;
  }
}

// ---------------------------------------------------------------------------
// 3. CANCEL
// ---------------------------------------------------------------------------

/**
 * Cancel all in-progress generation for a project.
 * Sets the cancel flag and marks all queued/generating pages as cancelled.
 */
export async function cancelProjectGeneration(
  projectId: string,
): Promise<{ cancelledPages: number }> {
  log("Cancelling generation", { projectId });

  await db(PROJECTS_TABLE).where("id", projectId).update({
    generation_cancel_requested: true,
    updated_at: db.fn.now(),
  });

  const updated = await db(PAGES_TABLE)
    .where("project_id", projectId)
    .whereIn("generation_status", ["queued", "generating"])
    .update({
      generation_status: "cancelled",
      generation_progress: null,
      updated_at: db.fn.now(),
    });

  return { cancelledPages: updated };
}

/**
 * Check if cancellation was requested. Resets flag after reading.
 */
export async function isCancelled(projectId: string): Promise<boolean> {
  const project = await db(PROJECTS_TABLE)
    .where("id", projectId)
    .select("generation_cancel_requested")
    .first();
  return project?.generation_cancel_requested === true;
}

/**
 * Reset the cancel flag (called at the start of a new generation run).
 */
export async function resetCancelFlag(projectId: string): Promise<void> {
  await db(PROJECTS_TABLE).where("id", projectId).update({
    generation_cancel_requested: false,
    updated_at: db.fn.now(),
  });
}

// ---------------------------------------------------------------------------
// INTERNAL HELPERS
// ---------------------------------------------------------------------------

function checkCancel(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new Error("Generation cancelled");
  }
}

async function markPageFailed(pageId: string, reason: string): Promise<void> {
  log(`Page failed: ${reason}`, { pageId });
  await db(PAGES_TABLE).where("id", pageId).update({
    generation_status: "failed",
    generation_progress: null,
    updated_at: db.fn.now(),
  });
}

// GBP scrape, image collection, and image analysis live in shared utils
// (util.gbp-scraper.ts + util.image-processor.ts) so both this pipeline
// and the identity warmup pipeline can reuse them.

// ---------------------------------------------------------------------------
// COMPONENT BUILDING
// ---------------------------------------------------------------------------

interface ComponentDef {
  name: string;
  type: "section";
  templateMarkup: string;
}

/**
 * Page pipeline only generates sections. Wrapper/header/footer are owned by
 * the Layouts pipeline (service.layouts-pipeline.ts).
 */
function buildComponentList(templatePage: any): ComponentDef[] {
  const sections = normalizeSections(templatePage?.sections);
  return sections.map((section: any, idx: number) => ({
    name: section.name || `section-${idx}`,
    type: "section" as const,
    templateMarkup: section.content || "",
  }));
}
