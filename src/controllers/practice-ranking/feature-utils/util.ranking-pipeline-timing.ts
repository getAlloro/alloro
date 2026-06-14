/**
 * Ranking Pipeline Timing Utilities
 *
 * Per-step timing records for the ranking pipeline. Extracted verbatim from
 * service.ranking-pipeline.ts so individual stage modules can record their own
 * timings without depending on the orchestrator.
 *
 * Behavior-preserving: identical record shape, ISO timestamps, and duration math.
 */

export type PipelineTimingOutcome = "success" | "failed" | "skipped";

export interface PipelineTimingRecord {
  step: string;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  outcome: PipelineTimingOutcome;
  detail?: string;
}

export interface ActivePipelineTiming {
  step: string;
  startedAt: Date;
  startedAtMs: number;
}

export function beginPipelineTiming(step: string): ActivePipelineTiming {
  return {
    step,
    startedAt: new Date(),
    startedAtMs: Date.now(),
  };
}

export function finishPipelineTiming(
  timings: PipelineTimingRecord[],
  active: ActivePipelineTiming,
  outcome: PipelineTimingOutcome = "success",
  detail?: string,
): void {
  timings.push({
    step: active.step,
    startedAt: active.startedAt.toISOString(),
    endedAt: new Date().toISOString(),
    durationMs: Date.now() - active.startedAtMs,
    outcome,
    ...(detail ? { detail } : {}),
  });
}
