import type { PmsKeyDataSource } from "../../../api/pms";

/**
 * PMS Referral Hub — owner-readable copy helpers (T3).
 *
 * Pure, no-JSX analog of the Rankings `getOverviewFallbackInsight` /
 * `normalizeNarrativeHighlights` processors (RankingsDashboard.tsx:1395-1417).
 * The Rankings versions are ranking-specific (score/100, Maps positions) and
 * are intentionally NOT reused here — the Referrals Hub gets its own.
 *
 * `getReferralFallbackInsight` produces a deterministic, plain-English lead
 * sentence so the Meaning Hero is NEVER blank when the LLM
 * `executive_summary` is empty or still processing (spec R5).
 *
 * Spec: plans/05292026-no-ticket-referrals-hub-owner-readable-redesign/spec.md (T3)
 */

const formatProduction = (value: number): string =>
  `$${Math.round(Math.max(value, 0)).toLocaleString("en-US")}`;

const formatPercent = (value: number): string =>
  `${Math.round(Math.max(0, Math.min(100, value)))}%`;

export type ReferralFallbackInsightArgs = {
  doctorPercentage: number;
  topSources: PmsKeyDataSource[];
  totalProduction: number;
  totalReferrals: number;
};

/**
 * Deterministic lead sentence describing the referral picture from the numbers
 * already on the surface: the #1 source's share, the doctor/self balance, and
 * total production. Never returns an empty string.
 */
export function getReferralFallbackInsight({
  doctorPercentage,
  topSources,
  totalProduction,
  totalReferrals,
}: ReferralFallbackInsightArgs): string {
  // No data at all — keep the hero readable rather than blank.
  if (totalReferrals <= 0 && totalProduction <= 0 && topSources.length === 0) {
    return "Once your referral data is approved, this is where you'll see who is sending you patients and how much production they drive.";
  }

  const parts: string[] = [];

  const topSource = [...topSources].sort((a, b) => b.production - a.production)[0];
  if (topSource && topSource.name.trim().length > 0) {
    if (topSource.percentage > 0) {
      parts.push(
        `${topSource.name.trim()} is your top referral source, driving ${formatPercent(
          topSource.percentage,
        )} of tracked referrals.`,
      );
    } else {
      parts.push(`${topSource.name.trim()} is your top referral source.`);
    }
  }

  const doctorPct = Math.round(Math.max(0, Math.min(100, doctorPercentage)));
  if (totalReferrals > 0) {
    if (doctorPct >= 60) {
      parts.push(
        `${formatPercent(doctorPct)} of your referrals come from doctors — the rest are patient self-referrals.`,
      );
    } else if (doctorPct <= 40) {
      parts.push(
        `Most of your referrals are patient self-referrals; ${formatPercent(doctorPct)} come from doctors.`,
      );
    } else {
      parts.push(
        `Your referrals are split fairly evenly between doctors (${formatPercent(doctorPct)}) and patient self-referrals.`,
      );
    }
  }

  if (totalProduction > 0) {
    parts.push(
      `Together they account for ${formatProduction(totalProduction)} in tracked production.`,
    );
  }

  if (parts.length === 0) {
    return "Your referral data is approved and ready — review the sources and production below to see what's driving growth.";
  }

  return parts.join(" ");
}

/**
 * Light normalizer for LLM-authored `executive_summary` bullets: trims each,
 * drops empties, dedupes (case-insensitive), and caps at 4 — mirroring the old
 * `slice(0, 4)` while removing whitespace/duplicate noise. Pure, returns a new
 * array, never mutates the input.
 */
export function normalizeReferralBullets(bullets?: string[]): string[] {
  if (!bullets?.length) return [];

  const seen = new Set<string>();
  const result: string[] = [];

  for (const bullet of bullets) {
    const trimmed = bullet?.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
    if (result.length >= 4) break;
  }

  return result;
}
