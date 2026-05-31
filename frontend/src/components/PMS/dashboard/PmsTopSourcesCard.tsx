import type { PmsKeyDataSource } from "../../../api/pms";
import { formatCurrency } from "./utils";

export type PmsTopSourcesCardProps = {
  sources: PmsKeyDataSource[];
  isProcessingInsights: boolean;
};

export function PmsTopSourcesCard({
  sources,
  isProcessingInsights,
}: PmsTopSourcesCardProps) {
  const maxPercentage = Math.max(...sources.map((source) => source.percentage), 1);

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-premium">
      <div className="flex items-center justify-between gap-4 border-b border-slate-100 px-6 py-5">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">
            Top Sources · All Time
          </p>
          <h2 className="mt-1 font-display text-2xl font-medium tracking-tight text-alloro-navy">
            Ranked by production
          </h2>
        </div>
        <span className="text-xs font-bold text-slate-400">
          {sources.length} sources
        </span>
      </div>

      {sources.length > 0 ? (
        <div className="divide-y divide-slate-100">
          {sources.slice(0, 8).map((source, index) => {
            const barWidth = Math.max((source.percentage / maxPercentage) * 100, 8);
            return (
              <div
                key={`${source.rank}-${source.name}`}
                className="grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-4 px-6 py-4 transition-colors hover:bg-slate-50"
              >
                <span
                  className={`flex h-8 w-8 items-center justify-center rounded-lg text-xs font-black ${
                    index < 3
                      ? "bg-alloro-orange text-white"
                      : "bg-slate-100 text-slate-500"
                  }`}
                >
                  {source.rank}
                </span>
                <div className="min-w-0">
                  <div className="truncate text-sm font-black text-alloro-navy">
                    {source.name}
                  </div>
                  <div className="mt-1 flex items-center gap-3">
                    <svg viewBox="0 0 100 4" className="h-1 w-24 rounded-full" preserveAspectRatio="none">
                      <rect width="100" height="4" rx="2" fill="var(--color-pm-border-subtle)" />
                      <rect width={barWidth} height="4" rx="2" fill="var(--color-alloro-orange)" />
                    </svg>
                    <span className="text-[11px] font-semibold text-slate-400">
                      {source.percentage}% of production
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-mono text-xs font-bold text-alloro-navy tabular-nums">
                    {formatCurrency(source.production)}
                  </div>
                  <div className="mt-1 font-mono text-[11px] font-semibold text-slate-500 tabular-nums">
                    {source.referrals} refs
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="p-10 text-center text-sm font-semibold text-slate-400">
          {isProcessingInsights
            ? "Your ranked referral sources will appear once PMS processing finishes."
            : "Upload PMS data to rank referral sources."}
        </div>
      )}
    </section>
  );
}
