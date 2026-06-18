import { ArrowUpRight, TrendingDown } from "lucide-react";

// ============================================================================
// HELPER COMPONENTS - matches newdesign exactly
// ============================================================================

export const MetricCard = ({
  label,
  value,
  trend,
  isHighlighted,
}: {
  label: string;
  value: string;
  trend?: string;
  isHighlighted?: boolean;
}) => {
  const isUp = trend?.startsWith("+");
  const isDown = trend?.startsWith("-");

  return (
    <div
      className={`flex flex-col p-6 rounded-2xl border transition-all duration-500 ${
        isHighlighted
          ? "bg-white border-alloro-orange/20 shadow-premium"
          : "bg-white border-black/5 hover:border-alloro-orange/20 hover:shadow-premium"
      }`}
    >
      <span className="text-[10px] font-black text-alloro-textDark/40 uppercase tracking-[0.2em] mb-4 leading-none text-left">
        {label}
      </span>
      <div className="flex items-center justify-between">
        <span className="text-3xl font-black font-sans tracking-tighter leading-none text-alloro-navy">
          {value}
        </span>
        {trend && (
          <span
            className={`text-[11px] font-black px-2.5 py-1 rounded-lg flex items-center gap-1 shadow-sm ${
              isUp
                ? "bg-green-100 text-green-700"
                : isDown
                ? "bg-red-100 text-red-700"
                : "bg-slate-100 text-slate-600"
            }`}
          >
            {trend}{" "}
            {isUp ? (
              <ArrowUpRight size={10} />
            ) : isDown ? (
              <TrendingDown size={10} />
            ) : null}
          </span>
        )}
      </div>
    </div>
  );
};
