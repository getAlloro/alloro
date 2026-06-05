import { useId, useMemo, useState } from "react";
import { Activity } from "lucide-react";
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
import type { MissionControlTelemetryDailyPoint } from "../../../../api/admin-mission-control";

export type TelemetryTrendChartProps = {
  data: MissionControlTelemetryDailyPoint[];
};

type TrendDatum = MissionControlTelemetryDailyPoint & {
  label: string;
  tooltipLabel: string;
};

export function TelemetryTrendChart({ data }: TelemetryTrendChartProps) {
  const gradientId = useId().replaceAll(":", "");
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const chartData = useMemo(
    () =>
      data.map((day) => ({
        ...day,
        label: formatDate(day.date, { month: "short", day: "numeric" }),
        tooltipLabel: formatDate(day.date, {
          month: "short",
          day: "numeric",
          year: "numeric",
        }),
      })),
    [data],
  );

  const activeIndex = hoverIndex ?? Math.max(chartData.length - 1, 0);
  const activeDay = chartData[activeIndex];

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-alloro-teal/10 text-alloro-teal">
            <Activity className="h-4.5 w-4.5" />
          </span>
          <div>
            <h2 className="text-base font-black text-alloro-navy">
              Usage Trend
            </h2>
            <p className="mt-1 text-xs font-medium text-gray-500">
              Active users and page views by day.
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-black uppercase text-gray-400">
            Active Day
          </p>
          <p className="text-sm font-black tabular-nums text-alloro-navy">
            {activeDay ? `${activeDay.activeUsers} users` : "-"}
          </p>
        </div>
      </div>

      <div className="mt-4 h-64 w-full cursor-crosshair">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={chartData}
            margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
            onMouseMove={(state) => {
              const next = Number(state?.activeTooltipIndex);
              if (Number.isInteger(next)) setHoverIndex(next);
            }}
            onMouseLeave={() => setHoverIndex(null)}
          >
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#14b8a6" stopOpacity={0.18} />
                <stop offset="100%" stopColor="#14b8a6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="#e5e7eb" strokeDasharray="3 5" />
            <XAxis dataKey="label" axisLine={false} tickLine={false} tick={false} />
            <YAxis hide domain={[0, (max: number) => Math.max(1, Math.ceil(max * 1.2))]} />
            <Tooltip
              cursor={{ stroke: "#11151c", strokeOpacity: 0.12 }}
              content={<TrendTooltip />}
            />
            <Area
              type="monotone"
              dataKey="activeUsers"
              stroke="none"
              fill={`url(#${gradientId})`}
            />
            <Line
              type="monotone"
              dataKey="activeUsers"
              stroke="var(--color-alloro-teal)"
              strokeWidth={2.8}
              dot={false}
              activeDot={{ r: 5, fill: "var(--color-alloro-teal)", strokeWidth: 0 }}
            />
            <Line
              type="monotone"
              dataKey="pageViews"
              stroke="var(--color-alloro-orange)"
              strokeWidth={2.2}
              dot={false}
              activeDot={{ r: 4, fill: "var(--color-alloro-orange)", strokeWidth: 0 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

function TrendTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload?: TrendDatum }>;
}) {
  const datum = payload?.[0]?.payload;
  if (!active || !datum) return null;

  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-lg">
      <p className="text-[10px] font-black uppercase text-gray-400">
        {datum.tooltipLabel}
      </p>
      <p className="mt-1 text-xs font-black tabular-nums text-alloro-navy">
        {datum.activeUsers} users · {datum.pageViews} views · {datum.activeMinutes}m
      </p>
    </div>
  );
}

function formatDate(value: string, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("en-US", options).format(
    new Date(`${value}T00:00:00Z`),
  );
}
