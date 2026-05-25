import { useId, useMemo, useState } from "react";
import { TrendingUp } from "lucide-react";
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
import type { MissionControlMonthBucket } from "../../../api/admin-mission-control";

export type MissionControlRevenueTrendProps = { data: MissionControlMonthBucket[] };

type RevenueTrendDatum = MissionControlMonthBucket & {
  label: string;
  tooltipLabel: string;
};

export function MissionControlRevenueTrend({ data }: MissionControlRevenueTrendProps) {
  const gradientId = useId().replaceAll(":", "");
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const chartData = useMemo(
    () =>
      data.map((month) => ({
        ...month,
        label: formatMonth(month.month, { month: "short" }),
        tooltipLabel: formatMonth(month.month, {
          month: "long",
          year: "numeric",
        }),
      })),
    [data],
  );

  const activeIndex = hoverIndex ?? Math.max(chartData.length - 1, 0);
  const activeMonth = chartData[activeIndex];
  const totalRevenue = data.reduce((sum, month) => sum + month.amount, 0);
  const firstLabel = chartData[0]?.label ?? "-";
  const middleLabel = chartData[Math.floor(chartData.length / 2)]?.label ?? "-";
  const lastLabel = chartData[chartData.length - 1]?.label ?? "-";

  const handleChartHover = (
    state?: { activeTooltipIndex?: number | string | null },
  ) => {
    const nextIndex = Number(state?.activeTooltipIndex);
    if (Number.isInteger(nextIndex)) setHoverIndex(nextIndex);
  };

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
              <TrendingUp className="h-4 w-4" />
            </span>
            <h2 className="text-base font-black text-alloro-navy">
              Recurring Revenue
            </h2>
          </div>
          <p className="mt-2 text-xs font-medium leading-5 text-gray-500">
            Last 12 months by paid invoice month.
          </p>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-black uppercase text-gray-400">
            12 Mo
          </p>
          <p className="text-sm font-black tabular-nums text-emerald-600">
            {formatCurrency(totalRevenue)}
          </p>
        </div>
      </div>

      <div className="mt-4 flex items-baseline gap-2">
        <span className="text-xl font-black tabular-nums text-alloro-navy">
          {formatCurrency(activeMonth?.amount ?? 0)}
        </span>
        <span className="text-xs font-bold text-gray-500">
          {activeMonth?.tooltipLabel ?? "No month"}
        </span>
      </div>

      <div
        className="mt-3 h-40 w-full cursor-crosshair"
        aria-label="Last 12 months recurring revenue"
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={chartData}
            margin={{ top: 8, right: 4, bottom: 0, left: 4 }}
            onMouseMove={handleChartHover}
            onMouseLeave={() => setHoverIndex(null)}
          >
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="0%"
                  stopColor="var(--color-alloro-teal)"
                  stopOpacity={0.2}
                />
                <stop
                  offset="100%"
                  stopColor="var(--color-alloro-teal)"
                  stopOpacity={0}
                />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="#e5e7eb" strokeDasharray="3 5" />
            <XAxis dataKey="label" axisLine={false} tickLine={false} tick={false} />
            <YAxis
              hide
              domain={[0, (max: number) => Math.max(1, Math.ceil(max * 1.15))]}
            />
            <Tooltip
              cursor={{ stroke: "#11151c", strokeOpacity: 0.12 }}
              content={<RevenueTrendTooltip />}
            />
            <Area
              type="monotone"
              dataKey="amount"
              stroke="none"
              fill={`url(#${gradientId})`}
              isAnimationActive
              animationDuration={650}
              animationEasing="ease-out"
            />
            <Line
              type="monotone"
              dataKey="amount"
              stroke="var(--color-alloro-teal)"
              strokeWidth={2.8}
              dot={{ r: 3.5, fill: "var(--color-alloro-teal)", strokeWidth: 0 }}
              activeDot={{
                r: 5,
                fill: "var(--color-alloro-teal)",
                stroke: "#f6f8fb",
                strokeWidth: 2,
              }}
              isAnimationActive
              animationDuration={650}
              animationEasing="ease-out"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-1 grid grid-cols-3 text-[10px] font-black uppercase text-gray-400">
        <span>{firstLabel}</span>
        <span className="text-center">{middleLabel}</span>
        <span className="text-right">{lastLabel}</span>
      </div>
    </section>
  );
}

function RevenueTrendTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload?: RevenueTrendDatum }>;
}) {
  const datum = payload?.[0]?.payload;
  if (!active || !datum) return null;

  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-lg">
      <p className="text-[10px] font-black uppercase text-gray-400">
        {datum.tooltipLabel}
      </p>
      <p className="mt-1 text-xs font-black tabular-nums text-alloro-navy">
        {formatCurrency(datum.amount)}
      </p>
    </div>
  );
}

function formatMonth(value: string, options: Intl.DateTimeFormatOptions): string {
  const [year, month] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", options).format(
    new Date(Date.UTC(year, month - 1, 1)),
  );
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}
