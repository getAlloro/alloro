import { useMemo, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUpDown, X } from "lucide-react";
import { CompetitorComparisonSortMenu } from "./CompetitorComparisonSortMenu";
import { CompetitorComparisonTable } from "./CompetitorComparisonTable";
import {
  buildCompetitorComparisonRows,
  getComparisonInsight,
  sortComparisonRows,
  type ComparisonRankingResultLike,
  type ComparisonSortKey,
} from "./competitorComparison";

export type CompetitorComparisonModalProps = {
  open: boolean;
  onClose: () => void;
  result: ComparisonRankingResultLike;
  factorBreakdown?: ReactNode;
};

const DEFAULT_SORT: ComparisonSortKey = "reviewCount";

export function CompetitorComparisonModal({
  open,
  onClose,
  result,
  factorBreakdown,
}: CompetitorComparisonModalProps) {
  const [sortKey, setSortKey] = useState<ComparisonSortKey>(DEFAULT_SORT);
  const rows = useMemo(() => buildCompetitorComparisonRows(result), [result]);
  const sortedRows = useMemo(
    () => sortComparisonRows(rows, sortKey),
    [rows, sortKey],
  );
  const insight = useMemo(
    () => getComparisonInsight(rows, sortKey),
    [rows, sortKey],
  );

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[110] flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
        >
          <motion.div
            className="absolute inset-0 bg-alloro-navy/55 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="competitor-comparison-title"
            className="relative flex max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-[16px] border border-white/70 bg-[#F7F5F1] shadow-2xl"
            initial={{ opacity: 0, scale: 0.96, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 16 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            onClick={(event) => event.stopPropagation()}
          >
            <header className="flex items-start justify-between gap-4 border-b border-line-soft bg-white px-6 py-5 lg:px-7">
              <div className="min-w-0">
                <span className="font-mono-display text-[10px] font-bold uppercase tracking-[0.18em] text-alloro-navy/40">
                  Practice Health comparison
                </span>
                <h2
                  id="competitor-comparison-title"
                  className="mt-1 font-display text-[24px] font-medium tracking-tight text-alloro-navy"
                >
                  How you compare against competitors
                </h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-[10px] p-2 text-alloro-navy/45 transition-colors hover:bg-alloro-navy/5 hover:text-alloro-navy focus:outline-none focus:ring-2 focus:ring-alloro-orange/40"
                aria-label="Close comparison modal"
              >
                <X size={20} />
              </button>
            </header>

            <div className="overflow-y-auto px-6 py-5 lg:px-7 lg:py-6">
              <motion.div
                className="mb-4 flex flex-col gap-3 rounded-[12px] border border-line-soft bg-white p-4 lg:flex-row lg:items-center lg:justify-between"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.08, duration: 0.22, ease: "easeOut" }}
              >
                <div className="flex items-center gap-3">
                  <motion.div
                    className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-alloro-orange/10 text-alloro-orange"
                    initial={{ rotate: -12, scale: 0.88 }}
                    animate={{ rotate: 0, scale: 1 }}
                    transition={{ delay: 0.12, duration: 0.28, ease: "easeOut" }}
                  >
                    <ArrowUpDown size={18} />
                  </motion.div>
                  <p className="text-[13px] font-semibold leading-relaxed text-alloro-navy/70">
                    {insight}
                  </p>
                </div>
                <CompetitorComparisonSortMenu
                  value={sortKey}
                  onChange={setSortKey}
                />
              </motion.div>

              <motion.div
                className="overflow-hidden rounded-[12px] border border-line-soft bg-white"
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.14, duration: 0.26, ease: "easeOut" }}
              >
                <CompetitorComparisonTable
                  rows={sortedRows}
                  sortKey={sortKey}
                  onSort={setSortKey}
                />
              </motion.div>

              {factorBreakdown && (
                <motion.div
                  className="mt-5"
                  initial={{ opacity: 0, y: 18 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2, duration: 0.26, ease: "easeOut" }}
                >
                  {factorBreakdown}
                </motion.div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
