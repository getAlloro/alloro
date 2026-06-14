/**
 * Layouts Pipeline Service
 *
 * Generates the site-wide wrapper/header/footer once per project. Runs
 * separately from page generation. Admin-triggered from the Layouts tab.
 */

import axios from "axios";
import { db } from "../../../database/connection";
import {
  runWithTools,
  type ToolSchema,
  type ToolCall,
  type CostContext,
} from "../../../agents/service.llm-runner";
import { loadPrompt } from "../../../agents/service.prompt-loader";
import { uploadToS3 } from "../../../utils/core/s3";
import {
  buildMediaS3Key,
  buildS3Url,
} from "../../admin-media/feature-utils/util.s3-helpers";
import {
  buildStableIdentityContext,
  buildGradientStopsCss,
  resolveImageUrl,
  type ProjectIdentity,
} from "../feature-utils/util.identity-context";
import {
  hasUsableIdentityForLayoutGeneration,
  type ProjectIdentityRecord,
} from "../feature-utils/util.project-identity";
import { ProjectIdentityModel } from "../../../models/website-builder/ProjectIdentityModel";
import logger from "../../../lib/logger";

const PROJECTS_TABLE = "website_builder.projects";
const TEMPLATES_TABLE = "website_builder.templates";

const LOG_PREFIX = "[LayoutsPipeline]";

function log(msg: string, data?: Record<string, unknown>): void {
  logger.info({ detail: data ? JSON.stringify(data) : "" }, `${LOG_PREFIX} ${msg}`);
}

function checkCancel(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new Error("Generation cancelled");
  }
}

// ---------------------------------------------------------------------------
// PUBLIC ENTRY POINT
// ---------------------------------------------------------------------------

export async function generateLayouts(
  projectId: string,
  slotValues: Record<string, string>,
  signal?: AbortSignal,
): Promise<void> {
  log("Starting layouts generation", { projectId });

  await db(PROJECTS_TABLE).where("id", projectId).update({
    layouts_generation_status: "generating",
    layouts_generation_progress: JSON.stringify({
      total: 3,
      completed: 0,
      current_component: "wrapper",
    }),
    layout_slot_values: JSON.stringify(slotValues || {}),
    updated_at: db.fn.now(),
  });

  try {
    const project = await db(PROJECTS_TABLE).where("id", projectId).first();
    if (!project) throw new Error(`Project ${projectId} not found`);

    const identity = await ProjectIdentityModel.findByProjectId<ProjectIdentity>(
      projectId,
    );
    if (!identity || !hasUsableIdentityForLayoutGeneration(identity)) {
      throw new Error("IDENTITY_NOT_READY");
    }

    const template = project.template_id
      ? await db(TEMPLATES_TABLE).where("id", project.template_id).first()
      : null;
    if (!template) {
      throw new Error("NO_TEMPLATE");
    }

    // Handle logo slot — download and host if provided and not already hosted
    if (slotValues?.logo_url && slotValues.logo_url.trim()) {
      const providedUrl = slotValues.logo_url.trim();
      const cachedLogoUrl = identity.brand?.logo_s3_url;

      if (!cachedLogoUrl || providedUrl !== cachedLogoUrl) {
        try {
          const hostedUrl = await downloadAndHostLogo(projectId, providedUrl, signal);
          identity.brand = identity.brand || {};
          identity.brand.logo_s3_url = hostedUrl;
          slotValues.logo_url = hostedUrl;
          await ProjectIdentityModel.updateByProjectId(
            projectId,
            identity as ProjectIdentityRecord,
          );
          log("Logo hosted", { hostedUrl });
        } catch (err: any) {
          log("Logo download failed, continuing with provided URL", {
            error: err.message,
          });
        }
      }
    }

    checkCancel(signal);

    const layoutPrompt = loadPrompt("websiteAgents/builder/LayoutGenerator");
    const stableContext = buildStableIdentityContext(identity);

    const componentDefs: Array<{ name: "wrapper" | "header" | "footer"; markup: string }> = [
      { name: "wrapper", markup: template.wrapper || "" },
      { name: "header", markup: template.header || "" },
      { name: "footer", markup: template.footer || "" },
    ].filter((c) => c.markup.trim().length > 0) as any;

    for (let i = 0; i < componentDefs.length; i++) {
      checkCancel(signal);

      const { name, markup } = componentDefs[i];
      log(`Generating ${name} (${i + 1}/${componentDefs.length})`);

      await db(PROJECTS_TABLE).where("id", projectId).update({
        layouts_generation_progress: JSON.stringify({
          total: componentDefs.length,
          completed: i,
          current_component: name,
        }),
        updated_at: db.fn.now(),
      });

      const userMessage = buildLayoutComponentMessage(name, markup, identity, slotValues);
      const componentCostContext: CostContext = {
        projectId,
        eventType: "layouts-build",
        metadata: { component: name },
      };
      const html = await generateLayoutComponent(
        identity,
        layoutPrompt,
        stableContext,
        userMessage,
        signal,
        componentCostContext,
      );

      if (!html) {
        log(`Skipping ${name} — no HTML returned`);
        continue;
      }

      // Wrapper shortcode gate — {{slot}} required
      if (name === "wrapper" && !html.includes("{{slot}}")) {
        log("Wrapper missing {{slot}}, retrying once");
        const retryMessage =
          userMessage +
          "\n\n## ERROR IN PREVIOUS ATTEMPT\nThe wrapper did not contain {{slot}}. This is REQUIRED. Regenerate with {{slot}} placed inside the <main> or <body> tag.";
        const retryHtml = await generateLayoutComponent(
          identity,
          layoutPrompt,
          stableContext,
          retryMessage,
          signal,
          { ...componentCostContext, metadata: { ...(componentCostContext.metadata || {}), retry: true } },
        );
        if (retryHtml && retryHtml.includes("{{slot}}")) {
          await db(PROJECTS_TABLE).where("id", projectId).update({
            wrapper: retryHtml,
            updated_at: db.fn.now(),
          });
        } else {
          log("Wrapper retry failed — preserving previous wrapper");
          if (!(project.wrapper && project.wrapper.includes("{{slot}}"))) {
            throw new Error("WRAPPER_MISSING_SLOT");
          }
        }
      } else {
        const originalTokens = extractShortcodeTokens(markup);
        const outputTokens = extractShortcodeTokens(html);
        const missing = originalTokens.filter((t) => !outputTokens.includes(t));
        if (missing.length > 0) {
          log(`Warning: ${name} dropped shortcode tokens`, { missing });
        }

        const updatePatch: any = { updated_at: db.fn.now() };
        updatePatch[name] = html;
        await db(PROJECTS_TABLE).where("id", projectId).update(updatePatch);
      }

      await db(PROJECTS_TABLE).where("id", projectId).update({
        layouts_generation_progress: JSON.stringify({
          total: componentDefs.length,
          completed: i + 1,
          current_component:
            i + 1 < componentDefs.length ? componentDefs[i + 1].name : "done",
        }),
        updated_at: db.fn.now(),
      });
    }

    await db(PROJECTS_TABLE).where("id", projectId).update({
      layouts_generation_status: "ready",
      layouts_generation_progress: null,
      layouts_generated_at: db.fn.now(),
      updated_at: db.fn.now(),
    });

    log("Layouts generation complete", { projectId });
  } catch (err: any) {
    log("Layouts generation failed", { projectId, error: err.message });
    await db(PROJECTS_TABLE).where("id", projectId).update({
      layouts_generation_status: "failed",
      layouts_generation_progress: null,
      updated_at: db.fn.now(),
    });
    throw err;
  }
}

// ---------------------------------------------------------------------------
// COMPONENT GENERATION (select_image tool loop + caching)
// ---------------------------------------------------------------------------

const SELECT_IMAGE_TOOL: ToolSchema = {
  name: "select_image",
  description: "Retrieve the actual S3 URL for an image by manifest id.",
  input_schema: {
    type: "object",
    properties: {
      image_id: { type: "string" },
    },
    required: ["image_id"],
  },
};

async function generateLayoutComponent(
  identity: ProjectIdentity,
  systemPrompt: string,
  stableContext: string,
  userMessage: string,
  signal?: AbortSignal,
  costContext?: CostContext,
): Promise<string | null> {
  const messages: any[] = [{ role: "user", content: userMessage }];
  let iterations = 0;
  const maxIterations = 3;

  // Root cost event id — threads nested tool turns under the top-level run.
  let rootCostEventId: string | null = null;

  while (iterations < maxIterations) {
    checkCancel(signal);

    const turnCostContext: CostContext | undefined = costContext
      ? rootCostEventId
        ? {
            ...costContext,
            eventType: "select-image-tool",
            parentEventId: rootCostEventId,
            metadata: {
              ...(costContext.metadata || {}),
              tool_iteration: iterations,
            },
          }
        : costContext
      : undefined;

    const result = await runWithTools({
      systemPrompt,
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
      return extractHtmlFromResponse(result.textResponse);
    }

    messages.push({ role: "assistant", content: result.assistantContent });
    const toolResults = result.toolCalls.map((call: ToolCall) => {
      if (call.name !== "select_image") {
        return {
          type: "tool_result",
          tool_use_id: call.id,
          content: JSON.stringify({ error: `Unknown tool: ${call.name}` }),
          is_error: true,
        };
      }
      const resolved = resolveImageUrl(identity, String(call.input.image_id || ""));
      if (!resolved) {
        return {
          type: "tool_result",
          tool_use_id: call.id,
          content: JSON.stringify({ error: "Image id not found" }),
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
    messages.push({ role: "user", content: toolResults });
    iterations++;
  }

  log("select_image loop exhausted, finalizing");
  messages.push({
    role: "user",
    content:
      "Tool limit reached. Return the final layout HTML as {name, html} — no more tools.",
  });
  try {
    const final = await runWithTools({
      systemPrompt,
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
    return extractHtmlFromResponse(final.textResponse);
  } catch {
    return null;
  }
}

function extractHtmlFromResponse(textResponse: string | null): string | null {
  if (!textResponse) return null;
  const trimmed = textResponse.trim();
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed.html) return String(parsed.html);
    if (parsed.content) return String(parsed.content);
  } catch {
    const m = trimmed.match(/\{[\s\S]*"html"[\s\S]*\}/);
    if (m) {
      try {
        const parsed = JSON.parse(m[0]);
        if (parsed.html) return String(parsed.html);
      } catch {
        /* ignore */
      }
    }
  }
  if (trimmed.startsWith("<") && trimmed.includes("</")) return trimmed;
  return null;
}

// ---------------------------------------------------------------------------
// MESSAGE BUILDING
// ---------------------------------------------------------------------------

function buildLayoutComponentMessage(
  name: "wrapper" | "header" | "footer",
  markup: string,
  identity: ProjectIdentity,
  slotValues: Record<string, string>,
): string {
  const parts: string[] = [];

  parts.push(`## COMPONENT TO GENERATE\nname: ${name}`);
  parts.push(`\n## TEMPLATE MARKUP\n\`\`\`html\n${markup}\n\`\`\``);

  if (name === "wrapper") {
    const br = identity.brand || {};
    const colorLines = [
      `primary_color: ${br.primary_color || "(unset)"}`,
      `accent_color: ${br.accent_color || "(unset)"}`,
      `gradient_enabled: ${!!br.gradient_enabled}`,
    ];
    if (br.gradient_enabled) {
      const textColor = br.gradient_text_color || "white";
      const textHex = textColor === "dark" ? "#111827" : "#FFFFFF";
      const preset = br.gradient_preset || "smooth";
      const stopsCss = buildGradientStopsCss(
        br.gradient_from || "#1E40AF",
        br.gradient_to || "#F59E0B",
        preset,
      );
      colorLines.push(
        `gradient_from: ${br.gradient_from}, gradient_to: ${br.gradient_to}, direction: ${br.gradient_direction || "to-br"}`,
      );
      colorLines.push(`gradient_preset: ${preset}`);
      colorLines.push(
        `gradient_stops_css: "${stopsCss}" — use this as the content inside linear-gradient(direction, ...) for .bg-gradient-brand`,
      );
      colorLines.push(
        `gradient_text_color: ${textColor} (hex: ${textHex}) — use this for the color property on .bg-gradient-brand`,
      );
    }
    parts.push(`\n## BRAND COLORS (for style injection)\n${colorLines.join("\n")}`);
  }

  const nonEmptySlots = Object.entries(slotValues || {}).filter(
    ([, v]) => v && String(v).trim(),
  );
  if (nonEmptySlots.length > 0) {
    parts.push(
      `\n## SLOT VALUES\n${nonEmptySlots.map(([k, v]) => `- ${k}: ${v}`).join("\n")}`,
    );
  }

  if (name === "header" || name === "footer") {
    const images = (identity.extracted_assets?.images || []).slice(0, 4);
    if (images.length > 0) {
      parts.push(
        `\n## AVAILABLE IMAGES (use select_image tool)\n${images
          .map((img, idx) => {
            return `- img-${idx}: ${img.description || "(no description)"} - use_case: ${img.use_case || "?"} - logo: ${img.is_logo ? "YES" : "no"}`;
          })
          .join("\n")}`,
      );
    }
  }

  return parts.join("\n");
}

function extractShortcodeTokens(html: string): string[] {
  const tokens = new Set<string>();
  const braceMatches = html.matchAll(/\{\{[^}]+\}\}/g);
  for (const m of braceMatches) tokens.add(m[0]);
  const bracketMatches = html.matchAll(/\[(?:post_block|review_block)[^\]]*\]/g);
  for (const m of bracketMatches) tokens.add(m[0]);
  return [...tokens];
}

// ---------------------------------------------------------------------------
// LOGO DOWNLOAD
// ---------------------------------------------------------------------------

async function downloadAndHostLogo(
  projectId: string,
  logoUrl: string,
  signal?: AbortSignal,
): Promise<string> {
  const response = await axios.get(logoUrl, {
    responseType: "arraybuffer",
    timeout: 15000,
    headers: { Accept: "image/*" },
    signal,
  });

  const buffer = Buffer.from(response.data);
  const contentType = response.headers["content-type"] || "image/png";
  const ext = contentType.includes("svg")
    ? "svg"
    : contentType.includes("png")
      ? "png"
      : contentType.includes("webp")
        ? "webp"
        : "jpg";
  const filename = `logo-${Date.now()}.${ext}`;
  const s3Key = buildMediaS3Key(projectId, filename);

  await uploadToS3(s3Key, buffer, contentType);
  return buildS3Url(s3Key);
}
