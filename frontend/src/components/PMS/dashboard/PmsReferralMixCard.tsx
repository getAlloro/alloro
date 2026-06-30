import { UsersRound } from "lucide-react";
import { PmsCardShell } from "./primitives";
import { usePmsCopy } from "../pmsCopy";

export type PmsReferralMixCardProps = {
  doctorPercentage: number;
  doctorReferralCount: number;
  totalReferrals: number;
  isProcessingInsights: boolean;
};

/**
 * PmsReferralMixCard — the SINGLE canonical doctor/self split for the
 * Referrals Hub. Uses the ALL-TIME source of truth (R1): doctorPercentage and
 * doctorReferralCount are observed across every uploaded month, so the period
 * is labeled "All-time" rather than the previous latest-month computation that
 * disagreed with the rollup numbers.
 *
 * self count = totalReferrals - doctorReferralCount; self% = 100 - doctorPercentage.
 */
export function PmsReferralMixCard({
  doctorPercentage,
  doctorReferralCount,
  totalReferrals,
  isProcessingInsights,
}: PmsReferralMixCardProps) {
  const copy = usePmsCopy();
  const hasReferralMix = totalReferrals > 0;
  const doctorPct = hasReferralMix ? Math.round(doctorPercentage) : 0;
  const selfPct = hasReferralMix ? Math.max(100 - doctorPct, 0) : 0;
  const doctorCount = Math.max(doctorReferralCount, 0);
  const selfCount = Math.max(totalReferrals - doctorReferralCount, 0);

  return (
    <PmsCardShell
      eyebrow={copy.mixEyebrow}
      title={copy.mixTitle}
      action={
        <span className="inline-flex items-center justify-center rounded-xl bg-alloro-orange/10 p-2.5 text-alloro-orange">
          <UsersRound className="h-5 w-5" />
        </span>
      }
    >
      {hasReferralMix ? (
        <>
          <p className="-mt-1 mb-5 text-xs font-semibold uppercase tracking-wider text-[color:var(--color-pm-text-secondary)]">
            All-time · {totalReferrals.toLocaleString("en-US")}{" "}
            {copy.mixObservedLabel}
          </p>

          <div className="grid grid-cols-2 gap-5">
            <div>
              <div className="font-display text-4xl font-medium tracking-tight text-alloro-navy tabular-nums">
                {selfPct}%
              </div>
              <p className="mt-1 text-xs font-bold uppercase tracking-wider text-[color:var(--color-pm-text-secondary)]">
                {copy.directLegendLabel}
              </p>
              <p className="mt-2 text-2xl font-black text-alloro-navy tabular-nums">
                {selfCount.toLocaleString("en-US")}
              </p>
            </div>
            <div className="border-l border-line-soft pl-5">
              <div className="font-display text-4xl font-medium tracking-tight text-alloro-orange tabular-nums">
                {doctorPct}%
              </div>
              <p className="mt-1 text-xs font-bold uppercase tracking-wider text-[color:var(--color-pm-text-secondary)]">
                {copy.partnerSummaryLabel}
              </p>
              <p className="mt-2 text-2xl font-black text-alloro-navy tabular-nums">
                {doctorCount.toLocaleString("en-US")}
              </p>
            </div>
          </div>

          <svg
            viewBox="0 0 100 8"
            className="mt-6 h-2 w-full overflow-hidden rounded-full"
            preserveAspectRatio="none"
          >
            <rect width="100" height="8" rx="4" fill="var(--color-line-soft)" />
            <rect
              width={selfPct}
              height="8"
              rx="4"
              fill="var(--color-pm-border-hover)"
            />
            <rect
              x={selfPct}
              width={doctorPct}
              height="8"
              rx="4"
              fill="var(--color-alloro-orange)"
            />
          </svg>
          <div className="mt-3 flex gap-5 text-[10px] font-black uppercase tracking-widest text-[color:var(--color-pm-text-secondary)]">
            <span className="inline-flex items-center gap-2">
              <span
                className="h-2 w-2 rounded-sm"
                style={{ background: "var(--color-pm-border-hover)" }}
              />
              {copy.directLegendLabel}
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="h-2 w-2 rounded-sm bg-alloro-orange" />
              {copy.partnerLegendLabel}
            </span>
          </div>
        </>
      ) : (
        <div className="rounded-xl border border-dashed border-line-soft bg-[#F7F5F3] p-6 text-sm font-medium leading-6 text-[color:var(--color-pm-text-secondary)]">
          {isProcessingInsights ? copy.mixEmptyProcessing : copy.mixEmpty}
        </div>
      )}
    </PmsCardShell>
  );
}
