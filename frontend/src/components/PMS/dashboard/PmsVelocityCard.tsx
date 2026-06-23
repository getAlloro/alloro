import type { PmsDashboardMonth } from "./types";
import { formatCompactCurrency, getLastMonths } from "./utils";
import { PmsEyebrow } from "./primitives";
import { useLabels } from "../../../hooks/useLabels";

export type PmsVelocityCardProps = {
  months: PmsDashboardMonth[];
  isProcessingInsights: boolean;
};

/**
 * PmsVelocityCard — last-6-months referral pace (self + doctor bars + counts +
 * production). It now renders as the body of the "View monthly pace" modal
 * (DetailsModal provides the outer shell + header), so it drops its own heavy
 * card chrome and renders a clean inner body on line-soft tokens.
 *
 * The pms-velocity wizard target lives on the modal trigger in
 * PmsProductionChart now — this component intentionally carries no
 * data-wizard-target.
 */
export function PmsVelocityCard({
  months,
  isProcessingInsights,
}: PmsVelocityCardProps) {
  const labels = useLabels();
  const recentMonths = getLastMonths(months, 6);
  const maxReferrals = Math.max(
    ...recentMonths.map((month) => month.selfReferrals + month.doctorReferrals),
    1,
  );

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <PmsEyebrow>{labels.referralVelocity} · Last 6 months</PmsEyebrow>
          <h3 className="font-display text-2xl font-medium tracking-tight text-alloro-navy">
            Monthly referral pace
          </h3>
        </div>
        <div className="flex gap-4 text-[10px] font-bold uppercase tracking-widest text-[color:var(--color-pm-text-secondary)]">
          <span className="inline-flex items-center gap-2">
            <span className="h-2 w-2 rounded-sm bg-alloro-orange" />
            Self
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="h-2 w-2 rounded-sm bg-alloro-navy" />
            Doctor
          </span>
        </div>
      </div>

      {recentMonths.length > 0 ? (
        <div className="space-y-5">
          {recentMonths.map((month) => {
            const selfWidth = Math.max((month.selfReferrals / maxReferrals) * 100, 4);
            const doctorWidth = Math.max((month.doctorReferrals / maxReferrals) * 100, 4);
            return (
              <div key={month.month} className="grid grid-cols-[4rem_minmax(0,1fr)_5rem] items-center gap-4">
                <div className="text-right text-xs font-black uppercase text-alloro-navy">
                  {month.month}
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <svg viewBox="0 0 100 10" className="h-2.5 w-full" preserveAspectRatio="none">
                      <rect width={selfWidth} height="10" rx="5" fill="var(--color-alloro-orange)" />
                    </svg>
                    <span className="w-8 font-mono text-xs font-bold text-alloro-navy tabular-nums">
                      {month.selfReferrals}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <svg viewBox="0 0 100 7" className="h-2 w-full" preserveAspectRatio="none">
                      <rect width={doctorWidth} height="7" rx="4" fill="var(--color-alloro-navy)" opacity="0.78" />
                    </svg>
                    <span className="w-8 font-mono text-[11px] font-bold text-[color:var(--color-pm-text-secondary)] tabular-nums">
                      {month.doctorReferrals}
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-mono text-xs font-black text-alloro-navy tabular-nums">
                    {month.totalReferrals}
                  </div>
                  <div className="font-mono text-[11px] font-semibold text-green-700">
                    {formatCompactCurrency(month.productionTotal)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-[14px] border border-dashed border-line-soft bg-[#FCFAED] p-10 text-center text-sm font-semibold text-[color:var(--color-pm-text-secondary)]">
          {isProcessingInsights
            ? "Your referral velocity will appear once PMS processing finishes."
            : "Upload PMS data to see referral velocity."}
        </div>
      )}
    </div>
  );
}
