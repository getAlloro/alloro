import { useId } from "react";
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
import { PmsCardShell, PmsEyebrow } from "./primitives";
import type { HubTrendDatum } from "./pmsPeriod";

/**
 * PmsHubTrendChart — lean dual-line (production + referrals) chart for the
 * simplified Referrals Hub. Reuses PmsProductionChart's recharts config +
 * colors but drops the headline number, "view pace" button, and velocity
 * modal. Consumes pre-bucketed period rows from `bucketByPeriod`.
 *
 * Spec: plans/06102026-referrals-hub-simplification/spec.html (T1)
 */

export type PmsHubTrendChartProps = {
  data: HubTrendDatum[];
  periodLabel: string;
  /**
   * Fires with the hovered bucket while the pointer is over the chart and
   * `null` on leave — the surface scopes its stat tiles to it.
   */
  onHoverChange?: (datum: HubTrendDatum | null) => void;
};

function getAxisDomain(values: number[]): [number, number] {
  const safe = values.length > 0 ? values : [0];
  const min = Math.min(...safe);
  const max = Math.max(...safe);
  const range = max - min || Math.max(max, 1);
  const padding = range * 0.18;
  return [Math.max(0, min - padding), max + padding];
}

export function PmsHubTrendChart({
  data,
  periodLabel,
  onHoverChange,
}: PmsHubTrendChartProps) {
  const gradientId = useId().replaceAll(":", "");
  const productionDomain = getAxisDomain(data.map((d) => d.production));
  const referralDomain = getAxisDomain(data.map((d) => d.referrals));

  const handleChartHover = (state?: {
    activeTooltipIndex?: number | string | null;
  }) => {
    if (!onHoverChange) return;
    const index = Number(state?.activeTooltipIndex);
    onHoverChange(Number.isInteger(index) ? (data[index] ?? null) : null);
  };

  return (
    <PmsCardShell>
      <div className="mb-5 flex items-center justify-between gap-3">
        <PmsEyebrow>Production &amp; referrals · {periodLabel}</PmsEyebrow>
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

      {data.length > 0 ? (
        <div className="h-44 w-full cursor-crosshair">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={data}
              margin={{ top: 10, right: 8, bottom: 2, left: 8 }}
              onMouseMove={handleChartHover}
              onMouseLeave={() => onHoverChange?.(null)}
            >
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-alloro-orange)" stopOpacity={0.2} />
                  <stop offset="100%" stopColor="var(--color-alloro-orange)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="var(--color-pm-border-subtle)" strokeDasharray="3 5" />
              <XAxis
                dataKey="label"
                axisLine={false}
                tickLine={false}
                tick={{ fill: "var(--color-pm-text-secondary)", fontSize: 10, fontWeight: 700 }}
                minTickGap={12}
              />
              <YAxis yAxisId="production" hide domain={productionDomain} />
              <YAxis yAxisId="referrals" hide domain={referralDomain} />
              <Tooltip content={() => null} cursor={{ stroke: "var(--color-pm-border)", strokeDasharray: "4 4" }} />
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
                dot={{ r: 3.5, fill: "var(--color-alloro-orange)", stroke: "var(--color-pm-bg-secondary)", strokeWidth: 2 }}
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
                dot={{ r: 3, fill: "var(--color-pm-success)", stroke: "var(--color-pm-bg-secondary)", strokeWidth: 2 }}
                activeDot={{ r: 4.5, fill: "var(--color-pm-success)", stroke: "var(--color-pm-bg-secondary)", strokeWidth: 2 }}
                isAnimationActive
                animationDuration={700}
                animationBegin={120}
                animationEasing="ease-out"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="rounded-[14px] border border-dashed border-line-soft bg-[#FCFAED] p-10 text-center text-sm font-semibold text-[color:var(--color-pm-text-secondary)]">
          Upload PMS data to see production &amp; referrals.
        </div>
      )}
    </PmsCardShell>
  );
}

export default PmsHubTrendChart;
