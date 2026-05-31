import type { PmsDashboardMonth } from "./types";
import { formatCompactCurrency, getLastMonths } from "./utils";

export type PmsVelocityCardProps = {
  months: PmsDashboardMonth[];
  isProcessingInsights: boolean;
};

export function PmsVelocityCard({
  months,
  isProcessingInsights,
}: PmsVelocityCardProps) {
  const recentMonths = getLastMonths(months, 6);
  const maxReferrals = Math.max(
    ...recentMonths.map((month) => month.selfReferrals + month.doctorReferrals),
    1,
  );

  return (
    <section data-wizard-target="pms-velocity" className="rounded-2xl border border-slate-200 bg-white p-6 shadow-premium">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">
            Referral Velocity · Last 6 Months
          </p>
          <h2 className="mt-1 font-display text-2xl font-medium tracking-tight text-alloro-navy">
            Monthly referral pace
          </h2>
        </div>
        <div className="flex gap-4 text-[10px] font-black uppercase tracking-widest text-slate-500">
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
                    <span className="w-8 font-mono text-[11px] font-bold text-slate-500 tabular-nums">
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
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-10 text-center text-sm font-semibold text-slate-400">
          {isProcessingInsights
            ? "Your referral velocity will appear once PMS processing finishes."
            : "Upload PMS data to see referral velocity."}
        </div>
      )}
    </section>
  );
}
