import { runAgent } from "../../agents/service.llm-runner";
import { loadPrompt } from "../../agents/service.prompt-loader";
import { substitutePromptPlaceholders } from "../../agents/service.prompt-substituter";
import type { OrgType } from "../../config/orgLabels";
import {
  ColumnMappingResponseSchema,
  type ColumnMappingResponse,
} from "../../types/pmsMapping";
import logger from "../../lib/logger";

/**
 * AI inference service for PMS column mapping.
 *
 * Tier 3 of the resolver chain (org-cache → global-library → AI inference).
 * Calls Haiku 4.5 with the `PmsColumnMapper` prompt + the file's headers
 * and sample rows. Validation is delegated to `runAgent`'s built-in
 * Zod-retry pipeline (one corrective retry on schema failure).
 *
 * Returns:
 *   - `ColumnMappingResponse` on success
 *   - `null` on timeout (>8s), API error, parse failure, or schema failure
 *
 * Callers handle the null case by falling through to the manual-mapping
 * UI state with an empty mapping pre-populated (all roles = "ignore").
 */

/** 8-second hard timeout per spec. The UI loading state is bounded to this. */
const INFERENCE_TIMEOUT_MS = 8000;

/** Cap sample-row payload to keep token cost predictable. */
const MAX_SAMPLE_ROWS = 10;

const DEFAULT_MAPPER_MODEL = "claude-haiku-4-5-20251001";

export async function inferColumnMapping(
  headers: string[],
  sampleRows: Record<string, unknown>[],
  orgType: OrgType = "health"
): Promise<ColumnMappingResponse | null> {
  const systemPrompt = substitutePromptPlaceholders(
    loadPrompt("monthlyAgents/PmsColumnMapper"),
    orgType
  );
  const model = process.env.AGENTS_LLM_MAPPER_MODEL ?? DEFAULT_MAPPER_MODEL;

  const userPayload = {
    headers,
    sampleRows: sampleRows.slice(0, MAX_SAMPLE_ROWS),
  };

  const inferencePromise = (async (): Promise<ColumnMappingResponse | null> => {
    try {
      const result = await runAgent({
        systemPrompt,
        userMessage: JSON.stringify(userPayload, null, 2),
        model,
        temperature: 0,
        maxTokens: 2048,
        cachedSystemBlocks: [],
        outputSchema: ColumnMappingResponseSchema,
      });

      if (result.parsed === null || result.parsed === undefined) {
        return null;
      }

      // The runner already ran one corrective retry against the Zod schema.
      // Re-validate here so the return type narrows to ColumnMappingResponse
      // and we never propagate a partially-valid blob downstream.
      const validated = ColumnMappingResponseSchema.safeParse(result.parsed);
      if (!validated.success) {
        logger.warn(
          "[pms-mapping-inference] schema invalid after retry; returning null"
        );
        return null;
      }
      return validated.data;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(`[pms-mapping-inference] runAgent threw: ${message}`);
      return null;
    }
  })();

  let timeoutHandle: NodeJS.Timeout | null = null;
  const timeoutPromise = new Promise<null>((resolve) => {
    timeoutHandle = setTimeout(() => {
      logger.warn(
        `[pms-mapping-inference] timeout after ${INFERENCE_TIMEOUT_MS}ms`
      );
      resolve(null);
    }, INFERENCE_TIMEOUT_MS);
  });

  try {
    return await Promise.race([inferencePromise, timeoutPromise]);
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }
}
