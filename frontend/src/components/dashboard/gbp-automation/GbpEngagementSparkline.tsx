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
import type { GbpReviewMonthBucket } from "../../../api/gbpAutomation";

const MONTH_WINDOW = 12;

export type GbpEngagementSparklineProps = {
  needsReplyMonths: GbpReviewMonthBucket[];
  repliedMonths: GbpReviewMonthBucket[];
};

type ChartPoint = {
  month: string;
  label: string;
  total: number;
  unreplied: number;
  replied: number;
  shortLabel: string;
  index: number;
};

function buildChartPoints(
  needsReplyMonths: GbpReviewMonthBucket[],
  repliedMonths: GbpReviewMonthBucket[]
): ChartPoint[] {
  const byMonth = new Map<string, ChartPoint>();

  needsReplyMonths.forEach((month) => {
    byMonth.set(month.month, {
      month: month.month,
      label: month.label,
      total: month.count,
      unreplied: month.count,
      replied: 0,
      shortLabel: monthShortLabel(month.label),
      index: 0,
    });
  });

  repliedMonths.forEach((month) => {
    const existing = byMonth.get(month.month);
    if (existing) {
      existing.total += month.count;
      existing.replied += month.count;
      return;
    }

    byMonth.set(month.month, {
      month: month.month,
      label: month.label,
      total: month.count,
      unreplied: 0,
      replied: month.count,
      shortLabel: monthShortLabel(month.label),
      index: 0,
    });
  });

  return Array.from(byMonth.values())
    .sort((left, right) => left.month.localeCompare(right.month))
    .slice(-MONTH_WINDOW)
    .map((point, index) => ({ ...point, index }));
}

function monthShortLabel(label: string): string {
  return label.replace(/\s+\d{4}$/u, "").slice(0, 3);
}

function numberLabel(value: number): string {
  return value.toLocaleString();
}

export function GbpEngagementSparkline({
  needsReplyMonths,
  repliedMonths,
}: GbpEngagementSparklineProps) {
  const gradientId = useId().replaceAll(":", "");
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const points = useMemo(
    () => buildChartPoints(needsReplyMonths, repliedMonths),
    [needsReplyMonths, repliedMonths]
  );
  const maxValue = Math.max(1, ...points.flatMap((point) => [point.total, point.unreplied]));
  const activePoint = points[hoverIndex ?? Math.max(points.length - 1, 0)];
  const firstLabel = points[0]?.shortLabel || "-";
  const middleLabel = points[Math.floor(points.length / 2)]?.shortLabel || "-";
  const lastLabel = points[points.length - 1]?.shortLabel || "-";

  const handleChartHover = (state?: { activeTooltipIndex?: number | string | null }) => {
    const nextIndex = Number(state?.activeTooltipIndex);
    if (Number.isInteger(nextIndex)) setHoverIndex(nextIndex);
  };

  if (points.length === 0) {
    return (
      <div className="flex min-h-[128px] items-center justify-center rounded-[10px] border border-dashed border-slate-200 bg-slate-50 text-center text-xs font-bold text-slate-400">
        Review trend appears after reviews sync.
      </div>
    );
  }

  return (
    <div className="rounded-[10px] border border-slate-200 bg-slate-50 p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
            {activePoint?.label || "Latest month"}
          </p>
          <p className="mt-1 font-display text-2xl font-medium text-alloro-navy tabular-nums">
            {numberLabel(activePoint?.total || 0)} reviews
          </p>
        </div>
        <p className="text-xs font-bold text-alloro-orange tabular-nums">
          {numberLabel(activePoint?.unreplied || 0)} need replies
        </p>
      </div>
      <div className="h-36 w-full cursor-crosshair">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={points}
            margin={{ top: 8, right: 8, bottom: 4, left: 8 }}
            onMouseMove={handleChartHover}
            onMouseLeave={() => setHoverIndex(null)}
          >
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-alloro-orange)" stopOpacity={0.18} />
                <stop offset="100%" stopColor="var(--color-alloro-orange)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="var(--color-pm-border-subtle)" strokeDasharray="3 5" />
            <XAxis dataKey="shortLabel" axisLine={false} tickLine={false} tick={false} height={4} />
            <YAxis hide domain={[0, maxValue + Math.max(1, Math.ceil(maxValue * 0.16))]} />
            <Tooltip content={() => null} cursor={{ stroke: "var(--color-pm-border)", strokeDasharray: "4 4" }} />
            <Area type="monotone" dataKey="unreplied" stroke="none" fill={`url(#${gradientId})`} />
            <Line
              type="monotone"
              dataKey="total"
              stroke="var(--color-alloro-navy)"
              strokeWidth={3}
              dot={{ r: 4, fill: "var(--color-alloro-navy)", stroke: "var(--color-alloro-surface)", strokeWidth: 2 }}
              activeDot={{ r: 5, fill: "var(--color-alloro-navy)", stroke: "var(--color-alloro-surface)", strokeWidth: 2 }}
            />
            <Line
              type="monotone"
              dataKey="unreplied"
              stroke="var(--color-alloro-orange)"
              strokeWidth={2.75}
              dot={{ r: 3.5, fill: "var(--color-alloro-orange)", stroke: "var(--color-alloro-surface)", strokeWidth: 2 }}
              activeDot={{ r: 4.5, fill: "var(--color-alloro-orange)", stroke: "var(--color-alloro-surface)", strokeWidth: 2 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="grid grid-cols-3 text-[10px] font-black uppercase tracking-widest text-slate-400">
        <span>{firstLabel}</span>
        <span className="text-center">{middleLabel}</span>
        <span className="text-right">{lastLabel}</span>
      </div>
    </div>
  );
}
