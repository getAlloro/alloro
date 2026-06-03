import { ChevronRight, Sparkles } from "lucide-react";
import { motion } from "framer-motion";
import { PmsTrendPill } from "./PmsTrendPill";
import type { PmsDashboardMonth } from "./types";
import type { PmsKeyDataSource } from "../../../api/pms";
import type { ReferralEngineData } from "../ReferralMatrices";
import {
  formatCurrency,
  formatCompactCurrency,
  getLatestMonth,
  getPreviousMonth,
  getPercentChange,
} from "./utils";

export type PmsReferralsMeaningCardProps = {
  months: PmsDashboardMonth[];
  topSources: PmsKeyDataSource[];
  totalProduction: number;
  totalReferrals: number;
  doctorPercentage: number;
  referralData: ReferralEngineData | null;
  isProcessingInsights: boolean;
  onOpenSources: () => void;
  onOpenTrends: () => void;
};

function MeaningMetric({
  label,
  value,
  sub,
  change,
  isAccent,
}: {
  label: string;
  value: string;
  sub?: string;
  change?: number | null;
  isAccent?: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-xl border border-[#EDE5C0]/70 bg-white/70 p-4">
      <span className="font-mono-display text-[10px] font-bold uppercase tracking-[0.18em] text-[#6F664A]">
        {label}
      </span>
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        <span
          className={`font-display text-[24px] font-medium tabular-nums leading-none tracking-tight md:text-[28px] ${
            isAccent ? "text-alloro-orange" : "text-alloro-navy"
          }`}
        >
          {value}
        </span>
        {change !== undefined && <PmsTrendPill change={change} />}
      </div>
      {sub && (
        <span className="text-[13px] font-semibold text-[#6F664A]/70 tabular-nums">
          {sub}
        </span>
      )}
    </div>
  );
}

function SkeletonBlock({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-lg bg-[#EDE5C0]/60 ${className}`} />;
}

export function PmsReferralsMeaningCard({
  months,
  topSources,
  totalProduction,
  totalReferrals,
  doctorPercentage,
  referralData,
  isProcessingInsights,
  onOpenSources,
  onOpenTrends,
}: PmsReferralsMeaningCardProps) {
  const latest = getLatestMonth(months);
  const previous = getPreviousMonth(months);
  const hasMonthData = months.length > 0;
  const hasSourceData = topSources.length > 0;

  const productionChange = latest
    ? getPercentChange(latest.productionTotal, previous?.productionTotal)
    : null;
  const referralChange = latest
    ? getPercentChange(latest.totalReferrals, previous?.totalReferrals)
    : null;

  const insightBullets = referralData?.executive_summary ?? [];
  const primaryInsight = insightBullets[0] ?? null;
  const topSource = topSources[0] ?? null;
  const selfPercentage = Math.max(100 - doctorPercentage, 0);

  const actions = [
    { label: "See all sources ranked", onClick: onOpenSources },
    { label: "View referral trends", onClick: onOpenTrends },
  ];

  return (
    <section
      data-wizard-target="pms-vitals"
      className="animate-in fade-in slide-in-from-bottom-2 duration-700 delay-150"
    >
      <div className="rounded-[16px] border border-[#EDE5C0] bg-[#FCFAED] px-6 py-6 shadow-premium lg:px-7 lg:py-7">
        {/* Insight header */}
        <div className="mb-5 flex items-center gap-2">
          <span className="rounded-xl bg-alloro-orange/10 p-2 text-alloro-orange">
            <Sparkles className="h-4 w-4" />
          </span>
          <span className="font-mono-display text-[10px] font-bold uppercase tracking-[0.18em] text-[#6F664A]">
            What the data says
          </span>
        </div>

        {/* Main grid: insight + metrics (left) | top source + CTAs (right) */}
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_330px] xl:items-stretch">
          {/* Left column */}
          <div className="flex h-full min-w-0 flex-col gap-5">
            {/* AI insight sentence */}
            <div>
              {isProcessingInsights ? (
                <div className="space-y-3">
                  <SkeletonBlock className="h-7 w-full" />
                  <SkeletonBlock className="h-7 w-3/4" />
                </div>
              ) : primaryInsight ? (
                <p className="font-display text-[18px] font-medium leading-[1.4] tracking-tight text-[#2C2A26] md:text-[22px]">
                  {primaryInsight}
                </p>
              ) : (
                <p className="font-display text-[16px] font-medium leading-[1.4] tracking-tight text-[#6F664A]/60 md:text-[19px]">
                  Referral intelligence will appear after PMS data has been
                  approved and processed.
                </p>
              )}
            </div>

            {/* Key metrics inset */}
            <div className="flex flex-1 items-stretch rounded-[14px] border border-[#EDE5C0] bg-white/75 p-5 lg:p-6">
              {isProcessingInsights ? (
                <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="space-y-3 rounded-xl border border-[#EDE5C0]/70 bg-white/70 p-4">
                      <SkeletonBlock className="h-3 w-20" />
                      <SkeletonBlock className="h-9 w-28" />
                      <SkeletonBlock className="h-3 w-28" />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2">
                  <MeaningMetric
                    label="Production this month"
                    value={
                      hasMonthData
                        ? formatCurrency(latest?.productionTotal ?? 0)
                        : "—"
                    }
                    change={hasMonthData ? productionChange : undefined}
                    isAccent
                  />
                  <MeaningMetric
                    label="Total referrals"
                    value={
                      hasMonthData
                        ? String(latest?.totalReferrals ?? 0)
                        : "—"
                    }
                    sub={
                      hasMonthData
                        ? `${latest?.doctorReferrals ?? 0} doctor · ${latest?.selfReferrals ?? 0} self`
                        : undefined
                    }
                    change={hasMonthData ? referralChange : undefined}
                  />
                  <MeaningMetric
                    label="Unique sources"
                    value={
                      hasSourceData ? String(topSources.length) : "—"
                    }
                    sub={
                      hasSourceData
                        ? `${months.length} months tracked`
                        : undefined
                    }
                  />
                  <MeaningMetric
                    label="YTD production"
                    value={
                      totalProduction > 0
                        ? formatCompactCurrency(totalProduction)
                        : "—"
                    }
                    sub={
                      totalReferrals > 0
                        ? `${totalReferrals} total referrals`
                        : undefined
                    }
                  />
                </div>
              )}
            </div>
          </div>

          {/* Right column */}
          <div data-wizard-target="pms-insights" className="flex flex-col gap-4">
            {/* Top source highlight */}
            <div className="flex min-h-[180px] flex-col justify-center rounded-[14px] border border-[#EDE5C0] bg-white/70 px-5 py-5">
              <span className="mb-3 font-mono-display text-[10px] font-bold uppercase tracking-[0.18em] text-[#6F664A]">
                Top source
              </span>
              {isProcessingInsights ? (
                <div className="space-y-3">
                  <SkeletonBlock className="h-6 w-40" />
                  <SkeletonBlock className="h-4 w-52" />
                </div>
              ) : topSource ? (
                <>
                  <h3 className="font-display text-[19px] font-medium leading-tight tracking-tight text-alloro-navy">
                    {topSource.name}
                  </h3>
                  <p className="mt-2 text-[13px] font-semibold leading-relaxed text-[#6F664A]/70">
                    {topSource.referrals} referrals &middot;{" "}
                    {topSource.percentage}% of production
                  </p>
                  {hasMonthData && (
                    <p className="mt-1.5 text-[12px] font-semibold text-[#6F664A]/50">
                      {doctorPercentage}% doctor &middot; {selfPercentage}% self
                    </p>
                  )}
                </>
              ) : (
                <p className="text-[13px] font-medium text-[#6F664A]/50">
                  Upload PMS data to rank referral sources.
                </p>
              )}
            </div>

            {/* CTA buttons */}
            <div data-wizard-target="pms-velocity" className="rounded-[14px] border border-[#EDE5C0] bg-white/75 p-5">
              <div className="grid grid-cols-1 gap-2">
                {actions.map((action) => (
                  <motion.button
                    key={action.label}
                    type="button"
                    onClick={action.onClick}
                    className="inline-flex min-h-[44px] w-full items-center justify-between gap-2 rounded-[10px] border border-[#EDE5C0] bg-white px-3 py-2.5 text-left text-[10px] font-black uppercase tracking-[0.1em] text-alloro-navy/70 transition-colors hover:border-alloro-orange/25 hover:bg-alloro-orange/10 hover:text-alloro-orange focus:outline-none focus:ring-2 focus:ring-alloro-orange/30"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    whileHover={{ y: -1 }}
                    transition={{ duration: 0.22, ease: "easeOut" }}
                  >
                    {action.label}
                    <ChevronRight size={14} />
                  </motion.button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
