/**
 * Component Generator Service
 *
 * Single-component HTML generation for the website pipeline. Runs one Claude
 * call per section through service.llm-runner with a `select_image` tool loop
 * so the model resolves real S3 image URLs (instead of hallucinating them),
 * then extracts the final HTML from the response.
 *
 * Extracted from service.generation-pipeline.ts (behavior-preserving) — the
 * pipeline owns orchestration; this module owns the per-component LLM call.
 */

import {
  runWithTools,
  type ToolSchema,
  type ToolCall,
  type CostContext,
} from "../../../agents/service.llm-runner";
import {
  resolveImageUrl,
  type ProjectIdentity,
} from "../feature-utils/util.identity-context";
import logger from "../../../lib/logger";

const LOG_PREFIX = "[GenPipeline]";
function log(msg: string, data?: Record<string, unknown>): void {
  logger.info({ detail: data ? JSON.stringify(data) : "" }, `${LOG_PREFIX} ${msg}`);
}

function checkCancel(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new Error("Generation cancelled");
  }
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

export async function generateSingleComponent(
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

export function extractHtmlFromResponse(textResponse: string | null): string | null {
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
