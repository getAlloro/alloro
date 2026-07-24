/**
 * Pure copy + formatting helpers for the Owner Receipt card.
 *
 * Every helper here is honesty-gated (Value #6): an absent number becomes the
 * words "not measured", never a 0 or a dash that reads as zero; the impressions
 * trend only yields a before -> after line when the backend says the windows
 * are honestly covered; the diagnosis only names a driver when the backend says
 * it is diagnosable. No string here claims Alloro caused anything, and none tells
 * the owner to "go look" somewhere without a handled next step (banned copy).
 *
 * Kept pure and framework-free so the honesty rules are unit-testable apart from
 * React (§13.x — logic out of the view).
 */

import type {
  FunnelMovementDiagnosis,
  ImpressionsTrend,
  OwnerReceiptMetric,
  ReceiptGate,
} from "../../../api/ownerReceipt";

/** The words shown wherever a number is genuinely absent. Never "0", never "—". */
export const NOT_MEASURED = "not measured";

/** Group a real number ("27,151"); an absent value becomes the honest words. */
export function formatMetricValue(value: number | null): string {
  if (value === null) return NOT_MEASURED;
  return new Intl.NumberFormat("en-US").format(value);
}

/** A signed count for a delta ("+512", "-84"). Assumes a real number. */
export function formatSignedCount(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${new Intl.NumberFormat("en-US").format(value)}`;
}

/** A signed whole-percent for a fraction ("+18%", "-3%"). Assumes a real number. */
export function formatSignedPercent(fraction: number): string {
  const pct = Math.round(fraction * 100);
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct}%`;
}

/** ISO date/timestamp -> "Jul 24, 2026". A bad value degrades to the raw string. */
export function formatDay(iso: string | null): string {
  if (!iso) return NOT_MEASURED;
  const day = String(iso).split(/[T ]/)[0];
  const parsed = new Date(`${day}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return String(iso);
  return parsed.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** Plain owner-facing label + source note for a gate. Source stays honest. */
export function gateLabel(gate: ReceiptGate): string {
  switch (gate) {
    case "impressions":
      return "Search impressions";
    case "visits":
      return "Website visits";
    case "leads":
      return "People who reached out";
  }
}

/** A plain one-line source note for a metric, or empty when there's nothing to add. */
export function metricSourceNote(metric: OwnerReceiptMetric): string {
  if (metric.value === null) return metric.note ?? NOT_MEASURED;
  if (metric.source === "gsc_organic") return "From Google Search";
  if (metric.source === "rybbit") return "From your website";
  if (metric.source === "form_submissions") return "From your website forms";
  return metric.note ?? "";
}

export interface ImpressionsTrendView {
  /** True when an honest before -> after delta can be shown (rule 3). */
  hasDelta: boolean;
  /** Present only when hasDelta: the plain before/after/change strings. */
  before?: string;
  after?: string;
  change?: string;
  beforeWindow?: string;
  afterWindow?: string;
  /** Present only when NOT hasDelta: the plain coverage-gap reason. */
  reason: string;
}

/**
 * Gate the impressions trend (rule 3): a before -> after delta is built ONLY
 * when `sufficient` is true; otherwise we surface the plain `reason` and no
 * number pretends to be a measured change.
 */
export function buildImpressionsTrendView(
  trend: ImpressionsTrend,
): ImpressionsTrendView {
  if (!trend.sufficient || trend.delta === null || !trend.pre || !trend.post) {
    return {
      hasDelta: false,
      reason:
        trend.reason ??
        "We don't have enough stored history yet to show a before-and-after.",
    };
  }
  const change =
    trend.pctChange !== null
      ? `${formatSignedCount(trend.delta)} (${formatSignedPercent(trend.pctChange)})`
      : formatSignedCount(trend.delta);
  return {
    hasDelta: true,
    before: formatMetricValue(trend.pre.storedImpressions),
    after: formatMetricValue(trend.post.storedImpressions),
    change,
    beforeWindow: `${formatDay(trend.pre.window.start)} – ${formatDay(trend.pre.window.end)}`,
    afterWindow: `${formatDay(trend.post.window.start)} – ${formatDay(trend.post.window.end)}`,
    reason: "",
  };
}

/**
 * Plain doctor-language for which funnel term moved leads (rule 4). Names the
 * term, in the direction leads actually moved, without any causal claim. Falls
 * back to the backend's plain `reason` when it isn't honestly diagnosable.
 */
export function diagnosisSentence(diagnosis: FunnelMovementDiagnosis): string {
  if (!diagnosis.diagnosable || diagnosis.primaryDriver === null) {
    return (
      diagnosis.reason ??
      "We can't yet say which part of your funnel moved your leads."
    );
  }
  const rose = (diagnosis.leadsChange ?? 0) > 0;
  switch (diagnosis.primaryDriver) {
    case "impressions":
      return rose
        ? "More people reached out, and it's because more people saw you."
        : "Fewer people reached out, and it's because fewer people saw you.";
    case "CTR":
      return rose
        ? "More people reached out — more of the people who saw you clicked through to your site."
        : "Fewer people reached out — fewer of the people who saw you clicked through to your site.";
    case "CRO":
      return rose
        ? "More people reached out after they landed on your site — not more traffic."
        : "Fewer people reached out after they landed on your site — traffic wasn't the cause.";
  }
}

/** Plain label for a logged action type. Unknown types degrade to the raw type. */
export function actionLabel(type: string): string {
  if (type === "review_reply") return "Replied to a review";
  if (type === "local_post") return "Published a post";
  return type;
}
