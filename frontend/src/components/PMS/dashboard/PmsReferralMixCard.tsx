import { UsersRound } from "lucide-react";
import type { PmsDashboardMonth } from "./types";
import { getLatestMonth } from "./utils";

export type PmsReferralMixCardProps = {
  months: PmsDashboardMonth[];
  isProcessingInsights: boolean;
};

export function PmsReferralMixCard({
  months,
  isProcessingInsights,
}: PmsReferralMixCardProps) {
  const latest = getLatestMonth(months);
  const total = latest?.totalReferrals ?? 0;
  const hasReferralMix = Boolean(latest && total > 0);
  const doctorPct = total > 0 ? Math.round(((latest?.doctorReferrals ?? 0) / total) * 100) : 0;
  const selfPct = total > 0 ? 100 - doctorPct : 0;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-premium">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">
            Referral Mix
          </p>
          <h2 className="mt-1 font-display text-2xl font-medium tracking-tight text-alloro-navy">
            {latest?.month ?? "No month"}
          </h2>
        </div>
        <span className="rounded-xl bg-alloro-orange/10 p-2.5 text-alloro-orange">
          <UsersRound className="h-5 w-5" />
        </span>
      </div>

      {hasReferralMix ? (
        <>
          <div className="grid grid-cols-2 gap-5">
            <div>
              <div className="font-display text-4xl font-medium tracking-tight text-alloro-navy tabular-nums">
                {selfPct}%
              </div>
              <p className="mt-1 text-xs font-bold uppercase tracking-wider text-slate-400">
                Self / walk-in
              </p>
              <p className="mt-2 text-2xl font-black text-alloro-navy tabular-nums">
                {latest?.selfReferrals ?? 0}
              </p>
            </div>
            <div className="border-l border-slate-100 pl-5">
              <div className="font-display text-4xl font-medium tracking-tight text-alloro-orange tabular-nums">
                {doctorPct}%
              </div>
              <p className="mt-1 text-xs font-bold uppercase tracking-wider text-slate-400">
                Doctor referrals
              </p>
              <p className="mt-2 text-2xl font-black text-alloro-navy tabular-nums">
                {latest?.doctorReferrals ?? 0}
              </p>
            </div>
          </div>

          <svg viewBox="0 0 100 8" className="mt-6 h-2 w-full overflow-hidden rounded-full" preserveAspectRatio="none">
            <rect width="100" height="8" rx="4" fill="var(--color-pm-border-subtle)" />
            <rect width={selfPct} height="8" rx="4" fill="var(--color-pm-border-hover)" />
            <rect x={selfPct} width={doctorPct} height="8" rx="4" fill="var(--color-alloro-orange)" />
          </svg>
          <div className="mt-3 flex gap-5 text-[10px] font-black uppercase tracking-widest text-slate-400">
            <span className="inline-flex items-center gap-2">
              <span className="h-2 w-2 rounded-sm bg-slate-300" />
              Self
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="h-2 w-2 rounded-sm bg-alloro-orange" />
              Doctor
            </span>
          </div>
        </>
      ) : (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-sm font-medium leading-6 text-slate-500">
          {isProcessingInsights
            ? "Your referral mix will appear here once PMS processing finishes."
            : "Your referral mix will appear here after PMS data is uploaded."}
        </div>
      )}
    </section>
  );
}
