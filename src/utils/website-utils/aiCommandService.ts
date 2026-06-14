/**
 * AI Command Service
 * Handles LLM-powered batch analysis and execution for the AI Command feature.
 * Uses Claude Sonnet for both analysis (recommendations) and execution (HTML editing).
 *
 * Direct SDK calls — instrumented manually via `safeLogAiCostEvent`. Each
 * public function accepts an optional `costContext` carrying the project id
 * and metadata; when omitted, no cost row is written.
 *
 * TODO (deferred — not in this MVP pass):
 *   - Apify, Puppeteer, OpenAI embeddings, Google Places.
 *   - See `src/services/ai-cost/pricing.ts`.
 */

import Anthropic from "@anthropic-ai/sdk";
import { loadPrompt } from "../../agents/service.prompt-loader";
import { safeLogAiCostEvent } from "../../services/ai-cost/service.ai-cost";
import logger from "../../lib/logger";

const MODEL = "claude-sonnet-4-6";

/** Optional cost-accounting context passed by callers that have a project. */
export interface AiCommandCostContext {
  projectId: string;
  eventType?: string;
  metadata?: Record<string, unknown>;
}

/** Internal helper — logs one row per Anthropic response. Never throws. */
async function logAnthropicCost(
  ctx: AiCommandCostContext | undefined,
  defaultEventType: string,
  response: { model?: string; usage?: { input_tokens?: number; output_tokens?: number } },
  extraMetadata?: Record<string, unknown>,
): Promise<void> {
  if (!ctx?.projectId) return;
  await safeLogAiCostEvent({
    projectId: ctx.projectId,
    eventType: ctx.eventType || defaultEventType,
    vendor: "anthropic",
    model: response.model || MODEL,
    usage: {
      input_tokens: response.usage?.input_tokens ?? 0,
      output_tokens: response.usage?.output_tokens ?? 0,
    },
    metadata: { ...(ctx.metadata || {}), ...(extraMetadata || {}) },
  });
}

// Load prompts from .md files (cached after first read)
const getAnalysisPrompt = () => loadPrompt("websiteAgents/aiCommand/Analysis");
const getStructuralPrompt = () => loadPrompt("websiteAgents/aiCommand/Structural");
const getExecutionPrompt = () => loadPrompt("websiteAgents/aiCommand/Execution");
const getSectionPlannerPrompt = () => loadPrompt("websiteAgents/aiCommand/SectionPlanner");
const getSectionGeneratorPrompt = () => loadPrompt("websiteAgents/aiCommand/SectionGenerator");
const getVisualAnalysisPrompt = () => loadPrompt("websiteAgents/aiCommand/VisualAnalysis");
const getPostContentPrompt = () => loadPrompt("websiteAgents/aiCommand/PostContent");

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error("ANTHROPIC_API_KEY environment variable is not set");
    }
    client = new Anthropic({ apiKey });
  }
  return client;
}

// ---------------------------------------------------------------------------
// Analysis — produce structured recommendations from content + prompt
// ---------------------------------------------------------------------------

export interface AnalysisResult {
  recommendations: Array<{
    recommendation: string;
    instruction: string;
  }>;
  inputTokens: number;
  outputTokens: number;
}

export async function analyzeHtmlContent(params: {
  prompt: string;
  targetLabel: string;
  currentHtml: string;
  costContext?: AiCommandCostContext;
}): Promise<AnalysisResult> {
  const { prompt, targetLabel, currentHtml, costContext } = params;
  const ai = getClient();

  // Condense prompt for small sections to save tokens
  const condensedPrompt = currentHtml.length < 3000 && prompt.length > 4000
    ? prompt.substring(0, 3000) + "\n\n[... checklist truncated for this section — focus on what's relevant to the HTML below ...]"
    : prompt;

  const userMessage = `## Requirements / Checklist

${condensedPrompt}

## Target: ${targetLabel}

## Current HTML

${currentHtml}`;

  const messages: Array<{ role: "user" | "assistant"; content: string }> = [
    { role: "user", content: userMessage },
  ];

  logger.info(
    `[AiCommand] Analyzing: ${targetLabel} (${currentHtml.length} chars)`
  );

  let response = await ai.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: getAnalysisPrompt(),
    messages,
  });
  await logAnthropicCost(costContext, "ai-command", response, {
    stage: "analyze",
    target_label: targetLabel,
  });

  let text = extractText(response);
  let parsed = tryParseJson(text);

  // Retry once on parse failure
  if (!parsed) {
    logger.warn(
      `[AiCommand] Parse failed for ${targetLabel}, retrying...`
    );
    messages.push({ role: "assistant", content: text });
    messages.push({
      role: "user",
      content:
        "Your previous response was not valid JSON. Respond ONLY with the JSON object, no markdown fences or extra text.",
    });

    response = await ai.messages.create({
      model: MODEL,
      max_tokens: 4096,
      system: getAnalysisPrompt(),
      messages,
    });
    await logAnthropicCost(costContext, "ai-command", response, {
      stage: "analyze-retry",
      target_label: targetLabel,
    });

    text = extractText(response);
    parsed = tryParseJson(text);
  }

  if (!parsed) {
    logger.error({ err: text.substring(0, 200) }, `[AiCommand] Failed to parse analysis for ${targetLabel}:`);
    throw new Error(
      `LLM returned invalid JSON for analysis of ${targetLabel}`
    );
  }

  const NO_CHANGE_PATTERNS = /no change|no action|not applicable|no modification|nothing to change|no update|cannot be made|not needed/i;

  const recommendations = Array.isArray(parsed.recommendations)
    ? parsed.recommendations.filter(
        (r: any) =>
          r &&
          typeof r.recommendation === "string" &&
          typeof r.instruction === "string" &&
          !NO_CHANGE_PATTERNS.test(r.instruction) &&
          !NO_CHANGE_PATTERNS.test(r.recommendation)
      )
    : [];

  if (recommendations.length === 0) {
    logger.info(
      `[AiCommand] ⚠ ${targetLabel}: 0 recommendations. Raw response: ${text.substring(0, 500)}`
    );
    logger.info(
      `[AiCommand] ⚠ Prompt length: ${prompt.length} chars, HTML length: ${currentHtml.length} chars`
    );
  } else {
    logger.info(
      `[AiCommand] ✓ ${targetLabel}: ${recommendations.length} recommendation(s). Tokens: ${response.usage.input_tokens}/${response.usage.output_tokens}`
    );
  }

  return {
    recommendations,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
}

// ---------------------------------------------------------------------------
// Structural analysis — detect needed pages, posts, redirects
// ---------------------------------------------------------------------------

// Structural prompt loaded from websiteAgents/aiCommand/Structural.md

export interface MenuChangeRecommendation {
  menu_slug: string;
  action: "add" | "remove" | "update";
  label: string;
  url?: string;
  target?: string;
  original_label?: string;
  parent_id?: string | null;
  recommendation: string;
}

export interface NewMenuRecommendation {
  name: string;
  slug: string;
  recommendation: string;
}

export interface StructuralAnalysisResult {
  redirects: Array<{ from_path: string; to_path: string; type?: number; recommendation: string }>;
  deleteRedirects: Array<{ from_path: string; recommendation: string }>;
  pages: Array<{ path: string; purpose: string; recommendation: string }>;
  posts: Array<{ post_type_slug: string; title: string; slug: string; purpose: string; recommendation: string }>;
  menuChanges: MenuChangeRecommendation[];
  newMenus: NewMenuRecommendation[];
}

export async function analyzeForStructuralChanges(params: {
  prompt: string;
  existingPaths: string[];
  existingRedirects: string[];
  existingPostSlugs: string[];
  postTypes: string[];
  existingMenus: Array<{ menu_slug: string; items: Array<{ label: string; url: string }> }>;
  costContext?: AiCommandCostContext;
}): Promise<StructuralAnalysisResult> {
  const { prompt, existingPaths, existingRedirects, existingPostSlugs, postTypes, existingMenus, costContext } = params;

  logger.info(`[AiCommand] Analyzing structural changes (3 parallel focused calls)...`);

  // Run three focused calls in parallel — each only outputs one type
  const [redirectsResult, contentResult, menusResult] = await Promise.allSettled([
    analyzeStructuralFocused(prompt, "redirects", {
      context: `## Existing Pages\n${existingPaths.join("\n") || "(none)"}\n\n## Existing Redirects\n${existingRedirects.join("\n") || "(none)"}`,
      responseFormat: `{ "redirects": [{ "from_path": "/old", "to_path": "/new", "type": 301, "recommendation": "reason" }], "deleteRedirects": [{ "from_path": "/duplicate", "recommendation": "reason to delete" }] }`,
      instruction: "Identify URL redirects needed AND existing redirects that should be deleted (duplicates, obsolete, pointing to non-existent targets). Check every old URL mentioned in the checklist. Do NOT include pages, posts, or menu changes.",
    }, costContext),
    analyzeStructuralFocused(prompt, "content", {
      context: `## Existing Pages\n${existingPaths.join("\n") || "(none)"}\n\n## Existing Posts\n${existingPostSlugs.join("\n") || "(none)"}\n\n## Available Post Types\n${postTypes.join("\n") || "(none)"}`,
      responseFormat: `{ "pages": [{ "path": "/pricing", "purpose": "description", "recommendation": "reason" }], "posts": [{ "post_type_slug": "services", "title": "Name", "slug": "slug", "purpose": "description", "recommendation": "Create as 'services' post because..." }] }`,
      instruction: "Identify ONLY new pages and posts to create. For EACH missing item in the checklist, create a separate entry. Posts go to the matching post_type. Pages are for standalone content. Be thorough — process EVERY item in the checklist that needs creation. This includes service posts, doctor posts, patient education posts, blog posts, and any other content type mentioned. If the checklist says 'create as post' or mentions a post type, it MUST be a create_post entry.",
    }, costContext),
    analyzeStructuralFocused(prompt, "menus", {
      context: `## Existing Pages\n${existingPaths.join("\n") || "(none)"}\n\n## Existing Menus & Items\n${existingMenus.length > 0 ? existingMenus.map((m) => `Menu "${m.menu_slug}":\n${m.items.map((i) => `  - ${i.label} → ${i.url}`).join("\n") || "  (empty)"}`).join("\n\n") : "(no menus)"}`,
      responseFormat: `{ "menuChanges": [{ "menu_slug": "main-menu", "action": "add", "label": "Name", "url": "/path", "target": "_self", "after_label": "Services", "recommendation": "reason" }], "newMenus": [{ "name": "Footer Menu", "slug": "footer-menu", "recommendation": "reason" }] }`,
      instruction: "Identify ONLY menu changes needed — new menus to create and items to add/remove/update. Study the existing menu structure and place items in the correct position.",
    }, costContext),
  ]);

  const result: StructuralAnalysisResult = {
    redirects: [],
    deleteRedirects: [],
    pages: [],
    posts: [],
    menuChanges: [],
    newMenus: [],
  };

  // Merge redirects
  if (redirectsResult.status === "fulfilled" && redirectsResult.value) {
    const r = redirectsResult.value;
    if (r.redirects) result.redirects = r.redirects.filter((x: any) => x?.from_path && x?.to_path);
    if (r.deleteRedirects) result.deleteRedirects = r.deleteRedirects.filter((x: any) => x?.from_path);
  }

  // Merge content (pages + posts)
  if (contentResult.status === "fulfilled" && contentResult.value) {
    const c = contentResult.value;
    if (c.pages) result.pages = c.pages.filter((x: any) => x?.path && x?.purpose);
    if (c.posts) result.posts = c.posts.filter((x: any) => x?.post_type_slug && x?.title);
  }

  // Merge menus
  if (menusResult.status === "fulfilled" && menusResult.value) {
    const m = menusResult.value;
    if (m.menuChanges) result.menuChanges = m.menuChanges.filter((x: any) => x?.menu_slug && x?.action && x?.label);
    if (m.newMenus) result.newMenus = m.newMenus.filter((x: any) => x?.name && x?.slug);
  }

  // Log failures
  if (redirectsResult.status === "rejected") logger.error({ err: redirectsResult.reason?.message }, "[AiCommand] Redirects analysis failed:");
  if (contentResult.status === "rejected") logger.error({ err: contentResult.reason?.message }, "[AiCommand] Content analysis failed:");
  if (menusResult.status === "rejected") logger.error({ err: menusResult.reason?.message }, "[AiCommand] Menus analysis failed:");

  logger.info(
    `[AiCommand] ✓ Structural: ${result.redirects.length} redirects, ${result.deleteRedirects.length} delete-redirects, ${result.pages.length} pages, ${result.posts.length} posts, ${result.menuChanges.length} menu changes, ${result.newMenus.length} new menus`
  );

  return result;
}

/**
 * Focused structural analysis — one call per output type.
 * Each call gets the full checklist but only outputs one category.
 */
async function analyzeStructuralFocused(
  prompt: string,
  focusArea: string,
  params: { context: string; responseFormat: string; instruction: string },
  costContext?: AiCommandCostContext
): Promise<any> {
  const ai = getClient();

  const userMessage = `## Requirements / Checklist

${prompt}

${params.context}

## Task
${params.instruction}

## Response Format — return ONLY this JSON structure:
${params.responseFormat}

If nothing is needed, return the structure with empty arrays.`;

  logger.info(`[AiCommand] Structural/${focusArea}: starting...`);

  let response = await ai.messages.create({
    model: MODEL,
    max_tokens: 8192,
    system: getStructuralPrompt(),
    messages: [{ role: "user", content: userMessage }],
  });
  await logAnthropicCost(costContext, "ai-command", response, {
    stage: "structural",
    focus_area: focusArea,
  });

  let text = extractText(response);

  if (response.stop_reason === "max_tokens") {
    logger.warn(`[AiCommand] Structural/${focusArea}: truncated at ${text.length} chars`);
  }

  let parsed = tryParseJson(text);

  if (!parsed) {
    logger.warn(`[AiCommand] Structural/${focusArea}: parse failed, retrying...`);
    response = await ai.messages.create({
      model: MODEL,
      max_tokens: 8192,
      system: getStructuralPrompt(),
      messages: [
        { role: "user", content: userMessage },
        { role: "assistant", content: text },
        { role: "user", content: "Your response was not valid JSON. Return ONLY the JSON object." },
      ],
    });
    await logAnthropicCost(costContext, "ai-command", response, {
      stage: "structural-retry",
      focus_area: focusArea,
    });
    text = extractText(response);
    parsed = tryParseJson(text);
  }

  if (!parsed) {
    logger.error(`[AiCommand] Structural/${focusArea}: failed after retry. Raw: ${text.substring(0, 300)}`);
    return {};
  }

  logger.info(`[AiCommand] Structural/${focusArea}: ✓ done`);
  return parsed;
}

// ---------------------------------------------------------------------------
// Execution — edit HTML based on an approved instruction
// ---------------------------------------------------------------------------

// Execution prompt loaded from websiteAgents/aiCommand/Execution.md

export interface ExecutionResult {
  editedHtml: string;
  inputTokens: number;
  outputTokens: number;
}

export async function editHtmlContent(params: {
  instruction: string;
  currentHtml: string;
  targetLabel: string;
  costContext?: AiCommandCostContext;
}): Promise<ExecutionResult> {
  const { instruction, currentHtml, targetLabel, costContext } = params;
  const ai = getClient();

  const userMessage = `## Target: ${targetLabel}

## Instruction
${instruction}

## Current HTML

${currentHtml}`;

  const messages: Array<{ role: "user" | "assistant"; content: string }> = [
    { role: "user", content: userMessage },
  ];

  logger.info(
    `[AiCommand] Executing edit: ${targetLabel} (${currentHtml.length} chars)`
  );

  let response = await ai.messages.create({
    model: MODEL,
    max_tokens: 8192,
    system: getExecutionPrompt(),
    messages,
  });
  await logAnthropicCost(costContext, "ai-command", response, {
    stage: "execute",
    target_label: targetLabel,
  });

  let text = extractText(response);
  let html = cleanHtmlOutput(text);

  // Retry if output looks like JSON or is empty
  if (!html || html.startsWith("{")) {
    logger.warn(
      `[AiCommand] Invalid edit output for ${targetLabel}, retrying...`
    );
    messages.push({ role: "assistant", content: text });
    messages.push({
      role: "user",
      content: "Return ONLY raw HTML, no JSON wrapper, no code fences.",
    });

    response = await ai.messages.create({
      model: MODEL,
      max_tokens: 8192,
      system: getExecutionPrompt(),
      messages,
    });
    await logAnthropicCost(costContext, "ai-command", response, {
      stage: "execute-retry",
      target_label: targetLabel,
    });

    text = extractText(response);
    html = cleanHtmlOutput(text);
  }

  if (!html) {
    throw new Error(`LLM returned empty HTML for ${targetLabel}`);
  }

  logger.info(
    `[AiCommand] ✓ Edit complete: ${targetLabel}. Tokens: ${response.usage.input_tokens}/${response.usage.output_tokens}`
  );

  return {
    editedHtml: html,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
}

// ---------------------------------------------------------------------------
// Post content generation — rich text only, no page layout
// ---------------------------------------------------------------------------

export async function generatePostContent(params: {
  title: string;
  postTypeName: string;
  purpose: string;
  referenceContent: string;
  styleContext: string;
  customFieldsHint: string;
  costContext?: AiCommandCostContext;
}): Promise<{ html: string; inputTokens: number; outputTokens: number }> {
  const { costContext } = params;
  const ai = getClient();
  const userMessage = [
    `## Post to Create`,
    `Title: ${params.title}`,
    `Type: ${params.postTypeName}`,
    params.purpose ? `Purpose: ${params.purpose}` : "",
    params.referenceContent ? `\n## Reference Content (primary data source)\n${params.referenceContent}` : "",
    params.styleContext ? `\n## Existing Posts of Same Type (match this style)\n${params.styleContext}` : "",
    params.customFieldsHint || "",
  ].filter(Boolean).join("\n");

  logger.info(`[AiCommand] Generating post content: ${params.title} (${params.postTypeName})`);

  const response = await ai.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: getPostContentPrompt(),
    messages: [{ role: "user", content: userMessage }],
  });
  await logAnthropicCost(costContext, "ai-command", response, {
    stage: "post-content",
    title: params.title,
  });

  let html = cleanHtmlOutput(extractText(response));

  if (!html || html.startsWith("{")) {
    throw new Error(`Failed to generate post content for ${params.title}`);
  }

  logger.info(
    `[AiCommand] ✓ Post content: ${params.title}. ${html.length} chars. Tokens: ${response.usage.input_tokens}/${response.usage.output_tokens}`
  );

  return {
    html,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
}

// ---------------------------------------------------------------------------
// Page creation — section planner + HTML generator
// ---------------------------------------------------------------------------

// Section planner prompt loaded from websiteAgents/aiCommand/SectionPlanner.md

export interface SectionPlan {
  sections: Array<{ name: string; purpose: string }>;
}

export async function planPageSections(params: {
  purpose: string;
  existingSections: Array<{ name: string; summary: string }>;
  costContext?: AiCommandCostContext;
}): Promise<SectionPlan> {
  const { purpose, existingSections, costContext } = params;
  const ai = getClient();

  const userMessage = `## Page Purpose
${purpose}

## Existing Pages' Section Structures (for style reference)
${existingSections.map((s) => `- ${s.name}: ${s.summary}`).join("\n")}`;

  logger.info(`[AiCommand] Planning sections for: ${purpose.slice(0, 80)}`);

  const response = await ai.messages.create({
    model: MODEL,
    max_tokens: 2048,
    system: getSectionPlannerPrompt(),
    messages: [{ role: "user", content: userMessage }],
  });
  await logAnthropicCost(costContext, "ai-command", response, {
    stage: "plan-sections",
  });

  const text = extractText(response);
  const parsed = tryParseJson(text);

  if (!parsed || !Array.isArray(parsed.sections)) {
    logger.error({ err: text.substring(0, 300) }, "[AiCommand] Section plan parse failed:");
    return {
      sections: [
        { name: "section-hero", purpose: "Hero banner with page title" },
        { name: "section-content", purpose: "Main page content" },
        { name: "section-cta", purpose: "Call to action / contact" },
      ],
    };
  }

  logger.info(`[AiCommand] ✓ Planned ${parsed.sections.length} sections`);
  return { sections: parsed.sections };
}

// Section generator prompt loaded from websiteAgents/aiCommand/SectionGenerator.md
// Visual analysis prompt loaded from websiteAgents/aiCommand/VisualAnalysis.md
const __DEAD_SECTION_GEN = `DEAD
- Root element: class="alloro-tpl-{ID}-{SECTION_NAME} ..." and data-alloro-section="{SECTION_NAME}"
- Inner elements: class="alloro-tpl-{ID}-{SECTION_NAME}-component-{COMPONENT_NAME} ..."
- Component names: title, subtitle, description, cta-button, image, card-1, card-2, list-item-1, etc.
- {ID} is provided — use it exactly
- Every heading, button, image, paragraph, and card must have its own alloro-tpl component class

## LAYOUT STRUCTURE (CRITICAL — DO NOT SKIP)
- Root element MUST be a full-width section: <section class="... py-16 md:py-24">
- Content MUST be wrapped in a container: <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
- For card grids, use: <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
- For two-column layouts, use: <div class="grid grid-cols-1 lg:grid-cols-2 gap-8 md:gap-12 items-center">
- For text content, use: <div class="max-w-3xl mx-auto"> or <div class="max-w-2xl">
- NEVER let text flow without width constraints — every text block needs max-w-* or grid containment
- NEVER use single-word line breaks — if text wraps word-by-word, the container is too narrow

## TAILWIND REQUIREMENTS
- Use responsive prefixes: base (mobile) → sm → md → lg → xl
- Text sizing: text-base for body, text-lg md:text-xl for lead text, text-3xl md:text-4xl lg:text-5xl for headings
- Spacing: consistent py-16 md:py-24 for sections, gap-6 md:gap-8 for grids
- Buttons: inline-flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition-colors

## COLORS (CRITICAL)
- If brand colors are provided in the Site Style Reference, use them EXACTLY
- Use the primary color for: dark backgrounds, headings, primary buttons, accents
- Use the accent color for: CTAs, highlights, hover states, links
- Match the color scheme of the existing pages — if existing pages use dark navy backgrounds with white text, your sections MUST too
- Use inline Tailwind arbitrary values for custom hex colors: bg-[#11151C], text-[#D66853], etc.
- Do NOT default to generic gray/white when the site uses a distinct color palette

## BANNED — NEVER USE THESE:
- position: absolute or position: fixed — use flexbox or grid instead
- inline styles (style="...") — use Tailwind classes only
- float: left/right — use flex or grid
- !important — never
- <br> tags for spacing — use margin/padding classes
- Fixed pixel widths (width: 300px) — use Tailwind w-* classes

## RULES
- Return ONLY the section HTML — no page wrapper, no code fences, no commentary
- Do NOT add <html>, <head>, <body>, <header>, <footer> tags
- ALL layouts must use flexbox (flex) or CSS grid (grid) — never absolute positioning
- ALL styling must be Tailwind utility classes — zero inline styles
- Content must be relevant to the page purpose provided
- Match the visual style of the existing site context provided
- Every section must look complete and professional on its own`;

export interface GeneratedSection {
  html: string;
  inputTokens: number;
  outputTokens: number;
}

export async function generateSectionHtml(params: {
  sectionName: string;
  sectionPurpose: string;
  tplId: string;
  pageContext: string;
  priorSections: string[];
  siteStyleContext: string;
  costContext?: AiCommandCostContext;
}): Promise<GeneratedSection> {
  const { sectionName, sectionPurpose, tplId, pageContext, priorSections, siteStyleContext, costContext } = params;
  const ai = getClient();

  const userMessage = `## Section to Generate
Name: ${sectionName}
Purpose: ${sectionPurpose}
alloro-tpl ID to use: ${tplId}

## Page Context
${pageContext}

${priorSections.length > 0 ? `## Previously Generated Sections (maintain visual consistency)
${priorSections.map((s, i) => `--- Section ${i + 1} ---\n${s.substring(0, 800)}`).join("\n\n")}` : ""}

## Site Style Reference (existing page HTML for style matching)
${siteStyleContext.substring(0, 3000)}`;

  logger.info(`[AiCommand] Generating section: ${sectionName} (tplId: ${tplId})`);

  let response = await ai.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: getSectionGeneratorPrompt(),
    messages: [{ role: "user", content: userMessage }],
  });
  await logAnthropicCost(costContext, "ai-command", response, {
    stage: "generate-section",
    section_name: sectionName,
    tpl_id: tplId,
  });

  let text = extractText(response);
  let html = cleanHtmlOutput(text);

  // Validate alloro-tpl class is present
  if (!html.includes(`alloro-tpl-${tplId}`)) {
    logger.warn(`[AiCommand] Missing alloro-tpl class in generated section, retrying...`);
    response = await ai.messages.create({
      model: MODEL,
      max_tokens: 4096,
      system: getSectionGeneratorPrompt(),
      messages: [
        { role: "user", content: userMessage },
        { role: "assistant", content: html },
        { role: "user", content: `The root element MUST have class="alloro-tpl-${tplId}-${sectionName}" and data-alloro-section="${sectionName}". Inner elements must have alloro-tpl-${tplId}-${sectionName}-component-* classes. Regenerate with these classes.` },
      ],
    });
    await logAnthropicCost(costContext, "ai-command", response, {
      stage: "generate-section-retry",
      section_name: sectionName,
    });
    text = extractText(response);
    html = cleanHtmlOutput(text);
  }

  if (!html || html.startsWith("{")) {
    throw new Error(`Failed to generate valid HTML for section ${sectionName}`);
  }

  logger.info(
    `[AiCommand] ✓ Generated ${sectionName}: ${html.length} chars. Tokens: ${response.usage.input_tokens}/${response.usage.output_tokens}`
  );

  return {
    html,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
}

// ---------------------------------------------------------------------------
// Visual analysis via Sonnet vision
// ---------------------------------------------------------------------------

const VISUAL_ANALYSIS_PROMPT = `You are a UI/UX quality analyst reviewing a website screenshot. Identify EVERY visual issue you can see.

You will receive BOTH a screenshot AND the HTML markup for the page sections. Use both to diagnose issues accurately.

LOOK FOR:
- Overlapping elements (text on text, cards colliding, sections bleeding into each other)
- Broken grid layouts (columns not aligned, uneven spacing)
- Text overflow (text spilling outside containers, truncated content)
- Word-by-word wrapping (text breaking on every word — indicates missing container width)
- Misaligned elements (inconsistent spacing, off-center content)
- Broken or missing images (empty boxes, broken icons)
- Unreadable text (too small, low contrast, obscured by other elements)
- Responsive issues (content not adapting to viewport width)
- Huge empty whitespace gaps
- Elements that look out of place or unstyled

ARCHITECTURE RULES (flag violations):
- position: absolute/fixed — DISCOURAGED. Should use flexbox or grid instead. Flag any absolute/fixed positioning.
- Inline styles (style="...") — BANNED. Must use Tailwind CSS classes only. Flag any inline styles.
- Missing container constraints (no max-w-*) — Flag sections without width constraints.
- Float-based layouts — OBSOLETE. Should use flex/grid. Flag any float usage.

COLOR CONSISTENCY:
- If brand colors are provided, check that the page uses them consistently
- Flag sections that use different color schemes from the rest of the site (e.g., generic white/gray when the site uses dark navy)
- Flag buttons, CTAs, or accents that don't match the brand accent color
- If a section looks visually disconnected from the rest of the page (different color palette, different style), flag it as a consistency issue

For each issue:
1. WHERE — which section name and approximate position
2. WHAT — specific visual problem AND the HTML causing it (reference specific classes or elements)
3. HOW — specific Tailwind CSS fix (never suggest inline styles or position absolute)

RESPONSE FORMAT — return ONLY valid JSON:
{
  "issues": [
    {
      "section": "Name or description of the affected section",
      "severity": "critical" | "high" | "medium" | "low",
      "description": "Clear description of the visual problem",
      "suggested_fix": "Specific instruction to fix this in HTML/Tailwind"
    }
  ]
}

If the page looks good with no visual issues, return: { "issues": [] }`;

export interface VisualIssue {
  section: string;
  severity: string;
  description: string;
  suggested_fix: string;
}

export async function analyzeScreenshot(params: {
  screenshot: Buffer;
  viewport: string;
  pagePath: string;
  sectionHtml?: string;
  costContext?: AiCommandCostContext;
}): Promise<VisualIssue[]> {
  const { screenshot, viewport, pagePath, sectionHtml, costContext } = params;
  const ai = getClient();

  logger.info(`[AiCommand] Analyzing screenshot: ${pagePath} (${viewport})${sectionHtml ? ` with ${sectionHtml.length} chars HTML` : ""}`);

  const textContent = [
    `Page: ${pagePath}`,
    `Viewport: ${viewport}`,
    "",
    "Analyze this screenshot for visual/layout issues.",
    "Brand colors use CSS classes: bg-primary, text-primary, bg-accent, text-accent. Check that pages use these instead of hardcoded hex values.",
    sectionHtml ? `\n## Page HTML Markup (for reference)\n\n${sectionHtml.substring(0, 15000)}` : "",
  ].join("\n");

  const response = await ai.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: getVisualAnalysisPrompt(),
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: "image/jpeg",
              data: screenshot.toString("base64"),
            },
          },
          {
            type: "text",
            text: textContent,
          },
        ],
      },
    ],
  });
  await logAnthropicCost(costContext, "ai-command", response, {
    stage: "visual-analysis",
    page_path: pagePath,
    viewport,
  });

  const text = extractText(response);
  const parsed = tryParseJson(text);

  if (!parsed || !Array.isArray(parsed.issues)) {
    logger.warn(`[AiCommand] Visual analysis parse failed for ${pagePath} (${viewport})`);
    return [];
  }

  const issues = parsed.issues.filter(
    (i: any) => i?.description && i?.suggested_fix
  ) as VisualIssue[];

  logger.info(
    `[AiCommand] ✓ Visual ${pagePath} (${viewport}): ${issues.length} issue(s). Tokens: ${response.usage.input_tokens}/${response.usage.output_tokens}`
  );

  return issues;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractText(response: Anthropic.Message): string {
  const block = response.content[0];
  if (!block || block.type !== "text") {
    throw new Error("No text response from Claude");
  }
  return block.text;
}

function tryParseJson(text: string): any | null {
  try {
    let cleaned = text.trim();

    // Strip markdown fences
    const fenceMatch = cleaned.match(/```\w*\n([\s\S]*?)```/);
    if (fenceMatch) {
      cleaned = fenceMatch[1].trim();
    }

    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

function cleanHtmlOutput(text: string): string {
  let cleaned = text.trim();

  // Strip markdown fences
  const fenceMatch = cleaned.match(/```\w*\n([\s\S]*?)```/);
  if (fenceMatch) {
    cleaned = fenceMatch[1].trim();
  }

  return cleaned;
}
