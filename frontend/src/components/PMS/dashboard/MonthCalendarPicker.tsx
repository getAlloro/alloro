import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence, type Variants } from "framer-motion";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import type { PmsKeyDataMonth } from "../../../api/pms";
import { parseYM } from "./pmsPeriod";
import { formatDataMonth } from "../../../utils/timeframe";

/**
 * MonthCalendarPicker — animated month picker for the comparison modal.
 * Shows a year header (prev/next) over a 12-month grid; only months that exist
 * in the data are selectable. Month keys may be "YYYY-MM" or "Apr 2026", so the
 * grid maps each cell back to the original key via parseYM.
 */

const MONTH_ABBR = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

type AvailableMonths = {
  /** year*100 + month -> original month key */
  byValue: Map<number, string>;
  minYear: number;
  maxYear: number;
};

function buildAvailable(months: PmsKeyDataMonth[]): AvailableMonths {
  const byValue = new Map<number, string>();
  let minYear = Number.POSITIVE_INFINITY;
  let maxYear = Number.NEGATIVE_INFINITY;
  for (const month of months) {
    const parsed = parseYM(month.month);
    if (!parsed) continue;
    byValue.set(parsed.year * 100 + parsed.month, month.month);
    minYear = Math.min(minYear, parsed.year);
    maxYear = Math.max(maxYear, parsed.year);
  }
  return { byValue, minYear, maxYear };
}

const popVariants: Variants = {
  hidden: { opacity: 0, y: -6, scale: 0.98 },
  show: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { type: "spring", stiffness: 420, damping: 30, staggerChildren: 0.015 },
  },
  exit: { opacity: 0, y: -6, scale: 0.98, transition: { duration: 0.12 } },
};
const cellVariants: Variants = {
  hidden: { opacity: 0, scale: 0.9 },
  show: { opacity: 1, scale: 1 },
};

function cellClass(isSelected: boolean, isAvailable: boolean): string {
  const base = "rounded-lg px-2 py-2 text-sm font-medium transition-colors";
  if (isSelected) return `${base} bg-alloro-orange text-white`;
  if (!isAvailable) return `${base} cursor-not-allowed text-ink-muted/40`;
  return `${base} text-alloro-navy hover:bg-alloro-orange/10`;
}

function MonthGrid({
  viewYear,
  selectedValue,
  available,
  onPick,
}: {
  viewYear: number;
  selectedValue: number | null;
  available: AvailableMonths;
  onPick: (key: string) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-1.5">
      {MONTH_ABBR.map((abbr, index) => {
        const value = viewYear * 100 + (index + 1);
        const key = available.byValue.get(value);
        const isAvailable = Boolean(key);
        return (
          <motion.button
            key={abbr}
            type="button"
            variants={cellVariants}
            disabled={!isAvailable}
            aria-pressed={selectedValue === value}
            onClick={() => key && onPick(key)}
            className={cellClass(selectedValue === value, isAvailable)}
          >
            {abbr}
          </motion.button>
        );
      })}
    </div>
  );
}

export function MonthCalendarPicker({
  id,
  label,
  valueKey,
  months,
  onChange,
}: {
  id: string;
  label: string;
  valueKey: string | null;
  months: PmsKeyDataMonth[];
  onChange: (key: string) => void;
}) {
  const available = useMemo(() => buildAvailable(months), [months]);
  const selected = valueKey ? parseYM(valueKey) : null;
  const selectedValue = selected ? selected.year * 100 + selected.month : null;

  const [open, setOpen] = useState(false);
  const [viewYear, setViewYear] = useState(selected?.year ?? available.maxYear);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const toggle = () => {
    setViewYear(selected?.year ?? available.maxYear);
    setOpen((value) => !value);
  };

  const pick = (key: string) => {
    onChange(key);
    setOpen(false);
  };

  return (
    <div className="relative flex-1" ref={containerRef}>
      <span
        id={`${id}-label`}
        className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.16em] text-ink-muted"
      >
        {label}
      </span>
      <button
        id={id}
        type="button"
        onClick={toggle}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-labelledby={`${id}-label ${id}`}
        className="flex w-full items-center justify-between rounded-xl border border-line-soft bg-white px-3 py-2.5 text-sm font-medium text-alloro-navy shadow-premium transition-colors hover:border-alloro-orange/40 focus:outline-none focus:ring-2 focus:ring-alloro-teal/50"
      >
        <span>{formatDataMonth(valueKey) || "Select month"}</span>
        <ChevronDown
          className={`h-4 w-4 text-ink-muted transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            variants={popVariants}
            initial="hidden"
            animate="show"
            exit="exit"
            role="dialog"
            className="absolute left-0 right-0 top-full z-20 mt-2 rounded-2xl border border-line-soft bg-white p-3 shadow-2xl"
          >
            <div className="mb-2 flex items-center justify-between">
              <button
                type="button"
                aria-label="Previous year"
                disabled={viewYear <= available.minYear}
                onClick={() => setViewYear((year) => year - 1)}
                className="rounded-lg p-1 text-ink-muted transition-colors hover:bg-line-soft disabled:opacity-30 disabled:hover:bg-transparent"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="font-display text-sm font-semibold tabular-nums text-alloro-navy">
                {viewYear}
              </span>
              <button
                type="button"
                aria-label="Next year"
                disabled={viewYear >= available.maxYear}
                onClick={() => setViewYear((year) => year + 1)}
                className="rounded-lg p-1 text-ink-muted transition-colors hover:bg-line-soft disabled:opacity-30 disabled:hover:bg-transparent"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            <MonthGrid
              viewYear={viewYear}
              selectedValue={selectedValue}
              available={available}
              onPick={pick}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
