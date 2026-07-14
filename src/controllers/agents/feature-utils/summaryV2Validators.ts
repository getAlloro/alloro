/** Summary v2 post-Zod evidence and highlight validators. */

import { log } from "./agentLogger";
import type {
  DomainSummary,
  SummaryV2Output,
  SupportingMetric,
} from "../types/agent-output-schemas";
import type { DashboardMetrics } from "../../../utils/dashboard-metrics/types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseComparableNumber(value: string): number | null {
  const numericText = value.replace(/[^\d.\-]/g, "");
  if (!/\d/.test(numericText)) return null;
  const parsed = Number(numericText);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Walk a dotted path and return undefined for a missing segment. */
export function lookupDottedPath(obj: unknown, path: string): unknown {
  if (!path) return undefined;
  let current: unknown = obj;
  for (const key of path.split(".")) {
    if (!isRecord(current)) return undefined;
    current = current[key];
  }
  return current;
}

/** Compare agent display text with its deterministic dictionary value. */
export function metricValuesMatch(
  metricValue: string,
  dictValue: unknown
): boolean {
  if (dictValue === null || dictValue === undefined) return true;

  const dictString = String(dictValue).trim();
  const metricString = metricValue.trim();
  if (dictString === metricString) return true;

  const dictNumber = parseComparableNumber(dictString);
  const metricNumber = parseComparableNumber(metricString);
  if (dictNumber !== null && metricNumber !== null) {
    if (dictNumber === metricNumber) return true;
    const denominator = Math.max(
      Math.abs(dictNumber),
      Math.abs(metricNumber),
      1
    );
    if (Math.abs(dictNumber - metricNumber) / denominator <= 0.01) return true;
  }

  const normalizedDict = normalizeText(dictString);
  const normalizedMetric = normalizeText(metricString);
  return (
    normalizedDict === normalizedMetric ||
    (normalizedDict.length > 0 && normalizedMetric.includes(normalizedDict)) ||
    (normalizedMetric.length > 0 && normalizedDict.includes(normalizedMetric))
  );
}

function validateMetricList(
  evidence: SupportingMetric[],
  prefix: string,
  metrics: DashboardMetrics,
  errors: string[]
): void {
  evidence.forEach((metric, index) => {
    const path = `${prefix}.supporting_metrics[${index}]`;
    const dictionaryValue = lookupDottedPath(metrics, metric.source_field);
    if (dictionaryValue === undefined) {
      errors.push(`${path}: source_field "${metric.source_field}" was not found`);
      return;
    }
    if (!metricValuesMatch(metric.value, dictionaryValue)) {
      errors.push(
        `${path}: value "${metric.value}" does not match dashboard_metrics.${metric.source_field}`
      );
    }
  });
}

function containsValue(detail: string, value: string | number): boolean {
  if (typeof value === "string") {
    return normalizeText(detail).includes(normalizeText(value));
  }
  const candidates = [String(value), value.toLocaleString("en-US")];
  return candidates.some((candidate) => detail.includes(candidate));
}

function getChoosableReviewSummaries(
  summaries: DomainSummary[]
): DomainSummary[] {
  return summaries.filter(
    (summary) =>
      summary.domain === "review" &&
      summary.supporting_metrics?.some((metric) =>
        metric.source_field.startsWith("choosable.")
      )
  );
}

function validateRequiredChoosableEvidence(
  summary: DomainSummary,
  metrics: DashboardMetrics,
  errors: string[]
): void {
  const evidence = summary.supporting_metrics ?? [];
  const requiredSources = [
    "choosable.practice_review_count",
    "choosable.strongest_competitor_name",
    "choosable.strongest_competitor_review_count",
  ];
  requiredSources.forEach((source) => {
    if (!evidence.some((metric) => metric.source_field === source)) {
      errors.push(`domain_summaries.review: missing required evidence ${source}`);
    }
  });

  const choosable = metrics.choosable;
  if (
    choosable.strongest_competitor_name &&
    !containsValue(summary.detail, choosable.strongest_competitor_name)
  ) {
    errors.push("domain_summaries.review: detail omits the strongest competitor name");
  }
  [
    choosable.practice_review_count,
    choosable.strongest_competitor_review_count,
  ].forEach((value) => {
    if (value !== null && !containsValue(summary.detail, value)) {
      errors.push(`domain_summaries.review: detail omits grounded count ${value}`);
    }
  });
}

function validateChoosableWording(
  summary: DomainSummary,
  metrics: DashboardMetrics,
  errors: string[]
): void {
  const detail = summary.detail.toLowerCase();
  if (
    metrics.choosable.has_most_reviews === false &&
    /\b(you|your practice) (lead|leads|have the most reviews)\b/.test(detail)
  ) {
    errors.push("domain_summaries.review: claims leadership without the most reviews");
  }
  if (
    metrics.choosable.has_most_reviews === true &&
    /(close|closing) the gap|\bbehind\b|\btrails?\b/.test(detail)
  ) {
    errors.push("domain_summaries.review: claims a gap while the practice has the most reviews");
  }
  if (
    metrics.choosable.is_at_or_above_review_median === true &&
    /below (the )?(median|average)/.test(detail)
  ) {
    errors.push("domain_summaries.review: contradicts the review median");
  }
}

function validateChoosableSummary(
  output: SummaryV2Output,
  metrics: DashboardMetrics,
  errors: string[]
): void {
  const summaries = getChoosableReviewSummaries(output.domain_summaries ?? []);
  const choosable = metrics.choosable;
  if (choosable.source_status !== "ready") {
    if (summaries.length > 0) {
      errors.push("domain_summaries.review: Choosable evidence used when source is not ready");
    }
    return;
  }

  const hasRequiredValues =
    choosable.practice_review_count !== null &&
    choosable.strongest_competitor_name !== null &&
    choosable.strongest_competitor_review_count !== null;
  if (!hasRequiredValues) return;
  if (summaries.length !== 1) {
    errors.push("domain_summaries.review: exactly one grounded Choosable summary is required");
    return;
  }

  validateRequiredChoosableEvidence(summaries[0], metrics, errors);
  validateChoosableWording(summaries[0], metrics, errors);
}

/** Validate top-action and domain-summary evidence against dashboard metrics. */
export function validateSummarySupportingMetrics(
  output: SummaryV2Output,
  metrics: DashboardMetrics | null
): void {
  if (!metrics) {
    log("  [summary-v2] No dashboard_metrics available; skipping value validator");
    return;
  }

  const errors: string[] = [];
  output.top_actions.forEach((action, index) => {
    validateMetricList(
      action.supporting_metrics,
      `top_actions[${index}]`,
      metrics,
      errors
    );
  });
  (output.domain_summaries ?? []).forEach((summary, index) => {
    if (summary.supporting_metrics) {
      validateMetricList(
        summary.supporting_metrics,
        `domain_summaries[${index}]`,
        metrics,
        errors
      );
    }
  });
  validateChoosableSummary(output, metrics, errors);

  if (errors.length > 0) {
    const message = `Summary v2 supporting_metrics validator failed:\n  - ${errors.join("\n  - ")}`;
    log(`  [summary-v2] ${message}`);
    throw new Error(message);
  }
}

/** Warn when a highlight is not a verbatim rationale substring. */
export function validateSummaryHighlights(output: SummaryV2Output): void {
  const warnings: string[] = [];
  output.top_actions.forEach((action, actionIndex) => {
    action.highlights?.forEach((phrase, highlightIndex) => {
      if (!action.rationale.includes(phrase)) {
        warnings.push(
          `top_actions[${actionIndex}].highlights[${highlightIndex}]: "${phrase}" is not in rationale`
        );
      }
    });
  });
  if (warnings.length > 0) {
    log(`  [summary-v2] Highlights mismatches:\n  - ${warnings.join("\n  - ")}`);
  }
}
