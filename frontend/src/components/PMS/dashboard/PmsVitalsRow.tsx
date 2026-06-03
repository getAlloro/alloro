import { PmsEyebrow } from "./primitives";
import { PmsTrendPill } from "./PmsTrendPill";
import type { PmsDashboardMonth } from "./types";
import {
  formatCompactCurrency,
  formatCurrency,
  getLatestMonth,
  getPercentChange,
  getPreviousMonth,
} from "./utils";

export type PmsVitalsRowProps = {
  months: PmsDashboardMonth[];
  totalProduction: number;
  totalReferrals: number;
  isLoading: boolean;
  isProcessingInsights: boolean;
};

type Metric = {
  label: string;
  value: string;
  sub?: string;
  change?: number | null;
  isAccent?: boolean;
  isEmpty?: boolean;
};

function PmsVitalCard({ metric, isLoading }: { metric: Metric; isLoading: boolean }) {
  return (
    <div className="rounded-[14px] border border-line-soft bg-white p-5 shadow-premium transition-all duration-200 hover:-translate-y-0.5 hover:border-alloro-orange/20 sm:p-6">
      <div className="mb-4">
        <PmsEyebrow>{metric.label}</PmsEyebrow>
      </div>
      {isLoading ? (
        <div className="space-y-3">
          <div className="h-8 w-28 animate-pulse rounded-lg bg-line-soft" />
          <div className="h-3 w-36 animate-pulse rounded bg-[#F7F5F3]" />
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between gap-3">
            <span
              className={`font-display text-3xl font-medium leading-none tracking-tight tabular-nums ${
                metric.isEmpty
                  ? "text-[color:var(--color-pm-text-secondary)]/50"
                  : metric.isAccent
                    ? "text-alloro-orange"
                    : "text-alloro-navy"
              }`}
            >
              {metric.value}
            </span>
            {!metric.isEmpty && metric.change !== undefined && (
              <PmsTrendPill change={metric.change} />
            )}
          </div>
          {metric.sub && (
            <p className="mt-2 text-xs font-semibold uppercase tracking-wider text-[color:var(--color-pm-text-secondary)]">
              {metric.sub}
            </p>
          )}
        </>
      )}
    </div>
  );
}

export function PmsVitalsRow({
  months,
  totalProduction,
  totalReferrals,
  isLoading,
  isProcessingInsights,
}: PmsVitalsRowProps) {
  const latest = getLatestMonth(months);
  const previous = getPreviousMonth(months);
  const hasMonthData = months.length > 0;
  const hasRollupData = totalProduction > 0 || totalReferrals > 0;
  const emptyMetricCopy = isProcessingInsights
    ? "Processing PMS data now"
    : "Your data will appear here after PMS data is uploaded";
  const productionChange = latest
    ? getPercentChange(latest.productionTotal, previous?.productionTotal)
    : null;
  const referralChange = latest
    ? getPercentChange(latest.totalReferrals, previous?.totalReferrals)
    : null;

  const metrics: Metric[] = [
    {
      label: "Production this month",
      value: hasMonthData ? formatCurrency(latest?.productionTotal ?? 0) : "—",
      sub: hasMonthData ? undefined : emptyMetricCopy,
      change: hasMonthData ? productionChange : undefined,
      isAccent: true,
      isEmpty: !hasMonthData,
    },
    {
      label: "Total referrals",
      value: hasMonthData ? String(latest?.totalReferrals ?? 0) : "—",
      sub: hasMonthData
        ? `${latest?.doctorReferrals ?? 0} doctor · ${latest?.selfReferrals ?? 0} self`
        : emptyMetricCopy,
      change: hasMonthData ? referralChange : undefined,
      isEmpty: !hasMonthData,
    },
    {
      label: "YTD production",
      value: hasRollupData ? formatCompactCurrency(totalProduction) : "—",
      sub: hasRollupData ? `${totalReferrals} total referrals` : emptyMetricCopy,
      isEmpty: !hasRollupData,
    },
  ];

  return (
    <div data-wizard-target="pms-vitals" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {metrics.map((metric) => (
        <PmsVitalCard key={metric.label} metric={metric} isLoading={isLoading} />
      ))}
    </div>
  );
}
