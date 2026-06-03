import type { PmsDataTrendMonth } from "./PmsDataTrendGraph";
import {
  PMS_DATA_TREND_GRAPH,
  formatDataTrendProduction,
  formatDataTrendReferrals,
} from "./utils";

export type PmsDataTrendHoverCardProps = {
  month: PmsDataTrendMonth;
  x: number;
  count: number;
};

export function PmsDataTrendHoverCard({
  month,
  x,
  count,
}: PmsDataTrendHoverCardProps) {
  const { width, height, padY } = PMS_DATA_TREND_GRAPH;
  const tooltipWidth = 152;
  const tooltipHeight = 60;
  const tooltipX = Math.min(Math.max(x - tooltipWidth / 2, 8), width - tooltipWidth - 8);
  const action = month.status === "active" ? "Click to edit" : "Click to upload";

  return (
    <g className="pointer-events-none">
      <line
        x1={x}
        x2={x}
        y1={padY}
        y2={height - padY}
        className="stroke-alloro-orange/25"
        strokeDasharray="4 6"
      />
      <rect
        x={tooltipX}
        y="4"
        width={tooltipWidth}
        height={tooltipHeight}
        rx="10"
        className="fill-white stroke-line-soft drop-shadow-sm"
      />
      <text x={tooltipX + 12} y="22" className="fill-alloro-navy text-[10px] font-black uppercase tracking-widest">
        {month.label}
      </text>
      <text x={tooltipX + 12} y="39" className="fill-alloro-orange text-[11px] font-bold">
        {formatDataTrendProduction(month.productionTotal)}
      </text>
      <text x={tooltipX + 12} y="54" className="fill-emerald-700 text-[11px] font-bold">
        {formatDataTrendReferrals(month.totalReferrals)}
      </text>
      <text x={tooltipX + tooltipWidth - 10} y="22" textAnchor="end" className="fill-alloro-navy/40 text-[8px] font-black uppercase tracking-widest">
        {action}
      </text>
      <circle
        cx={x}
        cy={height - padY}
        r={count > 10 ? "2.5" : "3"}
        className="fill-alloro-orange"
      />
    </g>
  );
}
