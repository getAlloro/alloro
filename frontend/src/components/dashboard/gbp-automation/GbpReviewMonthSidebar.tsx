import type { GbpReviewMonthBucket } from "../../../api/gbpAutomation";

export type GbpReviewMonthSidebarProps = {
  months: GbpReviewMonthBucket[];
  selectedMonth: string | null;
  onMonthChange: (month: string | null) => void;
};

export function GbpReviewMonthSidebar({
  months,
  selectedMonth,
  onMonthChange,
}: GbpReviewMonthSidebarProps) {
  if (months.length === 0) {
    return (
      <div className="rounded-[10px] border border-slate-200 bg-slate-50 p-3 text-xs font-bold text-slate-500">
        No review months yet.
      </div>
    );
  }

  return (
    <aside className="rounded-[10px] border border-slate-200 bg-slate-50 p-2">
      <p className="px-2 py-1 text-[10px] font-black uppercase tracking-widest text-slate-400">
        Months
      </p>
      <div className="mt-1 space-y-1">
        {months.map((month) => {
          const isSelected = selectedMonth === month.month;
          return (
            <button
              key={month.month}
              type="button"
              onClick={() => onMonthChange(month.month)}
              className={`flex w-full items-center justify-between gap-3 rounded-[9px] px-2.5 py-2 text-left text-xs font-bold transition-colors ${
                isSelected
                  ? "bg-alloro-navy text-white shadow-sm"
                  : "text-slate-600 hover:bg-white hover:text-alloro-navy"
              }`}
            >
              <span>{month.label}</span>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-black ${
                  isSelected ? "bg-white/15 text-white" : "bg-white text-slate-500"
                }`}
              >
                {month.count}
              </span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
