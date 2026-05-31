import { Target } from "lucide-react";
import type { ReferralEngineData, TopFix } from "../ReferralMatrices";

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

export function PmsGrowthOpportunities({
  referralData,
}: PmsGrowthOpportunitiesProps) {
  const fixes = referralData?.growth_opportunity_summary?.top_three_fixes ?? [];

  return (
    <section className="relative overflow-hidden rounded-2xl border border-alloro-navy bg-alloro-navy p-6 text-white shadow-premium sm:p-8">
      <div className="absolute right-0 top-0 h-64 w-64 rounded-full bg-alloro-orange/20 blur-3xl" />
      <div className="relative z-10 mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-white/45">
            Growth Opportunities
          </p>
          <h2 className="mt-1 font-display text-3xl font-medium tracking-tight text-white">
            Top actions to grow referrals
          </h2>
        </div>
      </div>

      {fixes.length > 0 ? (
        <div className="relative z-10 grid gap-4 lg:grid-cols-3">
          {fixes.slice(0, 3).map((fix, index) => {
            const normalizedFix = normalizeFix(fix, index);
            return (
              <div
                key={`${normalizedFix.title}-${index}`}
                className="rounded-xl border border-white/10 bg-white/[0.04] p-5"
              >
                <div className="mb-4 flex h-9 w-9 items-center justify-center rounded-lg bg-alloro-orange/20 text-alloro-orange">
                  <Target className="h-4 w-4" />
                </div>
                <h3 className="text-base font-black leading-tight text-white">
                  {normalizedFix.title}
                </h3>
                <p className="mt-3 text-sm font-medium leading-6 text-white/65">
                  {normalizedFix.description}
                </p>
                {normalizedFix.impact && (
                  <p className="mt-3 text-xs font-bold leading-5 text-green-300">
                    {normalizedFix.impact}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="relative z-10 rounded-xl border border-white/10 bg-white/[0.04] p-5 text-sm font-medium text-white/65">
          Growth opportunities will appear after referral intelligence has been
          generated.
        </div>
      )}
    </section>
  );
}
