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

const numberFormat = new Intl.NumberFormat("en-US");

/**
 * Shared trend sparkline in the Alloro house chart style (matches
 * PmsProductionChart / GbpEngagementSparkline): orange primary line + gradient
 * wash, optional secondary line, hidden axes with a separate first/middle/last
 * label row, no tooltip box (a dashed cursor drives a headline number the parent
 * renders via `onActiveIndexChange`).
 *
 * Must be rendered inside a `.pm-light` wrapper — the `--color-pm-*` tokens used
 * for the grid, dot halos, and labels are dark by default.
 */
export type TrendSparklineProps = {
  data: Array<Record<string, number | string>>;
  /** Key of the primary (orange) numeric series. */
  valueKey: string;
  /** Key of the short x-axis label rendered in the first/middle/last row. */
  labelKey: string;
  /** Optional secondary numeric series (defaults to navy). */
  secondaryKey?: string;
  secondaryColor?: string;
  /** Chart body height in px (default 144 → h-36). */
  height?: number;
  /** Called with the hovered point index, or the last index, or null on leave. */
  onActiveIndexChange?: (index: number | null) => void;
  /** Render the first/middle/last label row beneath the chart (default true). */
  showLabels?: boolean;
  /** Formats the value shown in the hover readout (default: comma number). */
  valueFormatter?: (value: number) => string;
};

function paddedDomain(values: number[]): [number, number] {
  const safe = values.length > 0 ? values : [0];
  const max = Math.max(...safe, 0);
  const padding = Math.max(1, Math.ceil(max * 0.16));
  return [0, max + padding];
}

export function TrendSparkline({
  data,
  valueKey,
  labelKey,
  secondaryKey,
  secondaryColor = "var(--color-alloro-navy)",
  height = 144,
  onActiveIndexChange,
  showLabels = true,
  valueFormatter,
}: TrendSparklineProps) {
  const gradientId = useId().replaceAll(":", "");
  const [active, setActive] = useState<number | null>(null);
  const fmtValue =
    valueFormatter ?? ((v: number) => numberFormat.format(Math.round(v)));

  const domain = useMemo(() => {
    const nums: number[] = [];
    data.forEach((point) => {
      const primary = Number(point[valueKey]);
      if (Number.isFinite(primary)) nums.push(primary);
      if (secondaryKey) {
        const secondary = Number(point[secondaryKey]);
        if (Number.isFinite(secondary)) nums.push(secondary);
      }
    });
    return paddedDomain(nums);
  }, [data, valueKey, secondaryKey]);

  const firstLabel = String(data[0]?.[labelKey] ?? "—");
  const middleLabel = String(data[Math.floor(data.length / 2)]?.[labelKey] ?? "—");
  const lastLabel = String(data[data.length - 1]?.[labelKey] ?? "—");

  const handleHover = (state?: { activeTooltipIndex?: number | string | null }) => {
    const nextIndex = Number(state?.activeTooltipIndex);
    if (Number.isInteger(nextIndex)) {
      setActive(nextIndex);
      onActiveIndexChange?.(nextIndex);
    }
  };
  const handleLeave = () => {
    setActive(null);
    onActiveIndexChange?.(null);
  };
  const activePoint = active !== null ? data[active] : null;

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center rounded-[10px] border border-dashed border-line-soft bg-[#FCFAED] text-center text-xs font-bold text-[color:var(--color-pm-text-secondary)]"
        style={{ height }}
      >
        Trend appears once data is available.
      </div>
    );
  }

  return (
    <div>
      <div className="relative w-full cursor-crosshair" style={{ height }}>
        {activePoint ? (
          <div className="pointer-events-none absolute right-1 top-0 z-10 rounded-md bg-alloro-navy px-2 py-0.5 text-[10px] font-bold tabular-nums text-white shadow-sm">
            {String(activePoint[labelKey])} · {fmtValue(Number(activePoint[valueKey]))}
          </div>
        ) : null}
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={data}
            margin={{ top: 8, right: 8, bottom: 4, left: 8 }}
            onMouseMove={handleHover}
            onMouseLeave={handleLeave}
          >
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-alloro-orange)" stopOpacity={0.18} />
                <stop offset="100%" stopColor="var(--color-alloro-orange)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid
              vertical={false}
              stroke="var(--color-pm-border-subtle)"
              strokeDasharray="3 5"
            />
            <XAxis dataKey={labelKey} axisLine={false} tickLine={false} tick={false} height={4} />
            <YAxis hide domain={domain} />
            <Tooltip
              content={() => null}
              cursor={{ stroke: "var(--color-pm-border)", strokeDasharray: "4 4" }}
            />
            <Area
              type="monotone"
              dataKey={valueKey}
              stroke="none"
              fill={`url(#${gradientId})`}
              isAnimationActive
              animationDuration={700}
              animationEasing="ease-out"
            />
            {secondaryKey ? (
              <Line
                type="monotone"
                dataKey={secondaryKey}
                stroke={secondaryColor}
                strokeWidth={2.5}
                dot={{ r: 3.5, fill: secondaryColor, stroke: "var(--color-pm-bg-secondary)", strokeWidth: 2 }}
                activeDot={{ r: 4.5, fill: secondaryColor, stroke: "var(--color-pm-bg-secondary)", strokeWidth: 2 }}
                isAnimationActive
                animationDuration={700}
                animationBegin={120}
                animationEasing="ease-out"
              />
            ) : null}
            <Line
              type="monotone"
              dataKey={valueKey}
              stroke="var(--color-alloro-orange)"
              strokeWidth={3}
              dot={{ r: 4, fill: "var(--color-alloro-orange)", stroke: "var(--color-pm-bg-secondary)", strokeWidth: 2 }}
              activeDot={{ r: 5, fill: "var(--color-alloro-orange)", stroke: "var(--color-pm-bg-secondary)", strokeWidth: 2 }}
              isAnimationActive
              animationDuration={700}
              animationEasing="ease-out"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      {showLabels ? (
        <div className="mt-1 grid grid-cols-3 text-[10px] font-bold uppercase tracking-widest text-[color:var(--color-pm-text-secondary)]">
          <span>{firstLabel}</span>
          <span className="text-center">{middleLabel}</span>
          <span className="text-right">{lastLabel}</span>
        </div>
      ) : null}
    </div>
  );
}
