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
import type {
  MissionControlTelemetryDailyPoint,
  MissionControlTelemetryGranularity,
} from "../../../../api/admin-mission-control";

export type TelemetryTrendVariant = "aggregate" | "organization" | "user";

export type TelemetryTrendChartProps = {
  data: MissionControlTelemetryDailyPoint[];
  variant: TelemetryTrendVariant;
  granularity: MissionControlTelemetryGranularity;
};

type TrendDatum = MissionControlTelemetryDailyPoint & {
  label: string;
  tooltipLabel: string;
  primaryValue: number;
};

type VariantConfig = {
  subtitle: (bucket: string) => string;
  primaryKey: "activeOrganizations" | "activeUsers" | "activeMinutes";
  chip: (datum: TrendDatum) => string;
  tooltip: (datum: TrendDatum) => string;
  hasMinutesLine: boolean;
};

const VARIANT_CONFIG: Record<TelemetryTrendVariant, VariantConfig> = {
  aggregate: {
    subtitle: (bucket) => `Active organizations and minutes by ${bucket}.`,
    primaryKey: "activeOrganizations",
    chip: (datum) => `${datum.primaryValue} orgs`,
    tooltip: (datum) => `${datum.primaryValue} orgs · ${datum.activeMinutes}m`,
    hasMinutesLine: true,
  },
  organization: {
    subtitle: (bucket) => `Active users and minutes by ${bucket}.`,
    primaryKey: "activeUsers",
    chip: (datum) => `${datum.primaryValue} users`,
    tooltip: (datum) => `${datum.primaryValue} users · ${datum.activeMinutes}m`,
    hasMinutesLine: true,
  },
  user: {
    subtitle: (bucket) => `Active minutes by ${bucket}.`,
    primaryKey: "activeMinutes",
    chip: (datum) => `${datum.primaryValue}m`,
    tooltip: (datum) => `${datum.activeMinutes}m · ${datum.pageViews} views`,
    hasMinutesLine: false,
  },
};

export function TelemetryTrendChart({
  data,
  variant,
  granularity,
}: TelemetryTrendChartProps) {
  const gradientId = useId().replaceAll(":", "");
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const config = VARIANT_CONFIG[variant];
  const chartData = useMemo(
    () =>
      data.map((bucket) => ({
        ...bucket,
        label: formatDate(
          bucket.date,
          granularity === "month"
            ? { month: "short", year: "numeric" }
            : { month: "short", day: "numeric" },
        ),
        tooltipLabel: formatDate(
          bucket.date,
          granularity === "month"
            ? { month: "long", year: "numeric" }
            : { month: "short", day: "numeric", year: "numeric" },
        ),
        primaryValue: Number(bucket[config.primaryKey] ?? 0),
      })),
    [data, granularity, config.primaryKey],
  );

  const latestActiveIndex = findLatestActiveIndex(chartData);
  const activeIndex =
    hoverIndex ?? latestActiveIndex ?? Math.max(chartData.length - 1, 0);
  const activeBucket = chartData[activeIndex];

  return (
    <section className="self-start rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
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
              {config.subtitle(granularity === "month" ? "month" : "day")}
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-black uppercase text-gray-400">
            {granularity === "month" ? "Active Month" : "Active Day"}
          </p>
          <p className="text-sm font-black tabular-nums text-alloro-navy">
            {activeBucket ? config.chip(activeBucket) : "-"}
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
            <CartesianGrid
              vertical={false}
              stroke="#e5e7eb"
              strokeDasharray="3 5"
            />
            <XAxis
              dataKey="label"
              axisLine={false}
              tickLine={false}
              tick={false}
            />
            {/* Separate hidden axes: counts (orgs/users) and minutes live on
                very different scales — one axis would flatline the counts. */}
            <YAxis
              yAxisId="primary"
              hide
              domain={[0, (max: number) => Math.max(1, Math.ceil(max * 1.2))]}
            />
            {config.hasMinutesLine && (
              <YAxis
                yAxisId="minutes"
                hide
                orientation="right"
                domain={[0, (max: number) => Math.max(1, Math.ceil(max * 1.2))]}
              />
            )}
            <Tooltip
              cursor={{ stroke: "#11151c", strokeOpacity: 0.12 }}
              content={<TrendTooltip render={config.tooltip} />}
            />
            <Area
              yAxisId="primary"
              type="monotone"
              dataKey="primaryValue"
              stroke="none"
              fill={`url(#${gradientId})`}
            />
            <Line
              yAxisId="primary"
              type="monotone"
              dataKey="primaryValue"
              stroke="var(--color-alloro-teal)"
              strokeWidth={2.8}
              dot={false}
              activeDot={{
                r: 5,
                fill: "var(--color-alloro-teal)",
                strokeWidth: 0,
              }}
            />
            {config.hasMinutesLine && (
              <Line
                yAxisId="minutes"
                type="monotone"
                dataKey="activeMinutes"
                stroke="var(--color-alloro-orange)"
                strokeWidth={2.2}
                dot={false}
                activeDot={{
                  r: 4,
                  fill: "var(--color-alloro-orange)",
                  strokeWidth: 0,
                }}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

function TrendTooltip({
  active,
  payload,
  render,
}: {
  active?: boolean;
  payload?: Array<{ payload?: TrendDatum }>;
  render: (datum: TrendDatum) => string;
}) {
  const datum = payload?.[0]?.payload;
  if (!active || !datum) return null;

  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-lg">
      <p className="text-[10px] font-black uppercase text-gray-400">
        {datum.tooltipLabel}
      </p>
      <p className="mt-1 text-xs font-black tabular-nums text-alloro-navy">
        {render(datum)}
      </p>
    </div>
  );
}

function formatDate(
  value: string,
  options: Intl.DateTimeFormatOptions,
): string {
  return new Intl.DateTimeFormat("en-US", options).format(parseDateKey(value));
}

function parseDateKey(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function findLatestActiveIndex(data: TrendDatum[]): number | null {
  for (let index = data.length - 1; index >= 0; index -= 1) {
    const bucket = data[index];
    if (bucket.primaryValue > 0 || bucket.activeMinutes > 0) {
      return index;
    }
  }
  return null;
}
