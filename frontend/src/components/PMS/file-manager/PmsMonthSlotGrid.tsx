import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Circle,
  PenLine,
  Upload,
} from "lucide-react";

export type PmsCalendarMonth = {
  month: string;
  status: "active" | "missing" | "ready";
  jobId: number | null;
  fileName: string | null;
  isLatest: boolean;
};

export type PmsMonthSlotGridProps = {
  months: PmsCalendarMonth[];
  selectedMonth: string | null;
  canManage: boolean;
  isProcessing: boolean;
  windowLabel: string;
  canGoNext: boolean;
  onSelectMonth: (month: PmsCalendarMonth) => void;
  onUploadMonth: (month: PmsCalendarMonth) => void;
  onEditMonth: (month: PmsCalendarMonth) => void;
  onPreviousWindow: () => void;
  onNextWindow: () => void;
  onCurrentWindow: () => void;
};

export function PmsMonthSlotGrid({
  months,
  selectedMonth,
  canManage,
  isProcessing,
  windowLabel,
  canGoNext,
  onSelectMonth,
  onUploadMonth,
  onEditMonth,
  onPreviousWindow,
  onNextWindow,
  onCurrentWindow,
}: PmsMonthSlotGridProps) {
  if (months.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-line-soft bg-white p-4 text-sm font-semibold text-[color:var(--color-pm-text-secondary)]">
        No month window available yet.
      </div>
    );
  }

  return (
    <div className="space-y-3 overflow-visible">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line-soft bg-white px-3 py-2">
        <div className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-widest text-alloro-navy">
          <CalendarDays className="h-4 w-4 text-alloro-orange" />
          {windowLabel}
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onPreviousWindow}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-line-soft bg-white text-alloro-navy transition hover:border-alloro-orange/40 hover:bg-alloro-orange/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-alloro-orange/25"
            aria-label="Show previous month window"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onCurrentWindow}
            className="inline-flex h-8 items-center justify-center rounded-lg border border-line-soft bg-white px-3 text-[10px] font-black uppercase tracking-widest text-alloro-navy transition hover:border-alloro-orange/40 hover:bg-alloro-orange/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-alloro-orange/25"
          >
            Current
          </button>
          <button
            type="button"
            onClick={onNextWindow}
            disabled={!canGoNext}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-line-soft bg-white text-alloro-navy transition hover:border-alloro-orange/40 hover:bg-alloro-orange/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-alloro-orange/25 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Show next month window"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2 overflow-visible">
        {months.map((slot, index) => {
          const isReady = slot.status === "ready";
          const isSelected = slot.month === selectedMonth;
          const popoverPosition = getPopoverPosition(index);
          const baseClass = slot.status === "active"
            ? `border-emerald-200 bg-emerald-50 text-emerald-800 hover:border-alloro-orange/40 ${
                isSelected ? "border-emerald-600 ring-2 ring-emerald-300/70" : ""
              }`
            : isReady
              ? `border-alloro-orange/40 bg-alloro-orange/10 text-alloro-orange hover:border-alloro-orange/70 ${
                  isSelected ? "border-alloro-orange ring-2 ring-alloro-orange/25" : ""
                }`
              : `border-dashed border-line-soft bg-white text-alloro-navy/45 hover:border-alloro-orange/40 hover:text-alloro-navy ${
                  isSelected ? "border-alloro-orange ring-2 ring-alloro-orange/25" : ""
                }`;

          return (
            <div key={slot.month} className="group relative">
              <button
                type="button"
                onClick={() => onSelectMonth(slot)}
                className={`flex min-h-[58px] w-full flex-col justify-between rounded-xl border px-3 py-2 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-alloro-orange/25 ${baseClass}`}
              >
                <span className="flex items-center justify-between gap-2">
                  {slot.status === "active" ? (
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  ) : isReady ? (
                    <AlertTriangle className="h-3.5 w-3.5" />
                  ) : (
                    <Circle className="h-3.5 w-3.5" />
                  )}
                  {slot.isLatest && (
                    <span
                      className="rounded-full bg-alloro-orange/10 px-1.5 py-0.5 text-[8px] text-alloro-orange"
                    >
                      Latest
                    </span>
                  )}
                </span>
                <span className="font-display text-sm font-semibold">
                  {formatMonth(slot.month)}
                </span>
              </button>

              {canManage && !isProcessing && (
                <div className={`pointer-events-none absolute top-full z-30 mt-2 flex translate-y-1 gap-1.5 rounded-xl border border-line-soft bg-white p-1.5 opacity-0 shadow-xl transition-all duration-150 group-hover:pointer-events-auto group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:translate-y-0 group-focus-within:opacity-100 ${popoverPosition}`}>
                  {slot.status === "active" && (
                    <button
                      type="button"
                      onClick={() => onEditMonth(slot)}
                      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-2 text-[10px] font-black uppercase tracking-widest text-alloro-navy hover:bg-alloro-orange/10"
                    >
                      <PenLine className="h-3 w-3" />
                      Edit data
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onUploadMonth(slot)}
                    className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-alloro-orange px-2.5 py-2 text-[10px] font-black uppercase tracking-widest text-white hover:brightness-110"
                  >
                    <Upload className="h-3 w-3" />
                    {slot.status === "active" ? "Overwrite data" : "Upload data"}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function getPopoverPosition(index: number) {
  const column = index % 4;
  if (column === 0) return "left-0";
  if (column === 3) return "right-0";
  return "left-1/2 -translate-x-1/2";
}

function formatMonth(month: string) {
  const parsed = new Date(`${month}-01T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return month;
  return parsed.toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
  });
}
