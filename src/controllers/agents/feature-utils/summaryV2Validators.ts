/**
 * Summary v2 Post-Zod Validators (Plan 1 T10)
 *
 * Pure validation helpers for Summary v2 agent output. Split out of
 * service.agent-orchestrator.ts in the decomposition pass — behavior identical.
 *
 * - validateSummarySupportingMetrics THROWS on mismatch (triggers the
 *   orchestrator's outer 3-attempt retry, with the error message included so
 *   the model can self-correct).
 * - validateSummaryHighlights warns only (the frontend's HighlightedText
 *   component silently drops unmatched highlights at render time).
 */

import { log } from "./agentLogger";
import type { SummaryV2Output } from "../types/agent-output-schemas";
import type { DashboardMetrics } from "../../../utils/dashboard-metrics/types";

/**
 * Walk a dotted path on an object. `lookupDottedPath({a: {b: 1}}, "a.b") === 1`.
 * Returns undefined for any missing segment.
 */
export function lookupDottedPath(obj: any, path: string): any {
  if (!obj || !path) return undefined;
  return path.split(".").reduce((acc, key) => {
    if (acc === null || acc === undefined) return undefined;
    return acc[key];
  }, obj);
}

/**
 * Compare a Summary supporting_metric's `value` (string from agent) against
 * the dashboard_metrics dictionary value at `source_field`. Tolerant matching,
 * in order:
 *   1. exact string equality after trim
 *   2. numeric equivalence — strip non-numeric chars from BOTH sides, accept
 *      strict equality OR within 1% relative tolerance. Handles human-readable
 *      rounding ("$365,747" for 365747.01, "0.33" for 0.328…, "33%" for 33.33).
 *   3. string normalization — case-insensitive, underscores/dashes ↔ spaces,
 *      whitespace collapsed. Handles "GBP activity" ≈ "gbp_activity".
 *   4. substring after normalization (e.g. "#4 of 28" includes "4")
 *
 * Honors the prompt's stated contract: "Numeric equivalence counts
 * ($48,420 == 48420), but you cannot invent." The previous implementation
 * only stripped the metric side and used strict ===, which rejected any
 * decimal residue and any case/underscore variation.
 */
export function metricValuesMatch(metricValue: string, dictValue: any): boolean {
  if (dictValue === null || dictValue === undefined) {
    // null/undefined dict value — accept any agent value (the agent may legitimately
    // report "0" or "—" when the underlying metric is absent).
    return true;
  }

  const dictStr = String(dictValue).trim();
  const metricStr = metricValue.trim();

  if (dictStr === metricStr) return true;

  // Numeric: strip non-numeric chars from both sides, then compare with
  // 1% relative tolerance. Stricter denominators avoid div-by-zero and
  // asymmetric tolerance for small values.
  const stripNonNumeric = (s: string): string => s.replace(/[^\d.\-]/g, "");
  const dictNum = Number(stripNonNumeric(dictStr));
  const metricNum = Number(stripNonNumeric(metricStr));
  if (!Number.isNaN(dictNum) && !Number.isNaN(metricNum)) {
    if (dictNum === metricNum) return true;
    const denom = Math.max(Math.abs(dictNum), Math.abs(metricNum), 1);
    if (Math.abs(dictNum - metricNum) / denom <= 0.01) return true;
  }

  // String normalization: lowercase, underscores/hyphens to spaces,
  // collapse whitespace. Then exact + substring.
  const normalize = (s: string): string =>
    s.toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  const dictNorm = normalize(dictStr);
  const metricNorm = normalize(metricStr);
  if (dictNorm === metricNorm) return true;
  if (
    dictNorm.length > 0 &&
    metricNorm.length > 0 &&
    (dictNorm.includes(metricNorm) || metricNorm.includes(dictNorm))
  ) {
    return true;
  }

  return false;
}

/**
 * Plan 1 T10 post-Zod validator. Walks every
 * `top_actions[i].supporting_metrics[j].source_field` against the
 * dashboard_metrics dictionary. Throws on mismatch (which triggers the
 * orchestrator's outer 3-attempt retry, with the error message included
 * so the model can self-correct).
 *
 * If the metrics dictionary is null (computeDashboardMetrics failed),
 * the validator is skipped — Summary still ran with whatever input was
 * available; we don't want to block it on metrics infrastructure.
 */
export function validateSummarySupportingMetrics(
  output: SummaryV2Output,
  metrics: DashboardMetrics | null,
): void {
  if (!metrics) {
    log(`  [summary-v2] ⚠ No dashboard_metrics available — skipping value validator`);
    return;
  }

  const errors: string[] = [];
  output.top_actions.forEach((action, i) => {
    action.supporting_metrics.forEach((metric, j) => {
      const dictValue = lookupDottedPath(metrics, metric.source_field);
      if (dictValue === undefined) {
        errors.push(
          `top_actions[${i}].supporting_metrics[${j}]: source_field "${metric.source_field}" not found in dashboard_metrics dictionary`,
        );
        return;
      }
      if (!metricValuesMatch(metric.value, dictValue)) {
        errors.push(
          `top_actions[${i}].supporting_metrics[${j}]: value "${metric.value}" doesn't match dashboard_metrics.${metric.source_field} = ${JSON.stringify(dictValue)}`,
        );
      }
    });
  });

  if (errors.length > 0) {
    const msg = `Summary v2 supporting_metrics validator failed:\n  - ${errors.join("\n  - ")}`;
    log(`  [summary-v2] ⚠ ${msg}`);
    throw new Error(msg);
  }
}

/**
 * Plan 1 T10 highlights validator. Each `highlights[i]` must be a contiguous
 * substring of the action's `rationale`. Mismatches are logged as warnings
 * but do NOT throw — the frontend's HighlightedText component will silently
 * drop unmatched highlights at render time, so this is a soft signal.
 */
export function validateSummaryHighlights(output: SummaryV2Output): void {
  const warnings: string[] = [];
  output.top_actions.forEach((action, i) => {
    if (!action.highlights || action.highlights.length === 0) return;
    action.highlights.forEach((phrase, j) => {
      if (!action.rationale.includes(phrase)) {
        warnings.push(
          `top_actions[${i}].highlights[${j}]: "${phrase}" not found verbatim in rationale; will be dropped at render time`,
        );
      }
    });
  });
  if (warnings.length > 0) {
    log(`  [summary-v2] ⚠ Highlights mismatches:\n  - ${warnings.join("\n  - ")}`);
  }
}
