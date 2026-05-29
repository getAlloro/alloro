import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronDown } from "lucide-react";
import {
  COMPARISON_SORT_OPTIONS,
  type ComparisonSortKey,
} from "./competitorComparison";

export type CompetitorComparisonSortMenuProps = {
  value: ComparisonSortKey;
  onChange: (value: ComparisonSortKey) => void;
};

export function CompetitorComparisonSortMenu({
  value,
  onChange,
}: CompetitorComparisonSortMenuProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const activeOption = COMPARISON_SORT_OPTIONS.find(
    (option) => option.key === value,
  );

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={menuRef} className="relative flex shrink-0 items-center gap-2">
      <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-alloro-navy/45">
        Sort by
      </span>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="inline-flex min-w-[164px] items-center justify-between gap-3 rounded-[10px] border border-line-soft bg-[#F7F5F1] px-3 py-2 text-left text-[12px] font-black text-alloro-navy shadow-sm transition-colors hover:border-alloro-orange/30 hover:bg-white focus:outline-none focus:ring-2 focus:ring-alloro-orange/30"
      >
        <span>{activeOption?.label ?? "Local Search"}</span>
        <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.18 }}>
          <ChevronDown size={14} className="text-alloro-navy/45" />
        </motion.span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="listbox"
            className="absolute right-0 top-full z-30 mt-2 w-[210px] overflow-hidden rounded-[12px] border border-line-soft bg-white p-1.5 shadow-2xl shadow-alloro-navy/10"
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.16, ease: "easeOut" }}
          >
            {COMPARISON_SORT_OPTIONS.map((option, index) => {
              const selected = option.key === value;
              return (
                <motion.button
                  key={option.key}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => {
                    onChange(option.key);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center justify-between rounded-[9px] px-3 py-2.5 text-left text-[12px] font-bold transition-colors ${
                    selected
                      ? "bg-alloro-orange/10 text-alloro-orange"
                      : "text-alloro-navy/70 hover:bg-alloro-navy/[0.035] hover:text-alloro-navy"
                  }`}
                  initial={{ opacity: 0, x: -4 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.025, duration: 0.14 }}
                >
                  {option.label}
                  {selected && <Check size={14} />}
                </motion.button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
