import { useId, useMemo, useState } from "react";
import {
  Area,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { LineChart as LineChartIcon } from "lucide-react";
import type { PmsDashboardMonth } from "./types";
import { formatCurrency, getLatestMonth } from "./utils";
import { PmsCardShell, PmsEyebrow } from "./primitives";
import { PmsVelocityCard } from "./PmsVelocityCard";
import { DetailsModal } from "../../dashboard/shared/DetailsModal";

export type PmsProductionChartProps = {
  months: PmsDashboardMonth[];
  isProcessingInsights: boolean;
};

const getAxisDomain = (values: number[]): [number, number] => {
  const safeValues = values.length > 0 ? values : [0];
  const min = Math.min(...safeValues);
  const max = Math.max(...safeValues);
  const range = max - min || Math.max(max, 1);
  const padding = range * 0.18;
  return [Math.max(0, min - padding), max + padding];
};

export function PmsProductionChart({
  months,
  isProcessingInsights,
}: PmsProductionChartProps) {
  const gradientId = useId().replaceAll(":", "");
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [isPaceOpen, setIsPaceOpen] = useState(false);
  const latest = getLatestMonth(months);

  const chartData = useMemo(() => {
    return months.map((month, index) => ({
      ...month,
      index,
      label: month.month,
      production: month.productionTotal,
      referrals: month.totalReferrals,
    }));
  }, [months]);

  const productionDomain = useMemo(
    () => getAxisDomain(months.map((month) => month.productionTotal)),
    [months],
  );
  const referralDomain = useMemo(
    () => getAxisDomain(months.map((month) => month.totalReferrals)),
    [months],
  );
  const activeIndex = hoverIndex ?? Math.max(months.length - 1, 0);
  const activeMonth = months[activeIndex] ?? latest;
  const firstLabel = months[0]?.month ?? "—";
  const middleLabel = months[Math.floor(months.length / 2)]?.month ?? "—";
  const lastLabel = latest?.month ?? "—";

  const handleChartHover = (state?: { activeTooltipIndex?: number | string | null }) => {
    const nextIndex = Number(state?.activeTooltipIndex);
    if (Number.isInteger(nextIndex)) {
      setHoverIndex(nextIndex);
    }
  };

  return (
    <PmsCardShell>
      <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <PmsEyebrow>Production trend</PmsEyebrow>
          <div className="mt-2 flex flex-wrap items-baseline gap-2">
            <span className="font-display text-4xl font-medium leading-none tracking-tight text-alloro-navy tabular-nums">
              {formatCurrency(activeMonth?.productionTotal ?? 0)}
            </span>
            <span className="text-sm font-semibold text-[color:var(--color-pm-text-secondary)]">
              {activeMonth?.month ?? "No month"}
            </span>
          </div>
          {activeMonth && (
            <p className="mt-1 text-xs font-semibold uppercase tracking-wider text-[color:var(--color-pm-text-secondary)]">
              {activeMonth.totalReferrals} referrals ·{" "}
              {activeMonth.doctorReferrals} doctor · {activeMonth.selfReferrals} self
            </p>
          )}
        </div>
        <div className="flex gap-4 text-[10px] font-bold uppercase tracking-widest text-[color:var(--color-pm-text-secondary)]">
          <span className="inline-flex items-center gap-2">
            <span className="h-1 w-4 rounded-full bg-alloro-orange" />
            Production
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="h-1 w-4 rounded-full bg-green-700" />
            Referrals
          </span>
        </div>
      </div>

      {months.length > 0 ? (
        <>
          <div className="h-44 w-full cursor-crosshair">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={chartData}
                margin={{ top: 10, right: 8, bottom: 2, left: 8 }}
                onMouseMove={handleChartHover}
                onMouseLeave={() => setHoverIndex(null)}
              >
                <defs>
                  <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-alloro-orange)" stopOpacity={0.2} />
                    <stop offset="100%" stopColor="var(--color-alloro-orange)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="var(--color-pm-border-subtle)" strokeDasharray="3 5" />
                <XAxis dataKey="label" axisLine={false} tickLine={false} tick={false} height={4} />
                <YAxis yAxisId="production" hide domain={productionDomain} />
                <YAxis yAxisId="referrals" hide domain={referralDomain} />
                <Tooltip
                  content={() => null}
                  cursor={{ stroke: "var(--color-pm-border)", strokeDasharray: "4 4" }}
                />
                <Area
                  yAxisId="production"
                  type="monotone"
                  dataKey="production"
                  stroke="none"
                  fill={`url(#${gradientId})`}
                  isAnimationActive
                  animationDuration={700}
                  animationEasing="ease-out"
                />
                <Line
                  yAxisId="production"
                  type="monotone"
                  dataKey="production"
                  stroke="var(--color-alloro-orange)"
                  strokeWidth={3}
                  dot={{ r: 4, fill: "var(--color-alloro-orange)", stroke: "var(--color-pm-bg-secondary)", strokeWidth: 2 }}
                  activeDot={{ r: 5, fill: "var(--color-alloro-orange)", stroke: "var(--color-pm-bg-secondary)", strokeWidth: 2 }}
                  isAnimationActive
                  animationDuration={700}
                  animationEasing="ease-out"
                />
                <Line
                  yAxisId="referrals"
                  type="monotone"
                  dataKey="referrals"
                  stroke="var(--color-pm-success)"
                  strokeWidth={2.5}
                  dot={{ r: 3.5, fill: "var(--color-pm-success)", stroke: "var(--color-pm-bg-secondary)", strokeWidth: 2 }}
                  activeDot={{ r: 4.5, fill: "var(--color-pm-success)", stroke: "var(--color-pm-bg-secondary)", strokeWidth: 2 }}
                  isAnimationActive
                  animationDuration={700}
                  animationBegin={120}
                  animationEasing="ease-out"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="grid grid-cols-3 text-[10px] font-bold uppercase tracking-[0.16em] text-[color:var(--color-pm-text-secondary)]">
            <span>{firstLabel}</span>
            <span className="text-center">{middleLabel}</span>
            <span className="text-right">{lastLabel}</span>
          </div>
          <div className="mt-5 border-t border-line-soft pt-4">
            <button
              type="button"
              data-wizard-target="pms-velocity"
              onClick={() => setIsPaceOpen(true)}
              className="inline-flex items-center gap-2 rounded-[10px] px-2 py-1 text-xs font-semibold text-alloro-navy/70 transition-colors hover:bg-alloro-navy/5 hover:text-alloro-navy focus:outline-none focus:ring-2 focus:ring-alloro-orange/40"
            >
              <LineChartIcon size={14} className="text-alloro-orange" />
              View monthly pace
            </button>
          </div>
        </>
      ) : (
        <div className="rounded-[14px] border border-dashed border-line-soft bg-[#FCFAED] p-10 text-center text-sm font-semibold text-[color:var(--color-pm-text-secondary)]">
          {isProcessingInsights
            ? "Your production trend will appear once PMS processing finishes."
            : "Upload PMS data to see production trends."}
        </div>
      )}

      <DetailsModal
        open={isPaceOpen}
        title="Monthly referral pace"
        eyebrow="Referral velocity · Last 6 months"
        onClose={() => setIsPaceOpen(false)}
      >
        <PmsVelocityCard months={months} isProcessingInsights={isProcessingInsights} />
      </DetailsModal>
    </PmsCardShell>
  );
}
