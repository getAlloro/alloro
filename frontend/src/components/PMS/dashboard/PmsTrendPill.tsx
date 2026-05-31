import { ArrowUpRight, Minus, TrendingDown } from "lucide-react";

export type PmsTrendPillProps = {
  change: number | null;
};

export function PmsTrendPill({ change }: PmsTrendPillProps) {
  const isPositive = change !== null && change > 0;
  const isNegative = change !== null && change < 0;

  const className = isPositive
    ? "bg-green-50 text-green-700 border-green-100"
    : isNegative
      ? "bg-red-50 text-red-700 border-red-100"
      : "bg-slate-100 text-slate-500 border-slate-200";

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${className}`}
    >
      {isPositive && <ArrowUpRight className="h-3 w-3" />}
      {isNegative && <TrendingDown className="h-3 w-3" />}
      {!isPositive && !isNegative && <Minus className="h-3 w-3" />}
      {change === null ? "New" : `${change > 0 ? "+" : ""}${change}%`}
    </span>
  );
}
