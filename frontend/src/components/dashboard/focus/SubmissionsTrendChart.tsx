import { useMemo } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TimeseriesPoint } from "../../../api/formSubmissionsTimeseries";

type SubmissionsTrendChartProps = {
  points: TimeseriesPoint[];
};

type ChartDatum = {
  month: string;
  label: string;
  total: number;
  spam: number;
  blocked: number;
};

const BRAND_ORANGE = "#D66853";
const MUTED = "#8E8579";
const INK = "#1F1B16";

function monthLabel(month: string): string {
  const match = /^(\d{4})-(\d{2})/.exec(month);
  if (!match) return month;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1));
  return date.toLocaleDateString("en-US", { month: "short" });
}

function tooltipLabel(month: string): string {
  const match = /^(\d{4})-(\d{2})/.exec(month);
  if (!match) return month;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1));
  return date.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

function pointTotal(point: TimeseriesPoint): number {
  return point.total ?? point.verified + point.flagged;
}

function ChartTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload?: ChartDatum }>;
}) {
  const datum = payload?.[0]?.payload;
  if (!active || !datum) return null;

  return (
    <div className="rounded-[10px] border border-[#E8E4DD] bg-white px-3 py-2 shadow-lg">
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#8E8579]">
        {tooltipLabel(datum.month)}
      </p>
      <p className="mt-1 text-[12px] font-semibold text-[#1F1B16]">
        {datum.total} total submissions
      </p>
      <p className="mt-0.5 text-[11px] text-[#8E8579]">
        {datum.spam} spam · {datum.blocked} blocked
      </p>
    </div>
  );
}

export function SubmissionsTrendChart({
  points,
}: SubmissionsTrendChartProps) {
  const data = useMemo<ChartDatum[]>(
    () =>
      points.map((point) => ({
        month: point.month,
        label: monthLabel(point.month),
        total: pointTotal(point),
        spam: point.flagged,
        blocked: point.blocked ?? 0,
      })),
    [points],
  );

  if (data.length === 0) {
    return (
      <div className="flex h-[116px] items-center justify-center rounded-[10px] border border-dashed border-[#E8E4DD] text-[12px] font-medium text-[#8E8579]">
        No monthly submission trend yet
      </div>
    );
  }

  return (
    <div className="h-[116px] w-full" aria-label="Monthly form submissions trend">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 6, right: 4, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="submissions-total" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={BRAND_ORANGE} stopOpacity={0.22} />
              <stop offset="100%" stopColor={BRAND_ORANGE} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="#F0ECE5" strokeDasharray="3 5" />
          <XAxis
            dataKey="label"
            axisLine={false}
            tickLine={false}
            tick={{ fill: MUTED, fontSize: 10, fontWeight: 700 }}
            minTickGap={16}
          />
          <YAxis
            hide
            allowDecimals={false}
            domain={[0, (max: number) => Math.max(4, Math.ceil(max * 1.15))]}
          />
          <Tooltip cursor={{ stroke: INK, strokeOpacity: 0.12 }} content={<ChartTooltip />} />
          <Area
            type="monotone"
            dataKey="total"
            stroke={BRAND_ORANGE}
            strokeWidth={2.4}
            fill="url(#submissions-total)"
            activeDot={{ r: 4, strokeWidth: 2, stroke: "#FDFDFD" }}
            name="Total submissions"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export default SubmissionsTrendChart;
