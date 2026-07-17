import logger from "../../lib/logger";
import { AiVisibilityObservationModel } from "../../models/AiVisibilityObservationModel";
import { detectAppearance } from "./appearanceDetector";
import { buildPromptSet } from "./promptSetBuilder";
import { getConfiguredAdapters, KNOWN_ENGINES } from "./registry";
import {
  AiVisibilityEngineAdapter,
  EnginePrompt,
  EngineRawResult,
  PracticeIdentity,
} from "./types";

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
  /** Engines that completed at least one reading (a new row OR an existing one). */
  enginesRun: string[];
  /** Engines that were configured (had a key) but every reading failed. */
  failedEngines: string[];
  /** Engines not configured (no key) — never attempted. */
  skippedEngines: string[];
  promptsRun: number;
  /** Readings that completed end-to-end: new inserts + idempotent duplicates. */
  observationsProcessed: number;
  /**
   * NEW rows actually inserted. EXCLUDES conflicts the model ignored, so a
   * same-day re-run reports what it truly captured (0) rather than restating the
   * full set as if it were fresh.
   */
  observationsRecorded: number;
  /** Readings whose row already existed for this (location, prompt, engine, run_date). */
  duplicateObservations: number;
}

/**
 * The outcome of ONE reading. `duplicate` means the engine answered and the row
 * already existed for this run_date — the reading SUCCEEDED, it just wrote
 * nothing new, so it must not be counted as a fresh observation NOR as a failure.
 */
type ReadingOutcome = "recorded" | "duplicate" | "query_failed";

/**
 * One reading: query the engine, detect, persist.
 *
 * The two failure boundaries are deliberately SEPARATE (§3.2) because they are
 * different kinds of event and cannot share a handler:
 *
 * - A PROVIDER failure is a third-party fact of life. It is logged, this reading
 *   is skipped, and the run continues — one flaky engine never costs the others.
 * - A PERSISTENCE failure is OUR OWN database failing. It is not a reading
 *   failure and must never be reported as one: it is logged with context and
 *   RE-THROWN, so the caller sees a real error instead of a run that resolves
 *   "successfully" while having stored nothing.
 */
async function recordOneReading(
  adapter: AiVisibilityEngineAdapter,
  prompt: EnginePrompt,
  input: RunVisibilityInput
): Promise<ReadingOutcome> {
  // Boundary 1 — the PROVIDER. Isolated: logged, skipped, run continues.
  let raw: EngineRawResult;
  try {
    raw = await adapter.query(prompt);
  } catch (err) {
    logger.warn(
      {
        engine: adapter.engine,
        promptKey: prompt.key,
        locationId: input.locationId,
        err: (err as Error)?.message,
      },
      "[AI-VISIBILITY] engine query failed — skipping this reading"
    );
    return "query_failed";
  }

  const detection = detectAppearance(raw, input.identity);

  // Boundary 2 — PERSISTENCE. Logged with context, then re-thrown (never
  // swallowed, never relabelled as an engine failure).
  try {
    const inserted = await AiVisibilityObservationModel.record({
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
    return inserted ? "recorded" : "duplicate";
  } catch (err) {
    logger.error(
      {
        engine: adapter.engine,
        promptKey: prompt.key,
        organizationId: input.organizationId,
        locationId: input.locationId,
        runDate: input.runDate,
        err: (err as Error)?.message,
      },
      "[AI-VISIBILITY] observation persistence failed — aborting the run"
    );
    throw err;
  }
}

/**
 * Run the prompt set against every CONFIGURED engine, detect appearance, and
 * persist an observation per (location, prompt, engine, run_date). An
 * observation log — never a score, never a rank. A single ENGINE or prompt
 * failure is isolated (logged, skipped) and never fails the whole run; a
 * DATABASE failure propagates (see recordOneReading). The summary honestly
 * separates ran / failed / skipped so a totally-failed engine is never reported
 * as a real run, and separates new inserts from idempotent duplicates so a
 * re-run never overstates what was captured.
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
      observationsProcessed: 0,
      observationsRecorded: 0,
      duplicateObservations: 0,
    };
  }

  const adapters = getConfiguredAdapters();
  // Readings that COMPLETED (recorded or duplicate) — this, not the insert
  // count, decides ran-vs-failed, so an idempotent re-run that inserts nothing
  // is still an engine that ran, not an engine that failed.
  const readingsByEngine = new Map<string, number>();
  let observationsRecorded = 0;
  let duplicateObservations = 0;

  for (const adapter of adapters) {
    if (!readingsByEngine.has(adapter.engine)) {
      readingsByEngine.set(adapter.engine, 0);
    }
    for (const prompt of prompts) {
      const outcome = await recordOneReading(adapter, prompt, input);
      if (outcome === "query_failed") continue;
      readingsByEngine.set(
        adapter.engine,
        (readingsByEngine.get(adapter.engine) ?? 0) + 1
      );
      if (outcome === "recorded") observationsRecorded++;
      else duplicateObservations++;
    }
  }

  const configuredEngines = adapters.map((a) => a.engine);
  const enginesRun = configuredEngines.filter(
    (e) => (readingsByEngine.get(e) ?? 0) > 0
  );
  const failedEngines = configuredEngines.filter(
    (e) => (readingsByEngine.get(e) ?? 0) === 0
  );
  const skippedEngines = KNOWN_ENGINES.filter(
    (e) => !configuredEngines.includes(e)
  );
  const observationsProcessed = observationsRecorded + duplicateObservations;

  logger.info(
    {
      checker: "ai-visibility",
      locationId: input.locationId,
      enginesRun,
      failedEngines,
      skippedEngines,
      promptsRun: prompts.length,
      observationsProcessed,
      observationsRecorded,
      duplicateObservations,
    },
    "[AI-VISIBILITY] observation run complete"
  );

  return {
    enginesRun,
    failedEngines,
    skippedEngines,
    promptsRun: prompts.length,
    observationsProcessed,
    observationsRecorded,
    duplicateObservations,
  };
}
