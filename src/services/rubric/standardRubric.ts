/**
 * The Standard — Runtime Principle Rubric v1 engine.
 *
 * Single exported entry: score(content, context) → ScoreResult.
 *
 * - Loads the rubric from Notion (cached 24h with stale-while-revalidate) and
 *   falls back to a local copy if Notion is unavailable.
 * - Calls Sonnet 4 as LLM-as-judge with structured JSON output, temperature 0.2.
 *   (Model alias 'claude-sonnet-4-7' is the product intent — the SDK constant
 *   resolves to the latest Sonnet in this codebase's @anthropic-ai/sdk, so we
 *   pass the exact id used elsewhere in the repo to avoid model-not-found.)
 * - Returns composite 0-100, per-dimension breakdown, and repair instructions
 *   the caller can inject into a retry system prompt.
 *
 * Cache strategy: 24h TTL with stale-while-revalidate. A call during the
 * staleness window returns the stale entry immediately and kicks off a
 * background refresh. Pattern matches the existing siteQa/llm.ts discipline:
 * a failed judge call MUST NOT block a publish — it returns the last-good
 * score with a degraded flag, never a hard error.
 */

import Anthropic from "@anthropic-ai/sdk";
import { prependSubstrate } from "../prompt/alloroSubstrate";
import { buildFallbackConfig } from "./localFallback";
import { loadRubricFromNotion } from "./notionLoader";
import type {
  DimensionResult,
  DimensionSpec,
  ModeWeights,
  RepairInstruction,
  RubricConfig,
  ScoreResult,
  ScoringContext,
  ScoringMode,
} from "./types";

export const RUBRIC_JUDGE_MODEL = "claude-sonnet-4-20250514";
const JUDGE_TEMPERATURE = 0.2;
const JUDGE_MAX_TOKENS = 2000;

const RUBRIC_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const RUBRIC_STALE_GRACE_MS = 24 * 60 * 60 * 1000; // additional 24h stale-while-revalidate grace

interface RubricCacheEntry {
  config: RubricConfig;
  fetchedAt: number;
  warning?: string;
}

let rubricCache: RubricCacheEntry | null = null;
let inflightRefresh: Promise<void> | null = null;

let anthropicClient: Anthropic | null = null;
function getAnthropic(): Anthropic {
  if (!anthropicClient) anthropicClient = new Anthropic();
  return anthropicClient;
}

async function refreshRubric(): Promise<void> {
  if (inflightRefresh) return inflightRefresh;
  inflightRefresh = (async () => {
    const { config, warning } = await loadRubricFromNotion();
    rubricCache = { config, fetchedAt: Date.now(), warning };
    if (warning) {
      console.warn(`[STANDARD-RUBRIC] ${warning}`);
    }
  })().finally(() => {
    inflightRefresh = null;
  });
  return inflightRefresh;
}

/**
 * Returns the current rubric config. Applies 24h TTL with stale-while-
 * revalidate: if a cached entry is within the TTL, return it. If it is stale
 * but within grace, return stale and kick off a background refresh. If there
 * is no cache at all, synchronously load (first call path).
 */
export async function getRubricConfig(): Promise<RubricConfig> {
  const now = Date.now();
  if (!rubricCache) {
    // Cold start — synchronous load required.
    await refreshRubric();
  } else if (now - rubricCache.fetchedAt > RUBRIC_CACHE_TTL_MS) {
    if (now - rubricCache.fetchedAt > RUBRIC_CACHE_TTL_MS + RUBRIC_STALE_GRACE_MS) {
      // Exceeded stale grace — force fresh load.
      await refreshRubric();
    } else {
      // Within stale grace — return stale, refresh in background.
      void refreshRubric();
    }
  }
  return rubricCache?.config ?? buildFallbackConfig();
}

/** Test hook. Clears cache so the next score() reloads from Notion/fallback. */
export function _resetRubricCache(): void {
  rubricCache = null;
}

/** Test hook. Seed the cache with a specific config, skipping network. */
export function _seedRubricCache(config: RubricConfig): void {
  rubricCache = { config, fetchedAt: Date.now() };
}

// ─────────────────────────────────────────────────────────────────────
// Judge prompt
// ─────────────────────────────────────────────────────────────────────

function buildJudgePrompt(
  content: string,
  context: ScoringContext,
  config: RubricConfig
): { system: string; user: string } {
  const modeWeights = config.modeWeights[context.mode] ?? config.modeWeights.runtime;
  const md = context.metadata ?? {};

  const dimensions = [config.metaDimension, ...config.subDimensions];

  const applicable = dimensions.filter((d) => {
    if (d.patientFacingOnly && context.mode === "runtime") return false;
    return true;
  });

  const dimensionListing = applicable
    .map((d) => {
      const weight = modeWeights.dimensionWeights[d.key] ?? 1.0;
      const passHint = d.isPass ? " [pass-gate: score 0 or max, no middle]" : "";
      const naHint = d.redistributeOnNa
        ? " [may be N/A — mark na=true if this dimension doesn't apply]"
        : "";
      return `- ${d.key} (${d.name}) — max ${d.max}, weight ${weight.toFixed(2)}${passHint}${naHint}\n  ${d.description}`;
    })
    .join("\n");

  const system = `You are the judge for The Standard — Runtime Principle Rubric v1.

The meta-question, on the wall above every decision:
  "Does it make a human feel understood before it makes them feel informed?"

That is the product of Alloro, a recognition engine for small medical/dental
practices. Everything scored here serves a single human — either a practice
owner being seen by their own website, or a patient in pain trying to
decide who to trust.

Mode emphasis for this call: ${modeWeights.emphasis}

Return strict JSON only. No preamble, no trailing commentary.`;

  const metadataLines = [
    md.practice ? `Practice: ${md.practice}` : null,
    md.specialty ? `Specialty: ${md.specialty}` : null,
    md.location ? `Location: ${md.location}` : null,
    md.url ? `URL: ${md.url}` : null,
    md.patientReviewText && md.patientReviewText.length > 0
      ? `Patient review excerpts (use these to judge Patient Voice Match):\n${md.patientReviewText.slice(0, 5).map((r, i) => `  [${i + 1}] ${r.slice(0, 400)}`).join("\n")}`
      : null,
    md.competitorContext ? `Competitor context:\n${md.competitorContext.slice(0, 800)}` : null,
  ].filter(Boolean);

  const user = `Score this content against the rubric in ${context.mode.toUpperCase()} mode.

${metadataLines.length > 0 ? metadataLines.join("\n") + "\n" : ""}
Rubric dimensions:
${dimensionListing}

Content to score (truncated to 8k chars if longer):
---
${content.slice(0, 8000)}
---

Return JSON with this exact shape:
{
  "dimensions": [
    {
      "key": "<dimension_key>",
      "score": <integer 0 to max>,
      "na": <true|false>,
      "reasoning": "<one sentence, plain English, no jargon>"
    }
  ],
  "repair_instructions": [
    {
      "dimension": "<dimension_key>",
      "instruction": "<concrete, actionable rewrite guidance for the next attempt>"
    }
  ]
}

Rules:
- Every applicable dimension must appear.
- If a dimension is N/A, set na=true and score=0; reasoning explains why it doesn't apply.
- For pass-gate dimensions (never_blank, public_safe): score is either 0 (fail) or max (pass). No middle.
- repair_instructions should list the 1-4 dimensions most worth fixing. Include fear_acknowledged and patient_voice_match in repair when they're below max and the content is patient-facing.
- reasoning must be one sentence, plain English, avoid marketing language.`;

  return { system, user };
}

interface JudgeResponse {
  dimensions: Array<{
    key: string;
    score: number;
    na?: boolean;
    reasoning?: string;
  }>;
  repair_instructions?: Array<{
    dimension: string;
    instruction: string;
  }>;
}

function parseJudgeResponse(raw: string): JudgeResponse | null {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]);
    if (!parsed || !Array.isArray(parsed.dimensions)) return null;
    return parsed as JudgeResponse;
  } catch {
    return null;
  }
}

async function callJudge(
  content: string,
  context: ScoringContext,
  config: RubricConfig
): Promise<JudgeResponse | null> {
  // Fast-fail when no API key is configured: skip the network round-trip
  // entirely and let the caller return a degraded ScoreResult. This is the
  // adaptability contract — the engine keeps running (composite 0) so
  // callers can finish their pipeline in shadow mode without timing out.
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn("[STANDARD-RUBRIC] ANTHROPIC_API_KEY missing — judge skipped.");
    return null;
  }
  try {
    const { system, user } = buildJudgePrompt(content, context, config);
    const response = await getAnthropic().messages.create({
      model: RUBRIC_JUDGE_MODEL,
      max_tokens: JUDGE_MAX_TOKENS,
      temperature: JUDGE_TEMPERATURE,
      system: prependSubstrate(system),
      messages: [{ role: "user", content: user }],
    });
    const text = response.content[0]?.type === "text" ? response.content[0].text : "";
    return parseJudgeResponse(text);
  } catch (err: any) {
    console.warn(`[STANDARD-RUBRIC] Judge call failed: ${err?.message ?? "unknown"}`);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────
// Composite computation
// ─────────────────────────────────────────────────────────────────────

function applyMode(
  spec: DimensionSpec,
  modeWeights: ModeWeights
): { effectiveMax: number; weight: number } {
  const weight = modeWeights.dimensionWeights[spec.key] ?? 1.0;
  return { effectiveMax: spec.max * weight, weight };
}

function computeComposite(
  dimensionResults: DimensionResult[],
  mode: ScoringMode
): number {
  // Composite = sum(scored points) * 100 / sum(max scored points).
  // N/A and pass_gate do not alter the numerator (pass is neutral,
  // fail gate contributes 0). N/A removes from denominator (redistributes).
  let num = 0;
  let den = 0;
  for (const d of dimensionResults) {
    if (d.verdict === "n_a") continue;
    if (d.verdict === "pass_gate") {
      // Passing a pass-gate is neutral. It removes the dimension from
      // both sides (it's a guard, not a contributor).
      continue;
    }
    if (d.verdict === "fail_gate") {
      // Hard fail on a pass-gate (HIPAA/CAN-SPAM) — counts against composite.
      num += 0;
      den += d.max;
      continue;
    }
    num += d.score;
    den += d.max;
  }
  if (den === 0) return 0;
  const raw = (num / den) * 100;
  // CRO mode at the composite level: if fear_acknowledged is 0 on patient-
  // facing copy, clamp composite ceiling to 65 regardless of other scores.
  // Anxious patients won't convert on copy that doesn't see them first.
  if (mode === "cro") {
    const fear = dimensionResults.find((d) => d.name.startsWith("Fear"));
    if (fear && fear.verdict === "scored" && fear.score === 0) {
      return Math.min(raw, 65);
    }
  }
  return Math.round(raw);
}

function synthesizeResult(
  config: RubricConfig,
  context: ScoringContext,
  parsed: JudgeResponse | null
): ScoreResult {
  const modeWeights = config.modeWeights[context.mode] ?? config.modeWeights.runtime;
  const allSpecs = [config.metaDimension, ...config.subDimensions];
  const applicable = allSpecs.filter((d) => {
    if (d.patientFacingOnly && context.mode === "runtime") return false;
    return true;
  });

  const dimensionsMap: Record<string, DimensionResult> = {};

  for (const spec of applicable) {
    const judged = parsed?.dimensions.find((d) => d.key === spec.key);

    if (!judged) {
      // Judge didn't report this dimension — safe default is scored 0 with
      // a "missing" reasoning so it still counts against the composite.
      dimensionsMap[spec.key] = {
        name: spec.name,
        score: 0,
        max: spec.max,
        verdict: "scored",
        reasoning: "Judge did not report this dimension; defaulting to 0.",
      };
      continue;
    }

    if (judged.na && spec.redistributeOnNa) {
      dimensionsMap[spec.key] = {
        name: spec.name,
        score: 0,
        max: spec.max,
        verdict: "n_a",
        reasoning: judged.reasoning ?? "Not applicable to this output.",
      };
      continue;
    }

    if (spec.isPass) {
      const scoreInt = Math.max(0, Math.min(spec.max, Math.round(judged.score)));
      const passed = scoreInt >= spec.max;
      dimensionsMap[spec.key] = {
        name: spec.name,
        score: passed ? spec.max : 0,
        max: spec.max,
        verdict: passed ? "pass_gate" : "fail_gate",
        reasoning: judged.reasoning ?? (passed ? "Pass." : "Fail."),
      };
      continue;
    }

    const scoreInt = Math.max(0, Math.min(spec.max, Math.round(judged.score)));
    dimensionsMap[spec.key] = {
      name: spec.name,
      score: scoreInt,
      max: spec.max,
      verdict: "scored",
      reasoning: judged.reasoning ?? "(no reasoning returned)",
    };
  }

  // Apply mode weight: scale each scored dim's (score, max) by its weight.
  // This preserves the rubric shape while biasing the composite.
  const weighted: DimensionResult[] = Object.values(dimensionsMap).map((d) => {
    const spec = applicable.find((s) => s.name === d.name);
    if (!spec) return d;
    const weight = modeWeights.dimensionWeights[spec.key] ?? 1.0;
    if (d.verdict !== "scored") return d;
    return {
      ...d,
      score: Math.round(d.score * weight * 10) / 10,
      max: Math.round(spec.max * weight * 10) / 10,
    };
  });

  const composite = computeComposite(weighted, context.mode);

  const repair_instructions: RepairInstruction[] = Array.isArray(parsed?.repair_instructions)
    ? parsed!.repair_instructions
        .filter((r) => r && typeof r.instruction === "string" && typeof r.dimension === "string")
        .map((r) => ({ dimension: r.dimension, instruction: r.instruction }))
    : [];

  return {
    composite,
    dimensions: dimensionsMap,
    repair_instructions,
    rubric_version_id: config.versionId,
    mode: context.mode,
    judge_model: RUBRIC_JUDGE_MODEL,
    loaded_from: config.source,
    scored_at: new Date().toISOString(),
  };
}

// ─────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────

/**
 * Score content against The Standard in the given mode. Returns a composite
 * 0-100, per-dimension breakdown, and repair instructions the caller can
 * inject into a retry.
 *
 * Never throws on transport error — a failed judge call returns a degraded
 * ScoreResult with composite=0 and a repair_instruction noting the failure.
 * The calling gate decides whether to retry or escalate.
 */
export async function score(
  content: string,
  context: ScoringContext
): Promise<ScoreResult> {
  const config = await getRubricConfig();
  const parsed = await callJudge(content, context, config);
  if (!parsed) {
    // Degraded — judge unreachable or parse failed.
    return {
      composite: 0,
      dimensions: {},
      repair_instructions: [
        {
          dimension: "system",
          instruction:
            "Judge call failed. Retry scoring, then if persistent escalate as dream_team_task.",
        },
      ],
      rubric_version_id: config.versionId,
      mode: context.mode,
      judge_model: RUBRIC_JUDGE_MODEL,
      loaded_from: config.source,
      scored_at: new Date().toISOString(),
    };
  }
  return synthesizeResult(config, context, parsed);
}

export type { ScoreResult, ScoringContext, ScoringMode } from "./types";
