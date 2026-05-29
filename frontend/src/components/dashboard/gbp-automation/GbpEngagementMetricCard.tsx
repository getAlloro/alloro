import { motion } from "framer-motion";
import { Info } from "lucide-react";

export type GbpEngagementMetricTone = "neutral" | "attention";

export type GbpEngagementMetricCardProps = {
  label: string;
  value: string;
  tooltip?: string;
  tone?: GbpEngagementMetricTone;
};

export function GbpEngagementMetricCard({
  label,
  value,
  tooltip,
  tone = "neutral",
}: GbpEngagementMetricCardProps) {
  const isLongValue = value.length > 8;

  return (
    <div className="flex min-h-[74px] flex-col justify-between rounded-[10px] border border-line-soft bg-white px-3 py-2.5 shadow-sm">
      <div className="flex items-center gap-1.5">
        <p className="text-[8px] font-black uppercase tracking-[0.18em] text-slate-400">
          {label}
        </p>
        {tooltip && (
          <span
            className="group/tip relative inline-flex shrink-0 cursor-help outline-none"
            tabIndex={0}
            role="button"
            aria-label={`${label} help`}
          >
            <Info size={11} className="text-slate-300 transition-colors group-hover/tip:text-alloro-navy/55 group-focus/tip:text-alloro-navy/55" />
            <span
              role="tooltip"
              className="invisible pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 w-56 -translate-x-1/2 translate-y-1 rounded-lg bg-alloro-navy px-3 py-2 text-[11px] font-medium normal-case leading-relaxed tracking-normal text-white opacity-0 shadow-lg transition-[opacity,transform,visibility] duration-150 ease-out group-hover/tip:visible group-hover/tip:translate-y-0 group-hover/tip:opacity-100 group-focus/tip:visible group-focus/tip:translate-y-0 group-focus/tip:opacity-100"
            >
              <span className="absolute left-1/2 top-full h-0 w-0 -translate-x-1/2 border-[5px] border-transparent border-t-alloro-navy" />
              {tooltip}
            </span>
          </span>
        )}
      </div>
      <motion.p
        key={value}
        className={`mt-1.5 font-display font-medium leading-none tabular-nums ${
          tone === "attention" ? "text-alloro-orange" : "text-alloro-navy"
        } ${isLongValue ? "text-[18px] lg:text-[19px]" : "text-[24px] lg:text-[26px]"}`}
        animate={{ scale: [1, 1.14, 1] }}
        transition={{ duration: 0.36, ease: "easeOut" }}
      >
        {value}
      </motion.p>
    </div>
  );
}
