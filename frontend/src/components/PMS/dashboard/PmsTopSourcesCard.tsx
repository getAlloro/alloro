import { useState } from "react";
import type { PmsKeyDataSource } from "../../../api/pms";
import { DetailsModal } from "../../dashboard/shared/DetailsModal";
import { PmsCardShell } from "./primitives";
import { formatCurrency } from "./utils";

export type PmsTopSourcesCardProps = {
  sources: PmsKeyDataSource[];
  isProcessingInsights: boolean;
};

function SourceRow({
  source,
  index,
  maxPercentage,
}: {
  source: PmsKeyDataSource;
  index: number;
  maxPercentage: number;
}) {
  const barWidth = Math.max((source.percentage / maxPercentage) * 100, 8);
  return (
    <div className="grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-4 py-4 first:pt-0 last:pb-0">
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
          <svg
            viewBox="0 0 100 4"
            className="h-1 w-24 rounded-full"
            preserveAspectRatio="none"
          >
            <rect width="100" height="4" rx="2" fill="var(--color-pm-border-subtle)" />
            <rect width={barWidth} height="4" rx="2" fill="var(--color-alloro-orange)" />
          </svg>
          <span className="text-[11px] font-semibold text-[color:var(--color-pm-text-secondary)]">
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
}

export function PmsTopSourcesCard({
  sources,
  isProcessingInsights,
}: PmsTopSourcesCardProps) {
  const [showAll, setShowAll] = useState(false);

  const maxPercentage = Math.max(
    ...sources.map((source) => source.percentage),
    1,
  );
  const rankedSources = [...sources].sort(
    (a, b) => b.production - a.production,
  );
  const topThree = rankedSources.slice(0, 3);
  const hasOverflow = rankedSources.length > topThree.length;

  return (
    <>
      <PmsCardShell
        eyebrow="Referral sources"
        title="Ranked by production"
        action={
          <span className="rounded-full border border-line-soft bg-[#FCFAED] px-3 py-1 text-xs font-bold text-alloro-navy tabular-nums">
            {sources.length} sources
          </span>
        }
      >
        {sources.length > 0 ? (
          <>
            <div className="divide-y divide-line-soft">
              {topThree.map((source, index) => (
                <SourceRow
                  key={`${source.rank}-${source.name}`}
                  source={source}
                  index={index}
                  maxPercentage={maxPercentage}
                />
              ))}
            </div>
            {hasOverflow && (
              <button
                type="button"
                onClick={() => setShowAll(true)}
                className="mt-4 w-full rounded-[10px] border border-line-soft bg-white px-4 py-2.5 text-xs font-bold text-alloro-navy/70 transition-colors hover:bg-[#FCFAED] hover:text-alloro-navy focus:outline-none focus:ring-2 focus:ring-alloro-orange/40"
              >
                See all sources
              </button>
            )}
          </>
        ) : (
          <div className="py-10 text-center text-sm font-semibold text-[color:var(--color-pm-text-secondary)]">
            {isProcessingInsights
              ? "Your ranked referral sources will appear once PMS processing finishes."
              : "Upload PMS data to rank referral sources."}
          </div>
        )}
      </PmsCardShell>

      <DetailsModal
        open={showAll}
        onClose={() => setShowAll(false)}
        eyebrow="Referral sources · All time"
        title="All referral sources"
      >
        <div className="divide-y divide-line-soft">
          {rankedSources.map((source, index) => (
            <SourceRow
              key={`${source.rank}-${source.name}`}
              source={source}
              index={index}
              maxPercentage={maxPercentage}
            />
          ))}
        </div>
      </DetailsModal>
    </>
  );
}
