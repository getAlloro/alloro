import { SectionTitle } from "../shared/SectionTitle";
import { InfoTip } from "../shared/InfoTip";
import type { RankingResult } from "../rankingsDashboard.types";
import {
  FACTOR_LABEL,
  FACTOR_TOOLTIP,
  normalizeFactorPct,
  computeCohortDelta,
} from "../rankingsDashboard.utils";

/* ─────────────────────────────────────────────────────────────
   FactorBreakdown — horizontal weighted bar list (T6)
   ───────────────────────────────────────────────────────────── */
export function FactorBreakdown({
  result,
  embedded = false,
}: {
  result: RankingResult;
  embedded?: boolean;
}) {
  const f = result.rankingFactors;
  if (!f) return null;
  const accent = "#D66853";
  const rows = Object.entries(f)
    .map(([k, v]) => ({ key: k, ...v }))
    .sort((a, b) => b.weighted - a.weighted);

  return (
    <section
      className={`bg-white border border-line-soft rounded-[14px] overflow-hidden ${
        embedded ? "" : "shadow-premium"
      }`}
    >
      <header className="px-6 lg:px-7 py-4 flex items-center justify-between border-b border-line-soft gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <span
            className="w-1.5 h-1.5 rounded-full shrink-0"
            style={{ background: "#11151C" }}
          />
          <SectionTitle>Score factor breakdown</SectionTitle>
          <InfoTip content="Each visibility factor's score and impact. Where data is available, each row shows your value and the competitor median for comparison." />
        </div>
        <span className="font-mono-display text-[10px] tracking-widest text-alloro-navy/40 uppercase shrink-0">
          score impact
        </span>
      </header>
      <ul className="px-6 lg:px-7 py-5 space-y-4">
        {rows.map((row, idx) => {
          const pct = Math.max(0, Math.min(100, normalizeFactorPct(row.score)));
          const weightPct = Math.round(normalizeFactorPct(row.weight));
          const tone = pct >= 80 ? "#22c55e" : pct >= 60 ? accent : "#ef4444";
          const tooltip = FACTOR_TOOLTIP[row.key];
          const delta = computeCohortDelta(row.key, result);
          // Section card has overflow-hidden, so a downward tooltip on the
          // bottom row gets clipped — flip it upward.
          const tipPlacement = idx === rows.length - 1 ? "top" : "bottom";
          return (
            <li
              key={row.key}
              className="grid grid-cols-[140px_1fr_60px_60px] sm:grid-cols-[180px_1fr_60px_60px] items-start gap-x-4 gap-y-1.5"
            >
              <span className="flex items-center gap-1.5 min-w-0 pt-0.5">
                {tooltip && (
                  <InfoTip
                    content={tooltip}
                    align="left"
                    placement={tipPlacement}
                  />
                )}
                <span className="text-[12.5px] font-bold truncate text-alloro-navy">
                  {FACTOR_LABEL[row.key] || row.key}
                </span>
              </span>
              <div className="min-w-0 flex flex-col gap-1.5 pt-1.5">
                <div
                  className="h-1.5 rounded-full overflow-hidden"
                  style={{ background: "rgba(17,21,28,0.06)" }}
                >
                  <div
                    className="h-full rounded-full transition-[width] duration-500 ease-out"
                    style={{ width: `${pct}%`, background: tone }}
                  />
                </div>
                {delta && (
                  <span className="text-[10.5px] font-medium text-alloro-navy/55 leading-snug">
                    {delta}
                  </span>
                )}
              </div>
              <span className="text-[12px] font-bold tabular-nums text-right text-alloro-navy pt-0.5">
                {Math.round(pct)}
                <span className="text-alloro-navy/30 font-semibold"> /100</span>
              </span>
              <span className="font-mono-display text-[10px] uppercase tracking-widest text-alloro-navy/40 text-right tabular-nums pt-1">
                w {weightPct}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
