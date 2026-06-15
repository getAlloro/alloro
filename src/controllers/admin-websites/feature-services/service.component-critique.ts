/**
 * Component Critique Service
 *
 * Second-pass quality gates for generated website HTML. Two passes:
 *   - runCritique — per-component review (drives a single regenerate on fail)
 *   - runWholePageCritique — one pass over the concatenated page (soft gate,
 *     logs cross-section consistency issues but never blocks publish)
 *
 * Both call service.llm-runner with a forced `report_critique` tool so the
 * model returns a structured verdict.
 *
 * Extracted from service.generation-pipeline.ts (behavior-preserving).
 */

import {
  runWithTools,
  type ToolSchema,
  type CostContext,
} from "../../../agents/service.llm-runner";
import { loadPrompt } from "../../../agents/service.prompt-loader";
import { type ProjectIdentity } from "../feature-utils/util.identity-context";
import logger from "../../../lib/logger";

const LOG_PREFIX = "[GenPipeline]";
function log(msg: string, data?: Record<string, unknown>): void {
  logger.info({ detail: data ? JSON.stringify(data) : "" }, `${LOG_PREFIX} ${msg}`);
}

export interface CritiqueVerdict {
  pass: boolean;
  issues: string[];
  suggested_improvements: string;
}

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

export async function runCritique(
  identity: ProjectIdentity,
  criticPrompt: string,
  componentName: string,
  html: string,
  costContext?: CostContext,
): Promise<CritiqueVerdict | null> {
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
export async function runWholePageCritique(
  identity: ProjectIdentity,
  wholePageHtml: string,
  pageName: string,
  costContext?: CostContext,
): Promise<CritiqueVerdict | null> {
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
