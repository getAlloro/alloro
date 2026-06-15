/**
 * AI Command Service
 * Handles LLM-powered batch analysis and execution for the AI Command feature.
 * Uses Claude Sonnet for both analysis (recommendations) and execution (HTML editing).
 *
 * Direct SDK calls — instrumented manually via `safeLogAiCostEvent`. Each
 * public function accepts an optional `costContext` carrying the project id
 * and metadata; when omitted, no cost row is written.
 *
 * Shared plumbing (client, model, cost logging, prompt loaders, parse
 * helpers) lives in `./aiCommandShared`; this module keeps the public
 * LLM call functions. Split for the file-size ceiling — behavior is
 * unchanged.
 *
 * TODO (deferred — not in this MVP pass):
 *   - Apify, Puppeteer, OpenAI embeddings, Google Places.
 *   - See `src/services/ai-cost/pricing.ts`.
 */

import logger from "../../lib/logger";
import {
  MODEL,
  AiCommandCostContext,
  logAnthropicCost,
  getAnalysisPrompt,
  getStructuralPrompt,
  getExecutionPrompt,
  getSectionPlannerPrompt,
  getSectionGeneratorPrompt,
  getVisualAnalysisPrompt,
  getPostContentPrompt,
  getClient,
  extractText,
  tryParseJson,
  cleanHtmlOutput,
} from "./aiCommandShared";

// Re-export the cost-context type so existing callers can keep importing it
// from this module path.
export type { AiCommandCostContext } from "./aiCommandShared";

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
// (legacy inline copy relocated to ./aiCommandLegacyPrompts)

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

// Visual analysis prompt loaded from websiteAgents/aiCommand/VisualAnalysis.md
// (legacy inline copy relocated to ./aiCommandLegacyPrompts)

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
