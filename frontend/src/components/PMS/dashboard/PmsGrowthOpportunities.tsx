import { Info } from "lucide-react";
import type { ReferralEngineData, TopFix } from "../ReferralMatrices";
import { usePmsCopy } from "../pmsCopy";

export type PmsGrowthOpportunitiesProps = {
  referralData: ReferralEngineData | null;
};

const normalizeFix = (fix: TopFix | string, index: number): TopFix => {
  if (typeof fix === "string") {
    return {
      title: `Opportunity ${index + 1}`,
      description: fix,
    };
  }

  return fix;
};

/**
 * InfoTip — small (i) icon with a hover/focus tooltip.
 * Matches the Rankings page convention (pure CSS, no framer-motion).
 */
function InfoTip({ content }: { content: string }) {
  return (
    <span
      className="relative inline-flex group/tip cursor-help shrink-0 outline-none"
      tabIndex={0}
      role="button"
      aria-label="More info"
    >
      <Info
        size={13}
        className="text-alloro-navy/35 hover:text-alloro-navy group-focus/tip:text-alloro-navy transition-colors"
      />
      <span
        role="tooltip"
        className="pointer-events-none absolute z-50 top-full mt-2 left-1/2 -translate-x-1/2 -translate-y-1 w-64 bg-alloro-navy text-white text-[11px] font-medium leading-relaxed rounded-lg px-3 py-2 shadow-lg opacity-0 invisible group-hover/tip:opacity-100 group-hover/tip:visible group-hover/tip:translate-y-0 group-focus/tip:opacity-100 group-focus/tip:visible group-focus/tip:translate-y-0 transition-[opacity,transform,visibility] duration-150 ease-out"
      >
        <span className="absolute bottom-full left-1/2 -translate-x-1/2 w-0 h-0 border-[5px] border-transparent border-b-alloro-navy" />
        {content}
      </span>
    </span>
  );
}

export function PmsGrowthOpportunities({
  referralData,
}: PmsGrowthOpportunitiesProps) {
  const copy = usePmsCopy();
  const fixes = referralData?.growth_opportunity_summary?.top_three_fixes ?? [];
  const visibleFixes = fixes.slice(0, 3);
  const accent = "#D66853";

  return (
    <section className="rounded-[14px] border border-line-soft bg-white p-6 shadow-premium lg:p-7">
      <header className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <span
            className="w-1.5 h-1.5 rounded-full shrink-0"
            style={{ background: accent }}
          />
          <h3 className="font-display text-[15px] lg:text-base font-medium text-alloro-navy tracking-tight leading-tight">
            Best next actions
          </h3>
          <InfoTip
            content={`Highest-impact actions to grow ${copy.moneyLower}, ordered by priority. These are generated from the ${copy.dashboardTitle.toLowerCase()} analysis.`}
          />
        </div>
        <span className="font-mono-display text-[10px] tracking-widest text-alloro-navy/40 uppercase shrink-0">
          {visibleFixes.length > 0
            ? `${visibleFixes.length} actions`
            : "pending"}
        </span>
      </header>

      {visibleFixes.length > 0 ? (
        <ol className="grid gap-4 lg:grid-cols-3">
          {visibleFixes.map((fix, index) => {
            const normalizedFix = normalizeFix(fix, index);
            return (
              <li key={`${normalizedFix.title}-${index}`}>
                <article className="h-full rounded-[12px] border border-line-soft bg-white p-4 shadow-[0_12px_28px_rgba(17,21,28,0.07)] transition-transform duration-200 hover:-translate-y-0.5 hover:border-alloro-orange/25">
                  <div className="mb-3 flex items-center gap-2">
                    <div
                      className="flex h-7 w-7 items-center justify-center rounded-full border font-extrabold text-[12px] tabular-nums"
                      style={{
                        color: accent,
                        background: "rgba(214,104,83,0.08)",
                        borderColor: "rgba(214,104,83,0.22)",
                      }}
                    >
                      {index + 1}
                    </div>
                    <span className="font-mono-display text-[10px] font-bold uppercase tracking-[0.16em] text-alloro-navy/35">
                      Action
                    </span>
                  </div>
                  <h4 className="text-[14.5px] font-bold leading-snug tracking-tight text-alloro-navy">
                    {normalizedFix.title}
                  </h4>
                  {normalizedFix.description && (
                    <p className="mt-3 text-[12.5px] font-medium leading-relaxed text-alloro-navy/65">
                      {normalizedFix.description}
                    </p>
                  )}
                  {normalizedFix.impact && (
                    <p className="mt-3 text-[11px] font-bold leading-5 text-green-600">
                      {normalizedFix.impact}
                    </p>
                  )}
                </article>
              </li>
            );
          })}
        </ol>
      ) : (
        <div className="rounded-[12px] border border-dashed border-line-soft bg-slate-50 p-5 text-[12.5px] font-medium text-alloro-navy/45">
          Growth opportunities will appear after{" "}
          {copy.dashboardTitle.toLowerCase()} has been generated.
        </div>
      )}
    </section>
  );
}
