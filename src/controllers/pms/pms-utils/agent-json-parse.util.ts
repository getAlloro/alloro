/**
 * Shared utility for parsing JSON from AI agent responses.
 * Tries multiple extraction strategies, then retries the AI call if needed.
 */

import { runAgent, type LlmRunnerOptions } from "../../../agents/service.llm-runner";
import logger from "../../../lib/logger";

const DEFAULT_MAX_RETRIES = 3;

/**
 * Extract JSON from a raw string using multiple strategies:
 * 1. Direct parse
 * 2. Strip markdown fences
 * 3. Brace/bracket matched extraction
 */
export function extractJsonFromText(text: string): any | null {
  const trimmed = text.trim();

  // 1. Direct parse
  try {
    return JSON.parse(trimmed);
  } catch { /* continue */ }

  // 2. Strip markdown fences
  const fenceStripped = trimmed
    .replace(/^```[\w]*\s*\n?/i, "")
    .replace(/\n?\s*```\s*$/i, "")
    .trim();
  if (fenceStripped !== trimmed) {
    try {
      return JSON.parse(fenceStripped);
    } catch { /* continue */ }
  }

  // 3. Brace/bracket matched extraction
  const startChar =
    trimmed.indexOf("{") !== -1 &&
    (trimmed.indexOf("[") === -1 || trimmed.indexOf("{") <= trimmed.indexOf("["))
      ? "{"
      : "[";
  const endChar = startChar === "{" ? "}" : "]";
  const startIdx = trimmed.indexOf(startChar);

  if (startIdx === -1) return null;

  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = startIdx; i < trimmed.length; i++) {
    const ch = trimmed[i];

    if (escape) { escape = false; continue; }
    if (ch === "\\") { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;

    if (ch === startChar) depth++;
    else if (ch === endChar) {
      depth--;
      if (depth === 0) {
        const candidate = trimmed.slice(startIdx, i + 1);
        try {
          return JSON.parse(candidate);
        } catch {
          return null;
        }
      }
    }
  }

  return null;
}

/**
 * Parse JSON from an AI agent response. If the initial response can't be parsed,
 * retries the AI call up to maxRetries times.
 *
 * @param rawText - The raw text response from the AI
 * @param agentOptions - The original runAgent options (for retries)
 * @param label - Logging label (e.g. "Analyzer", "Parser", "Sanitizer")
 * @param maxRetries - Max retry attempts (default 3)
 * @returns Parsed JSON object
 * @throws Error if all parse attempts and retries fail
 */
export async function parseAgentJson<T = any>(
  rawText: string,
  agentOptions: LlmRunnerOptions,
  label: string,
  maxRetries: number = DEFAULT_MAX_RETRIES
): Promise<T> {
  // Try parsing the initial response
  const initial = extractJsonFromText(rawText);
  if (initial !== null) return initial as T;

  logger.info(`[PMS-${label}] Initial JSON parse failed, starting retries...`);

  // Retry loop
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    logger.info(`[PMS-${label}] JSON parse retry ${attempt}/${maxRetries}...`);

    const retryResult = await runAgent(agentOptions);

    logger.info(
      `[PMS-${label}] Retry ${attempt} response: ${retryResult.inputTokens} in / ${retryResult.outputTokens} out`
    );

    // Try runAgent's built-in parsed result first
    if (retryResult.parsed !== null) {
      logger.info(`[PMS-${label}] Retry ${attempt} parsed via runAgent`);
      return retryResult.parsed as T;
    }

    // Try our extraction strategies
    const extracted = extractJsonFromText(retryResult.raw);
    if (extracted !== null) {
      logger.info(`[PMS-${label}] Retry ${attempt} parsed via extraction`);
      return extracted as T;
    }

    logger.info(
      `[PMS-${label}] Retry ${attempt} failed. Raw (first 500 chars): ${retryResult.raw.substring(0, 500)}`
    );
  }

  throw new Error(
    `[PMS-${label}] All ${maxRetries} JSON parse retries exhausted. Could not extract valid JSON from AI response.`
  );
}
