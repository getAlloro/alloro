import { CircleHelp } from "lucide-react";
import type { ReactNode } from "react";
import HighlightedText from "../focus/HighlightedText";

export type RankingMeaningCardProps = {
  insight: string;
  insightHighlights?: string[];
  score: ReactNode;
  scoreTooltip: string;
  estimateSummary: ReactNode;
  actions: ReactNode;
};

export function RankingMeaningCard({
  insight,
  insightHighlights,
  score,
  scoreTooltip,
  estimateSummary,
  actions,
}: RankingMeaningCardProps) {
  return (
    <section className="animate-in fade-in slide-in-from-bottom-2 duration-700 delay-150">
      <div className="rounded-[16px] border border-[#EDE5C0] bg-[#FCFAED] px-6 py-6 shadow-premium lg:px-7 lg:py-7">
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_330px] xl:items-stretch">
          <div className="flex h-full min-w-0 flex-col gap-5">
            <div>
              <p className="font-display text-[22px] font-medium leading-[1.35] tracking-tight text-[#2C2A26] md:text-[28px]">
                <HighlightedText text={insight} highlights={insightHighlights} />
              </p>
            </div>

            <div className="flex flex-1 items-center rounded-[14px] border border-[#EDE5C0] bg-white/75 p-5">
              <div className="w-full">{estimateSummary}</div>
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <div className="flex min-h-[220px] flex-col justify-center rounded-[14px] border border-[#EDE5C0] bg-white/70 px-5 py-5 text-center">
              <div className="mb-1 flex items-center justify-center gap-1.5 text-[#6F664A]">
                <span className="text-[10px] font-black uppercase tracking-[0.14em]">
                  Local Search Score
                </span>
                <span
                  className="group relative inline-flex cursor-help"
                  tabIndex={0}
                  role="button"
                  aria-label="What the local search score means"
                >
                  <CircleHelp size={13} />
                  <span className="pointer-events-none invisible absolute left-1/2 top-full z-40 mt-2 w-64 -translate-x-1/2 -translate-y-1 rounded-lg bg-alloro-navy px-3 py-2 text-left text-[11px] font-medium leading-relaxed text-white opacity-0 shadow-lg transition-[opacity,transform,visibility] duration-150 group-hover:visible group-hover:translate-y-0 group-hover:opacity-100 group-focus:visible group-focus:translate-y-0 group-focus:opacity-100">
                    {scoreTooltip}
                  </span>
                </span>
              </div>
              <div className="flex justify-center">{score}</div>
            </div>

            <div className="rounded-[14px] border border-[#EDE5C0] bg-white/75 p-5">
              {actions}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
