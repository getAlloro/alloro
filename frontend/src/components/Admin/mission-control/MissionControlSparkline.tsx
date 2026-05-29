import { useId, useMemo } from "react";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  YAxis,
} from "recharts";
import type { MissionControlMonthBucket } from "../../../api/admin-mission-control";

export type MissionControlSparklineProps = {
  data: MissionControlMonthBucket[];
  tone?: "teal" | "orange" | "red";
};

type SparklineDatum = MissionControlMonthBucket & {
  label: string;
};

const TONE_COLOR: Record<NonNullable<MissionControlSparklineProps["tone"]>, string> = {
  teal: "var(--color-alloro-teal)",
  orange: "var(--color-alloro-orange)",
  red: "var(--color-alloro-danger)",
};

export function MissionControlSparkline({
  data,
  tone = "teal",
}: MissionControlSparklineProps) {
  const gradientId = useId().replaceAll(":", "");
  const color = TONE_COLOR[tone];
  const chartData = useMemo(
    () =>
      data.map((bucket) => ({
        ...bucket,
        label: formatMonth(bucket.month),
      })),
    [data],
  );

  return (
    <div className="h-14 w-full" aria-label="Paid invoice movement">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.2} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <YAxis hide domain={[0, (max: number) => Math.max(1, Math.ceil(max * 1.15))]} />
          <Tooltip
            content={<SparklineTooltip />}
            cursor={{ stroke: color, strokeOpacity: 0.22 }}
          />
          <Area
            type="monotone"
            dataKey="amount"
            stroke={color}
            strokeWidth={2.4}
            fill={`url(#${gradientId})`}
            dot={false}
            activeDot={{ r: 3.5, fill: color, stroke: "var(--color-alloro-surface)", strokeWidth: 2 }}
            isAnimationActive
            animationDuration={550}
            animationEasing="ease-out"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function SparklineTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload?: SparklineDatum }>;
}) {
  const datum = payload?.[0]?.payload;
  if (!active || !datum) return null;

  return (
    <div className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 shadow-lg">
      <p className="text-[9px] font-black uppercase text-gray-400">{datum.label}</p>
      <p className="mt-0.5 text-[11px] font-black tabular-nums text-alloro-navy">
        {formatCurrency(datum.amount)}
      </p>
    </div>
  );
}

function formatMonth(value: string): string {
  const [year, month] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    year: "numeric",
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}
