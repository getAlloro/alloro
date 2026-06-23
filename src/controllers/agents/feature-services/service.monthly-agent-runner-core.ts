/**
 * Monthly Agent Runner Core
 *
 * Single-agent execution primitive for the monthly pipeline: runs one agent
 * via Claude directly (no n8n), parses/validates the output, and persists the
 * result to agent_results. Returns the same shape that fireWebhookAndPoll used
 * to return so the rest of the orchestrator stays unchanged.
 *
 * Split out of service.agent-orchestrator.ts in the decomposition pass —
 * behavior identical. Consumed by service.monthly-agent-processor.ts.
 */

import { AgentResultModel } from "../../../models/AgentResultModel";
import { OrganizationModel } from "../../../models/OrganizationModel";
import { v4 as uuidv4 } from "uuid";
import { loadPrompt } from "../../../agents/service.prompt-loader";
import { substitutePromptPlaceholders } from "../../../agents/service.prompt-substituter";
import { resolveOrgType } from "../../../config/orgLabels";
import { runAgent } from "../../../agents/service.llm-runner";
import { log } from "../feature-utils/agentLogger";
import type { ZodTypeAny } from "zod";

/**
 * Run a monthly agent via Claude directly (no n8n), then persist the
 * result to agent_results. Returns the same shape that fireWebhookAndPoll
 * used to return so the rest of the orchestrator stays unchanged.
 */
export async function runMonthlyAgent(opts: {
  promptPath: string;
  payload: any;
  agentName: string;
  meta: {
    organizationId: number;
    locationId: number | null;
    agentType: string;
    dateStart: string;
    dateEnd: string;
  };
  /** When true, enable Anthropic prompt cache for the system prompt. */
  enableCache?: boolean;
  /** Optional Zod schema; runner runs safeParse + corrective retry on failure. */
  outputSchema?: ZodTypeAny;
  /** Optional per-agent model override. When unset, runAgent uses its
   *  DEFAULT_MODEL (process.env.AGENTS_LLM_MODEL or claude-sonnet-4-6). */
  model?: string;
  /** Override default maxTokens (16384). Use for agents with large output. */
  maxTokens?: number;
}): Promise<{ agentOutput: any; agentResultId: number }> {
  const orgType = resolveOrgType(
    (await OrganizationModel.findById(opts.meta.organizationId))?.organization_type
  );
  const systemPrompt = substitutePromptPlaceholders(
    loadPrompt(opts.promptPath),
    orgType
  );
  const userMessage = JSON.stringify(opts.payload, null, 2);
  const maxTokens = opts.maxTokens ?? 16384;

  log(
    `  → Running ${opts.agentName} via Claude directly${
      opts.model ? ` (model: ${opts.model})` : ""
    } (system=${systemPrompt.length}ch, user=${userMessage.length}ch, maxTokens=${maxTokens})`
  );

  let result;
  try {
    result = await runAgent({
      systemPrompt,
      userMessage,
      maxTokens,
      ...(opts.enableCache ? { cachedSystemBlocks: [] } : {}),
      ...(opts.outputSchema ? { outputSchema: opts.outputSchema } : {}),
      ...(opts.model ? { model: opts.model } : {}),
    });
  } catch (apiError: any) {
    const status = apiError?.status ?? apiError?.response?.status ?? "unknown";
    const errorType = status === 429 ? "rate_limit" : status === 529 ? "overloaded" : status === 500 ? "server_error" : `api_error_${status}`;
    log(`  ✗ ${opts.agentName} API call failed: type=${errorType} status=${status} message="${apiError.message}"`);
    throw apiError;
  }

  log(
    `  ✓ ${opts.agentName} responded (${result.inputTokens} in / ${result.outputTokens} out, model=${result.model})`
  );

  if (!result.parsed) {
    const truncated = result.stopReason === "max_tokens";
    log(`  ✗ ${opts.agentName} returned non-JSON output (stop=${result.stopReason}, raw=${result.raw.length}ch, tokens=${result.outputTokens}/${maxTokens})`);
    if (truncated) {
      log(`  ✗ ${opts.agentName} OUTPUT TRUNCATED at maxTokens=${maxTokens} — JSON incomplete. Increase maxTokens for this agent.`);
    } else {
      log(`  ✗ ${opts.agentName} first 300ch of raw: ${result.raw.substring(0, 300)}`);
    }
    throw new Error(`${opts.agentName} returned non-JSON output (stop=${result.stopReason}, raw=${result.raw.length}ch, tokens=${result.outputTokens}/${maxTokens})`);
  }

  // Persist to agent_results (replaces what n8n used to write)
  const runId = uuidv4();
  const agentResultId = await AgentResultModel.insertReturningId({
    run_id: runId,
    organization_id: opts.meta.organizationId,
    location_id: opts.meta.locationId,
    agent_type: opts.meta.agentType,
    date_start: opts.meta.dateStart,
    date_end: opts.meta.dateEnd,
    agent_input: userMessage,
    agent_output: JSON.stringify(result.parsed),
    status: "success",
    created_at: new Date(),
    updated_at: new Date(),
  });

  log(`  ✓ ${opts.agentName} result saved (ID: ${agentResultId}, run_id: ${runId})`);

  return {
    agentOutput: result.parsed,
    agentResultId,
  };
}
