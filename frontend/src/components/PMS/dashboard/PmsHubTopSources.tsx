import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { PmsCardShell } from "./primitives";
import type { PmsDashboardSurfaceProps } from "./PmsDashboardSurface";
import type { SourceDetail, SourceTrend } from "./sourceTrend";
import { formatCompactCurrency } from "./utils";

/**
 * PmsHubTopSources — the Referrals Hub Top-Sources list with click-in
 * detail: each row expands inline to the per-source facts the RE matrices
 * actually carry (production, avg per referral, funnel %, notes). Distinct
 * from the retired PmsTopSourcesCard (legacy surface, production-ranked
 * modal list).
 *
 * Spec: plans/06112026-design-consistency-pass (T3 — sources are a click-in)
 */

export type PmsHubTopSourcesProps = {
  sources: PmsDashboardSurfaceProps["topSources"];
  trendFor: (name: string) => SourceTrend;
  detailFor: (name: string) => SourceDetail | null;
};

function DetailStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-ink-muted">
        {label}
      </div>
      <div className="mt-0.5 text-sm font-semibold text-alloro-navy tabular-nums">{value}</div>
    </div>
  );
}

function pct(value: number | null): string {
  return value == null ? "—" : `${Math.round(value)}%`;
}

export function PmsHubTopSources({ sources, trendFor, detailFor }: PmsHubTopSourcesProps) {
  const [expandedRank, setExpandedRank] = useState<number | null>(null);

  if (sources.length === 0) return null;

  return (
    <PmsCardShell eyebrow="Top sources">
      <div className="divide-y divide-line-soft">
        {sources.map((s) => {
          const trend = trendFor(s.name);
          const detail = detailFor(s.name);
          const isOpen = expandedRank === s.rank;
          return (
            <div key={s.rank} className="py-3 first:pt-0 last:pb-0">
              <button
                type="button"
                aria-expanded={isOpen}
                onClick={() => setExpandedRank(isOpen ? null : s.rank)}
                className="flex w-full items-center gap-3 rounded-[8px] text-left transition-colors hover:bg-alloro-bg/50"
              >
                <span
                  className={`w-5 font-display text-lg font-medium tabular-nums ${
                    s.rank === 1 ? "text-alloro-orange" : "text-ink-muted"
                  }`}
                >
                  {s.rank}
                </span>
                <span className="flex-1 truncate font-semibold text-alloro-navy">{s.name}</span>
                <span className="text-sm font-semibold tabular-nums text-ink-muted">
                  {s.referrals} · {s.percentage}%
                </span>
                <span className="w-4 text-center font-bold" style={{ color: trend.color }}>
                  {trend.arrow}
                </span>
                <ChevronDown
                  size={15}
                  aria-hidden
                  className={`shrink-0 text-ink-muted transition-transform ${
                    isOpen ? "rotate-180" : ""
                  }`}
                />
              </button>

              {isOpen && (
                <div className="mt-3 rounded-[10px] bg-alloro-bg/60 px-4 py-3">
                  {detail ? (
                    <>
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                        <DetailStat
                          label="Production"
                          value={
                            detail.netProduction == null
                              ? "—"
                              : formatCompactCurrency(detail.netProduction)
                          }
                        />
                        <DetailStat
                          label="Avg / referral"
                          value={
                            detail.avgPerReferral == null
                              ? "—"
                              : formatCompactCurrency(detail.avgPerReferral)
                          }
                        />
                        <DetailStat label="Scheduled" value={pct(detail.pctScheduled)} />
                        <DetailStat label="Started" value={pct(detail.pctStarted)} />
                      </div>
                      {detail.notes && (
                        <p className="mt-3 text-[13px] leading-relaxed text-alloro-navy">
                          {detail.notes}
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="text-[13px] font-medium text-ink-muted">
                      Detail arrives with the next referral analysis.
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </PmsCardShell>
  );
}

export default PmsHubTopSources;
