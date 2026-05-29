import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export type FocusTrendDatum = {
  key: string;
  label: string;
  tooltipLabel: string;
  value: number;
  detail?: string;
};

export type FocusTrendChartProps = {
  data: FocusTrendDatum[];
  color: string;
  gradientId: string;
  ariaLabel: string;
  emptyLabel: string;
  valueLabel: (value: number) => string;
};

const MUTED = "#8E8579";
const INK = "#1F1B16";

function FocusTrendTooltip({
  active,
  payload,
  valueLabel,
}: {
  active?: boolean;
  payload?: Array<{ payload?: FocusTrendDatum }>;
  valueLabel: (value: number) => string;
}) {
  const datum = payload?.[0]?.payload;
  if (!active || !datum) return null;

  return (
    <div className="rounded-[10px] border border-[#E8E4DD] bg-white px-3 py-2 shadow-lg">
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#8E8579]">
        {datum.tooltipLabel}
      </p>
      <p className="mt-1 text-[12px] font-semibold text-[#1F1B16]">
        {valueLabel(datum.value)}
      </p>
      {datum.detail && (
        <p className="mt-0.5 text-[11px] text-[#8E8579]">{datum.detail}</p>
      )}
    </div>
  );
}

export function FocusTrendChart({
  data,
  color,
  gradientId,
  ariaLabel,
  emptyLabel,
  valueLabel,
}: FocusTrendChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex h-[116px] items-center justify-center rounded-[10px] border border-dashed border-[#E8E4DD] text-[12px] font-medium text-[#8E8579]">
        {emptyLabel}
      </div>
    );
  }

  return (
    <div className="h-[116px] w-full" aria-label={ariaLabel}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 6, right: 4, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.22} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
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
          <Tooltip
            cursor={{ stroke: INK, strokeOpacity: 0.12 }}
            content={<FocusTrendTooltip valueLabel={valueLabel} />}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={2.4}
            fill={`url(#${gradientId})`}
            activeDot={{ r: 4, strokeWidth: 2, stroke: "#FDFDFD", fill: color }}
            name="Value"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export default FocusTrendChart;
