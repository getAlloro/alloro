import type { ReferralEngineData } from "../ReferralMatrices";
import { TONE_COLOR, type StatusTone } from "../../dashboard/focus/statusRules";

/**
 * sourceTrend — derive a per-source ▲/▼/— arrow for the Top Sources list by
 * matching each PMS source name against the Referral-Engine matrices'
 * `trend_label`. Name matching is normalized (trim + lowercase); unmatched
 * sources fall back to a neutral "—".
 *
 * Spec: plans/06102026-referrals-hub-simplification/spec.html (T3)
 */

export interface SourceTrend {
  arrow: "▲" | "▼" | "—";
  tone: StatusTone;
  color: string;
}

const NEUTRAL: SourceTrend = { arrow: "—", tone: "neutral", color: TONE_COLOR.neutral };

function norm(name: string): string {
  return name.trim().toLowerCase();
}

function fromLabel(label: string | undefined): SourceTrend {
  switch (label) {
    case "increasing":
    case "new":
      return { arrow: "▲", tone: "positive", color: TONE_COLOR.positive };
    case "decreasing":
    case "dormant":
      return { arrow: "▼", tone: "warn", color: TONE_COLOR.warn };
    default:
      return NEUTRAL;
  }
}

/**
 * Build a lookup `(sourceName) => SourceTrend` from the Referral-Engine data.
 * Reads both the doctor (`referrer_name`) and non-doctor (`source_label`)
 * matrices.
 */
export function buildSourceTrendLookup(
  referralData: ReferralEngineData | null,
): (sourceName: string) => SourceTrend {
  const byName = new Map<string, string>();

  if (referralData) {
    for (const d of referralData.doctor_referral_matrix ?? []) {
      if (d.referrer_name && d.trend_label) byName.set(norm(d.referrer_name), d.trend_label);
    }
    for (const s of referralData.non_doctor_referral_matrix ?? []) {
      if (s.source_label && s.trend_label) byName.set(norm(s.source_label), s.trend_label);
    }
  }

  return (sourceName: string): SourceTrend =>
    sourceName ? fromLabel(byName.get(norm(sourceName))) : NEUTRAL;
}

/**
 * Per-source detail for the Top-Sources click-in (Referrals Hub). The RE
 * matrices have no monthly series, so detail = what genuinely exists:
 * production, per-referral average, funnel percentages, trend + notes.
 */
export interface SourceDetail {
  netProduction: number | null;
  avgPerReferral: number | null;
  pctScheduled: number | null;
  pctStarted: number | null;
  trendLabel: string | null;
  notes: string | null;
}

export function buildSourceDetailLookup(
  referralData: ReferralEngineData | null,
): (sourceName: string) => SourceDetail | null {
  const byName = new Map<string, SourceDetail>();

  if (referralData) {
    for (const d of referralData.doctor_referral_matrix ?? []) {
      if (!d.referrer_name) continue;
      byName.set(norm(d.referrer_name), {
        netProduction: d.net_production ?? null,
        avgPerReferral: d.avg_production_per_referral ?? null,
        pctScheduled: d.pct_scheduled ?? null,
        pctStarted: d.pct_started ?? null,
        trendLabel: d.trend_label ?? null,
        notes: d.notes ?? null,
      });
    }
    for (const s of referralData.non_doctor_referral_matrix ?? []) {
      if (!s.source_label) continue;
      byName.set(norm(s.source_label), {
        netProduction: s.net_production ?? null,
        avgPerReferral: s.avg_production_per_referral ?? null,
        pctScheduled: s.pct_scheduled ?? null,
        pctStarted: s.pct_started ?? null,
        trendLabel: s.trend_label ?? null,
        notes: s.notes ?? null,
      });
    }
  }

  return (sourceName: string): SourceDetail | null =>
    sourceName ? (byName.get(norm(sourceName)) ?? null) : null;
}
