import type { PmsKeyDataMonth } from "../../../api/pms";
import { formatCompactCurrency } from "./utils";
import { pctChange } from "./compareMonths.utils";
import { PmsEyebrow } from "./primitives";

/**
 * CompareMetricGrid — the headline metric comparison for two months.
 * "Change" reads left-to-right: month B relative to month A (A is the earlier
 * month by default), so an increase from A to B shows an up arrow.
 */

type Metric = {
  key: string;
  label: string;
  valueA: number;
  valueB: number;
  format: (n: number) => string;
};

const formatNumber = (n: number): string => n.toLocaleString("en-US");

function ChangeBadge({ current, baseline }: { current: number; baseline: number }) {
  const delta = current - baseline;
  const pct = pctChange(current, baseline);
  const tone =
    delta > 0 ? "text-emerald-600" : delta < 0 ? "text-red-600" : "text-ink-muted";
  const arrow = delta > 0 ? "▲" : delta < 0 ? "▼" : "—";
  return (
    <span className={`text-sm font-semibold tabular-nums ${tone}`}>
      {arrow}
      {pct === null ? "" : ` ${Math.abs(pct)}%`}
    </span>
  );
}

function MetricRow({ metric }: { metric: Metric }) {
  return (
    <div className="grid grid-cols-[1.3fr_1fr_1fr_0.8fr] items-center gap-2 px-5 py-3">
      <span className="text-sm font-medium text-ink-muted">{metric.label}</span>
      <span className="text-right font-display text-lg font-medium tabular-nums text-alloro-navy">
        {metric.format(metric.valueA)}
      </span>
      <span className="text-right font-display text-lg font-medium tabular-nums text-alloro-navy/70">
        {metric.format(metric.valueB)}
      </span>
      <span className="text-right">
        <ChangeBadge current={metric.valueB} baseline={metric.valueA} />
      </span>
    </div>
  );
}

export function CompareMetricGrid({
  monthA,
  monthB,
  labelA,
  labelB,
}: {
  monthA: PmsKeyDataMonth;
  monthB: PmsKeyDataMonth;
  labelA: string;
  labelB: string;
}) {
  const metrics: Metric[] = [
    {
      key: "production",
      label: "Production",
      valueA: monthA.productionTotal,
      valueB: monthB.productionTotal,
      format: formatCompactCurrency,
    },
    {
      key: "total",
      label: "Total referrals",
      valueA: monthA.totalReferrals,
      valueB: monthB.totalReferrals,
      format: formatNumber,
    },
    {
      key: "doctor",
      label: "Doctor referrals",
      valueA: monthA.doctorReferrals,
      valueB: monthB.doctorReferrals,
      format: formatNumber,
    },
    {
      key: "self",
      label: "Self referrals",
      valueA: monthA.selfReferrals,
      valueB: monthB.selfReferrals,
      format: formatNumber,
    },
  ];

  return (
    <div className="rounded-[14px] border border-line-soft bg-white shadow-premium">
      <div className="grid grid-cols-[1.3fr_1fr_1fr_0.8fr] items-center gap-2 border-b border-line-soft px-5 py-3">
        <span />
        <PmsEyebrow className="text-right">{labelA}</PmsEyebrow>
        <PmsEyebrow className="text-right">{labelB}</PmsEyebrow>
        <PmsEyebrow className="text-right">Change</PmsEyebrow>
      </div>
      <div className="divide-y divide-line-soft">
        {metrics.map((metric) => (
          <MetricRow key={metric.key} metric={metric} />
        ))}
      </div>
    </div>
  );
}
