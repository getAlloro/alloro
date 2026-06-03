import { useState, type KeyboardEvent } from "react";
import { PmsDataTrendHoverCard } from "./PmsDataTrendHoverCard";
import {
  PMS_DATA_TREND_GRAPH,
  buildDataTrendGraphSegments,
  formatDataTrendProduction,
  formatDataTrendReferrals,
  getDataTrendGraphX,
  getDataTrendGraphY,
  getMaxNullableValue,
} from "./utils";

export type PmsDataTrendMonth = {
  month: string;
  label: string;
  status: "active" | "missing" | "ready";
  isLatest: boolean;
  productionTotal: number | null;
  totalReferrals: number | null;
};

export type PmsDataTrendGraphProps = {
  months: PmsDataTrendMonth[];
  onSelectMonth?: (month: string) => void;
};

export function PmsDataTrendGraph({
  months,
  onSelectMonth,
}: PmsDataTrendGraphProps) {
  const [hoveredMonth, setHoveredMonth] = useState<PmsDataTrendMonth | null>(null);
  if (months.length === 0) return null;

  const productionMax = getMaxNullableValue(months.map((month) => month.productionTotal));
  const referralMax = getMaxNullableValue(months.map((month) => month.totalReferrals));
  const windowLabel = `${months[0]?.label ?? ""} - ${months.at(-1)?.label ?? ""}`;
  const { width, height, padX, padY } = PMS_DATA_TREND_GRAPH;
  const hoveredIndex = hoveredMonth
    ? months.findIndex((month) => month.month === hoveredMonth.month)
    : -1;
  const hoveredX = hoveredIndex >= 0 ? getDataTrendGraphX(hoveredIndex, months.length) : null;

  return (
    <div className="rounded-2xl border border-line-soft bg-white p-4 shadow-sm">
      <header className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[9px] font-black uppercase tracking-[0.22em] text-alloro-orange">
            Data Trend
          </p>
          <p className="mt-1 text-xs font-black uppercase tracking-widest text-alloro-navy">
            {windowLabel}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-[9px] font-black uppercase tracking-widest text-alloro-navy/45">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-1 w-4 rounded-full bg-alloro-orange" />
            Production
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-1 w-4 rounded-full bg-emerald-700" />
            Referrals
          </span>
        </div>
      </header>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-48 w-full overflow-visible"
        role="img"
        aria-label="PMS production and referral trend by month"
        onMouseLeave={() => setHoveredMonth(null)}
      >
        {[0.25, 0.5, 0.75].map((fraction) => (
          <line
            key={fraction}
            x1={padX}
            x2={width - padX}
            y1={padY + fraction * (height - 2 * padY)}
            y2={padY + fraction * (height - 2 * padY)}
            className="stroke-line-soft"
            strokeDasharray="4 6"
          />
        ))}
        {buildDataTrendGraphSegments(months, "productionTotal", productionMax).map((points) => (
          <polyline
            key={`production-${points}`}
            points={points}
            fill="none"
            className="stroke-alloro-orange"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
        {buildDataTrendGraphSegments(months, "totalReferrals", referralMax).map((points) => (
          <polyline
            key={`referrals-${points}`}
            points={points}
            fill="none"
            className="stroke-emerald-700"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
        {months.map((month, index) =>
          renderMonthPoints({
            month,
            index,
            count: months.length,
            productionMax,
            referralMax,
            onSelectMonth,
            onHoverMonth: setHoveredMonth,
          })
        )}
        {hoveredMonth && hoveredX !== null && (
          <PmsDataTrendHoverCard
            month={hoveredMonth}
            x={hoveredX}
            count={months.length}
          />
        )}
      </svg>

      <div className="grid grid-cols-12 gap-1 text-center text-[9px] font-black uppercase tracking-[0.08em] text-alloro-navy/35">
        {months.map((month) => (
          <span key={month.month} className={month.isLatest ? "text-alloro-orange" : ""}>
            {month.label.split(" ")[0]}
          </span>
        ))}
      </div>
    </div>
  );
}

function renderMonthPoints({
  month,
  index,
  count,
  productionMax,
  referralMax,
  onSelectMonth,
  onHoverMonth,
}: {
  month: PmsDataTrendMonth;
  index: number;
  count: number;
  productionMax: number;
  referralMax: number;
  onSelectMonth?: (month: string) => void;
  onHoverMonth: (month: PmsDataTrendMonth | null) => void;
}) {
  const x = getDataTrendGraphX(index, count);
  const action = month.status === "active" ? "Edit data" : "Upload data";
  const label = `${month.label}. ${formatDataTrendProduction(month.productionTotal)}, ${formatDataTrendReferrals(month.totalReferrals)}. ${action}.`;
  const point = (
    y: number,
    className: string,
    key: string
  ) => (
    <g
      key={key}
      role="button"
      tabIndex={0}
      aria-label={label}
      className="cursor-pointer"
      onMouseEnter={() => onHoverMonth(month)}
      onFocus={() => onHoverMonth(month)}
      onBlur={() => onHoverMonth(null)}
      onClick={() => onSelectMonth?.(month.month)}
      onKeyDown={(event) => handlePointKeyDown(event, month.month, onSelectMonth)}
    >
      <title>{label}</title>
      <circle cx={x} cy={y} r="11" className="fill-transparent" />
      <circle cx={x} cy={y} r="4.5" className={className} strokeWidth="2.5" />
    </g>
  );

  if (month.status !== "active") {
    const color = month.status === "ready" ? "stroke-alloro-orange" : "stroke-alloro-navy/35";
    return point(PMS_DATA_TREND_GRAPH.height - PMS_DATA_TREND_GRAPH.padY, color, month.month);
  }

  return [
    point(getDataTrendGraphY(month.productionTotal, productionMax), "fill-white stroke-alloro-orange", `${month.month}-production`),
    point(getDataTrendGraphY(month.totalReferrals, referralMax), "fill-white stroke-emerald-700", `${month.month}-referrals`),
  ];
}

function handlePointKeyDown(
  event: KeyboardEvent<SVGGElement>,
  month: string,
  onSelectMonth?: (month: string) => void
) {
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  onSelectMonth?.(month);
}
