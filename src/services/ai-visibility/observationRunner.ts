import logger from "../../lib/logger";
import { AiVisibilityObservationModel } from "../../models/AiVisibilityObservationModel";
import { detectAppearance } from "./appearanceDetector";
import { buildPromptSet } from "./promptSetBuilder";
import { getConfiguredAdapters, KNOWN_ENGINES } from "./registry";
import { PracticeIdentity } from "./types";

/** Max chars of an engine answer kept as raw_excerpt (audit trail, not full dump). */
const RAW_EXCERPT_MAX = 4000;

export interface RunVisibilityInput {
  organizationId: number;
  locationId: number;
  category: string;
  city: string;
  identity: PracticeIdentity;
  /** Run day "YYYY-MM-DD" — part of the idempotency key. Caller supplies (no hidden clock). */
  runDate: string;
  observedAt: Date;
}

export interface RunVisibilitySummary {
  /** Engines that recorded at least one observation. */
  enginesRun: string[];
  /** Engines that were configured (had a key) but every reading failed. */
  failedEngines: string[];
  /** Engines not configured (no key) — never attempted. */
  skippedEngines: string[];
  promptsRun: number;
  observationsRecorded: number;
}

/**
 * Run the prompt set against every CONFIGURED engine, detect appearance, and
 * persist an observation per (location, prompt, engine, run_date). An
 * observation log — never a score, never a rank. A single engine or prompt
 * failure is isolated (logged, skipped) and never fails the whole run. The
 * summary honestly separates ran / failed / skipped so a totally-failed engine
 * is never reported as a real run.
 */
export async function runAiVisibilityObservation(
  input: RunVisibilityInput
): Promise<RunVisibilitySummary> {
  const prompts = buildPromptSet({ category: input.category, city: input.city });
  if (prompts.length === 0) {
    logger.warn(
      { locationId: input.locationId },
      "[AI-VISIBILITY] no category/city — skipping (cannot build a prompt)"
    );
    return {
      enginesRun: [],
      failedEngines: [],
      skippedEngines: KNOWN_ENGINES,
      promptsRun: 0,
      observationsRecorded: 0,
    };
  }

  const adapters = getConfiguredAdapters();
  const recordedByEngine = new Map<string, number>();
  let observationsRecorded = 0;

  for (const adapter of adapters) {
    if (!recordedByEngine.has(adapter.engine)) {
      recordedByEngine.set(adapter.engine, 0);
    }
    for (const prompt of prompts) {
      try {
        const raw = await adapter.query(prompt);
        const detection = detectAppearance(raw, input.identity);
        await AiVisibilityObservationModel.record({
          organizationId: input.organizationId,
          locationId: input.locationId,
          engine: adapter.engine,
          captureMethod: raw.captureMethod,
          promptKey: prompt.key,
          promptText: prompt.text,
          mentioned: detection.mentioned,
          cited: detection.cited,
          citedSource: detection.citedSource,
          position: detection.position,
          rawExcerpt: (raw.answerText ?? "").slice(0, RAW_EXCERPT_MAX),
          runDate: input.runDate,
          observedAt: input.observedAt,
        });
        recordedByEngine.set(
          adapter.engine,
          (recordedByEngine.get(adapter.engine) ?? 0) + 1
        );
        observationsRecorded++;
      } catch (err) {
        logger.warn(
          {
            engine: adapter.engine,
            promptKey: prompt.key,
            err: (err as Error)?.message,
          },
          "[AI-VISIBILITY] engine query failed — skipping this reading"
        );
      }
    }
  }

  const configuredEngines = adapters.map((a) => a.engine);
  const enginesRun = configuredEngines.filter(
    (e) => (recordedByEngine.get(e) ?? 0) > 0
  );
  const failedEngines = configuredEngines.filter(
    (e) => (recordedByEngine.get(e) ?? 0) === 0
  );
  const skippedEngines = KNOWN_ENGINES.filter(
    (e) => !configuredEngines.includes(e)
  );

  logger.info(
    {
      checker: "ai-visibility",
      locationId: input.locationId,
      enginesRun,
      failedEngines,
      skippedEngines,
      promptsRun: prompts.length,
      observationsRecorded,
    },
    "[AI-VISIBILITY] observation run complete"
  );

  return {
    enginesRun,
    failedEngines,
    skippedEngines,
    promptsRun: prompts.length,
    observationsRecorded,
  };
}
