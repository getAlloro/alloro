import { MeaningHero } from "../../dashboard/shared/MeaningHero";
import type { PmsKeyDataSource } from "../../../api/pms";
import {
  getReferralFallbackInsight,
  normalizeReferralBullets,
} from "./referralInsightCopy";
import { formatCompactCurrency } from "./utils";

export type PmsExecutiveSummaryProps = {
  bullets?: string[];
  totalProduction: number;
  totalReferrals: number;
  doctorPercentage: number;
  topSources: PmsKeyDataSource[];
  isProcessingInsights: boolean;
};

const PROCESSING_INSIGHT =
  "Alloro is reading your referral data now. Your latest approved numbers stay visible while we write up what they mean.";

/**
 * PmsExecutiveSummary — the renamed, contrast-fixed referral meaning hero.
 *
 * Composes the shared cream `MeaningHero` (RankingMeaningCard analog). The lead
 * slot reads as plain-English prose: normalized LLM `executive_summary` bullets
 * joined into a paragraph, or the deterministic `getReferralFallbackInsight`
 * when none exist / still processing — so the lead is NEVER blank (spec R5).
 *
 * The score slot is a HEADLINE FIGURE (total referral production), NOT a 0-100
 * gauge — no such "referral score" concept exists here (spec Constraints).
 *
 * Renamed away from "Executive Summary" / "What the data is saying" to owner
 * language: "What your referrals are telling you".
 *
 * Spec: plans/05292026-no-ticket-referrals-hub-owner-readable-redesign/spec.md (T3)
 */
export function PmsExecutiveSummary({
  bullets,
  totalProduction,
  totalReferrals,
  doctorPercentage,
  topSources,
  isProcessingInsights,
}: PmsExecutiveSummaryProps) {
  const normalizedBullets = normalizeReferralBullets(bullets);
  const hasBullets = normalizedBullets.length > 0;

  // Lead is never blank: prose from bullets, processing copy, or the
  // deterministic fallback computed from the numbers already on the surface.
  let insight: string;
  if (hasBullets) {
    insight = normalizedBullets.join(" ");
  } else if (isProcessingInsights) {
    insight = PROCESSING_INSIGHT;
  } else {
    insight = getReferralFallbackInsight({
      doctorPercentage,
      topSources,
      totalProduction,
      totalReferrals,
    });
  }

  const productionLabel = formatCompactCurrency(Math.max(totalProduction, 0));
  const referralsTracked = Math.max(0, Math.round(totalReferrals));

  return (
    // data-wizard-target="pms-insights" re-anchors the onboarding wizard's
    // "What's Good & What's Risky" step here — it previously lived on the now
    // deleted PmsAttentionCards; the meaning hero is its truest replacement.
    <div data-wizard-target="pms-insights">
      <MeaningHero
        insight={insight}
        scoreLabel="Referral production"
      scoreTooltip="Total production tied to tracked referrals across all approved data. This is the dollar value your referral sources have generated."
      score={
        <span className="font-display text-[44px] font-medium leading-none tracking-tight tabular-nums text-alloro-navy">
          {productionLabel}
        </span>
      }
      estimateSummary={
        <div className="flex flex-col gap-1">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[color:var(--color-pm-text-secondary)]">
            What your referrals are telling you
          </p>
          <p className="text-[13px] font-medium leading-relaxed text-alloro-navy/70">
            {referralsTracked > 0
              ? `${referralsTracked.toLocaleString("en-US")} referral${
                  referralsTracked === 1 ? "" : "s"
                } tracked across all approved data.`
              : "No referrals tracked yet — approve your PMS data to populate this view."}
          </p>
        </div>
      }
      actions={
        <p className="text-[13px] font-medium leading-relaxed text-alloro-navy/70">
          {isProcessingInsights && !hasBullets
            ? "We'll refine this summary automatically as the analysis finishes — no action needed."
            : "Read the sources and production below to see exactly what's driving these numbers."}
        </p>
      }
      />
    </div>
  );
}
