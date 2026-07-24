/**
 * formatOwnerReceiptReport — PURE text renderer for the owner receipt, used by
 * the READ-ONLY dev preview CLI (scripts/preview-owner-receipt.ts).
 *
 * SCOPE: this is a developer-facing preview renderer, NOT a product surface.
 * The owner-facing prose that ships to a customer is the frontend's job (see the
 * note in OwnerReceiptTypes). This exists only so a human running the CLI can
 * eyeball the honest stored numbers in a terminal. It lives here as a pure util
 * (§6.x feature-utils) so the CLI shell in scripts/ stays thin and so this can
 * be unit-tested without a database.
 *
 * It is PURE: no I/O, no DB, no clock, no side effects — TYPE-only imports.
 *
 * HONESTY (Value #6) — the same rules the read-model enforces, echoed at the
 * print layer so nothing dishonest survives to a human's eyes:
 *   - "not measured" is printed for any absent value (`null`), NEVER a 0. A
 *     genuine measured 0 (a connected source with no events) is shown as 0.
 *   - The impressions before -> after delta is printed ONLY when the trend is
 *     `sufficient` (both windows fully covered). Otherwise the plain-words
 *     `reason` and the coverage are printed — never a delta over missing days.
 *   - The "which term moved" diagnosis is printed ONLY when `diagnosable`;
 *     otherwise the plain-words `reason`.
 *   - NO causal claim is ever emitted. This reports the trend and the numbers;
 *     the trend is the only witness. There is no "Alloro caused/drove this".
 */

import type { OwnerReceipt } from "../OwnerReceiptTypes";
import type { ImpressionsLiftResult } from "../../patient-journey/feature-services/impressionsLiftReader";
import type { FunnelMovementDiagnosis } from "../../patient-journey/feature-utils/funnelMovementDiagnosis";

/** Human labels for the staked funnel gates. */
const GATE_LABEL: Record<string, string> = {
  impressions: "Impressions (Get Found)",
  visits: "Visits (Get Considered)",
  leads: "Leads (Get Chosen)",
};

/** Human labels for the funnel decomposition terms. */
const TERM_LABEL: Record<string, string> = {
  impressions: "impressions",
  CTR: "click-through rate (CTR)",
  CRO: "conversion rate (CRO)",
};

/** Render a whole number with thousands separators; `null` -> "not measured". */
function num(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "not measured";
  }
  return value.toLocaleString("en-US");
}

/** Render a fraction as a signed percentage, e.g. 0.5 -> "+50.0%"; else "n/a". */
function pct(fraction: number | null | undefined): string {
  if (fraction === null || fraction === undefined || !Number.isFinite(fraction)) {
    return "n/a";
  }
  const sign = fraction > 0 ? "+" : "";
  return `${sign}${(fraction * 100).toFixed(1)}%`;
}

/** Signed integer delta, e.g. 12 -> "+12", -3 -> "-3". */
function signedNum(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toLocaleString("en-US")}`;
}

/** The impressions before -> after block (honesty-guarded). */
function formatImpressionsTrend(trend: ImpressionsLiftResult): string[] {
  const lines: string[] = ["IMPRESSIONS TREND (GSC organic, before -> after)"];

  if (trend.sufficient && trend.delta !== null) {
    const before = trend.pre?.storedImpressions ?? null;
    const after = trend.post?.storedImpressions ?? null;
    lines.push(`  before : ${num(before)}`);
    lines.push(`  after  : ${num(after)}`);
    lines.push(`  change : ${signedNum(trend.delta)} (${pct(trend.pctChange)})`);
  } else {
    // Insufficient coverage -> plain reason, never a delta over missing days.
    lines.push(`  before -> after not shown: ${trend.reason ?? "coverage insufficient"}`);
    const pre = trend.pre;
    const post = trend.post;
    if (pre) {
      lines.push(
        `  pre-window coverage  : ${pre.storedDays} of ${pre.expectedDays} days stored`
      );
    }
    if (post) {
      lines.push(
        `  post-window coverage : ${post.storedDays} of ${post.expectedDays} days stored`
      );
    }
  }
  return lines;
}

/** The "which term moved leads" diagnosis (only when honestly decomposable). */
function formatDiagnosis(diagnosis: FunnelMovementDiagnosis): string[] {
  const lines: string[] = ["WHICH TERM MOVED LEADS"];

  if (diagnosis.diagnosable && diagnosis.primaryDriver) {
    const driver = TERM_LABEL[diagnosis.primaryDriver] ?? diagnosis.primaryDriver;
    const change =
      diagnosis.leadsChange !== null ? signedNum(diagnosis.leadsChange) : "not measured";
    lines.push(`  leads change : ${change}`);
    lines.push(`  term that moved leads the most : ${driver}`);
  } else {
    lines.push(`  not diagnosable: ${diagnosis.reason ?? "decomposition not honest"}`);
  }
  return lines;
}

/** The post-window gate numbers, each with a "not measured" fallback. */
function formatMetrics(receipt: OwnerReceipt): string[] {
  const lines: string[] = ["POST-WINDOW GATE NUMBERS"];
  for (const metric of receipt.metrics) {
    const label = GATE_LABEL[metric.gate] ?? metric.gate;
    // value === null -> "not measured"; a genuine measured 0 stays 0.
    const value = num(metric.value);
    const source = metric.source ? ` [${metric.source}]` : "";
    const asOf = metric.asOf ? ` as of ${metric.asOf}` : "";
    lines.push(`  ${label}: ${value}${source}${asOf}`);
    if (metric.note) {
      lines.push(`      note: ${metric.note}`);
    }
  }
  return lines;
}

/**
 * Format the whole receipt as plain text. Pure — same input, same output; no
 * clock, no environment, no I/O. Every honesty guard lives in the helpers above.
 */
export function formatOwnerReceiptReport(receipt: OwnerReceipt): string {
  const blocks: string[][] = [];

  blocks.push([
    "OWNER RECEIPT (read-only preview)",
    `  organization : ${receipt.organizationId}`,
    `  location     : ${receipt.locationId ?? "all accessible"}`,
    `  project      : ${receipt.projectId ?? "none (org has no website project)"}`,
    `  pre window   : ${receipt.preWindow.start} .. ${receipt.preWindow.end}`,
    `  post window  : ${receipt.postWindow.start} .. ${receipt.postWindow.end}`,
  ]);

  blocks.push(formatImpressionsTrend(receipt.impressionsTrend));
  blocks.push(formatDiagnosis(receipt.diagnosis));
  blocks.push([`DATED ACTIONS ALLORO TOOK: ${receipt.actions.summary.total}`]);
  blocks.push(formatMetrics(receipt));

  return blocks.map((block) => block.join("\n")).join("\n\n") + "\n";
}
