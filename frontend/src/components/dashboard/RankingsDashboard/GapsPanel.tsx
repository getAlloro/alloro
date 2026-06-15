import { SectionTitle } from "../shared/SectionTitle";
import { InfoTip } from "../shared/InfoTip";
import type { RankingResult } from "../rankingsDashboard.types";
import { FACTOR_LABEL } from "../rankingsDashboard.utils";

/* ─────────────────────────────────────────────────────────────
   GapsPanel — opportunities right-rail (T7)
   ───────────────────────────────────────────────────────────── */
export function GapsPanel({
  result,
  embedded = false,
}: {
  result: RankingResult;
  embedded?: boolean;
}) {
  const gaps = result.llmAnalysis?.gaps ?? [];
  if (gaps.length === 0) return null;
  const tone = (impact: string) =>
    impact === "high"
      ? { c: "#ef4444", b: "var(--color-danger-soft)" }
      : impact === "medium"
        ? { c: "#D9A441", b: "var(--color-amber-soft)" }
        : { c: "#11151C", b: "rgba(17,21,28,0.05)" };

  return (
    <section
      className={`bg-white border border-line-soft rounded-[14px] overflow-hidden ${
        embedded ? "" : "shadow-premium"
      }`}
    >
      {!embedded && (
        <header className="px-6 lg:px-7 py-4 flex items-center justify-between border-b border-line-soft gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <span
              className="w-1.5 h-1.5 rounded-full shrink-0"
              style={{ background: "#D9A441" }}
            />
            <SectionTitle>Gaps to fix</SectionTitle>
            <InfoTip content="Specific gaps where competitors outperform you. High-impact gaps are the fastest path to climbing — click any gap for the details." />
          </div>
          <span className="font-mono-display text-[10px] tracking-widest text-alloro-navy/40 uppercase shrink-0">
            {gaps.length}
          </span>
        </header>
      )}
      <ul className="divide-y divide-line-soft">
        {gaps.map((g, i) => {
          const t = tone(g.impact);
          return (
            <li key={i} className="px-6 py-4 lg:px-7">
              <div className="flex items-start gap-3">
                <span
                  className="mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-[0.18em]"
                  style={{ color: t.c, background: t.b }}
                >
                  {g.impact}
                </span>
                <div className="min-w-0">
                  <h4 className="text-[13.5px] font-bold text-alloro-navy">
                    {FACTOR_LABEL[g.type] ||
                      g.type
                        .replace(/_/g, " ")
                        .replace(/\b\w/g, (c) => c.toUpperCase())}
                  </h4>
                  <p className="mt-2 max-w-[72ch] text-[12.5px] leading-relaxed text-alloro-navy/65">
                    {g.reason}
                  </p>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
