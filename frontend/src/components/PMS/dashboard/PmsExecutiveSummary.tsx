import { Sparkles } from "lucide-react";

export type PmsExecutiveSummaryProps = {
  bullets?: string[];
  isProcessingInsights: boolean;
};

export function PmsExecutiveSummary({
  bullets,
  isProcessingInsights,
}: PmsExecutiveSummaryProps) {
  const hasBullets = Boolean(bullets?.length);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-premium">
      <div className="mb-5 flex items-center justify-between gap-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">
            Executive Summary
          </p>
          <h2 className="mt-1 font-display text-2xl font-medium tracking-tight text-alloro-navy">
            What the data is saying
          </h2>
        </div>
        <span className="rounded-xl bg-alloro-orange/10 p-2.5 text-alloro-orange">
          <Sparkles className="h-5 w-5" />
        </span>
      </div>

      {hasBullets ? (
        <div className="grid gap-3">
          {bullets?.slice(0, 4).map((bullet) => (
            <div key={bullet} className="flex gap-3 rounded-xl bg-slate-50 p-4">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-alloro-orange" />
              <p className="text-sm font-medium leading-6 text-slate-600">
                {bullet}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-5 text-sm font-medium text-slate-500">
          {isProcessingInsights
            ? "Alloro is generating referral intelligence now. Your latest approved values stay visible while the summary is prepared."
            : "Referral engine summary will appear after PMS data has been approved and processed."}
        </div>
      )}
    </section>
  );
}
