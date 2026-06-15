import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Sparkles, Loader2, AlertCircle } from "lucide-react";
import type { PmsKeyDataMonth } from "../../../api/pms";
import { formatDataMonth } from "../../../utils/timeframe";
import { useGenerateComparisonInsights } from "../../../hooks/queries/usePmsComparisonInsights";
import {
  sortMonthsDesc,
  buildSourceComparison,
  parseHighlights,
} from "./compareMonths.utils";
import { CompareMetricGrid } from "./CompareMetricGrid";
import { CompareSourceList } from "./CompareSourceList";
import { MonthCalendarPicker } from "./MonthCalendarPicker";
import { PmsEyebrow } from "./primitives";

/**
 * CompareMonthsModal — Referrals Hub "Compare" modal. Picks two months from the
 * already-loaded keyData series and renders a side-by-side dashboard (metrics +
 * per-source diff) plus an on-demand Claude Haiku comparison paragraph.
 */

export type CompareMonthsModalProps = {
  isOpen: boolean;
  onClose: () => void;
  months: PmsKeyDataMonth[];
  locationId: number | null;
};

function InsightBody({
  isPending,
  error,
  insight,
  onGenerate,
}: {
  isPending: boolean;
  error: Error | null;
  insight: string | null;
  onGenerate: () => void;
}) {
  if (insight) {
    return (
      <p className="whitespace-pre-line font-display text-[15px] leading-7 text-alloro-navy">
        {parseHighlights(insight).map((segment, index) =>
          segment.highlight ? (
            <mark
              key={`h-${index}`}
              className="rounded bg-alloro-orange/20 px-1 font-semibold text-alloro-navy"
            >
              {segment.text}
            </mark>
          ) : (
            <span key={`t-${index}`}>{segment.text}</span>
          )
        )}
      </p>
    );
  }
  if (isPending) {
    return (
      <div className="flex items-center gap-2 text-sm text-ink-muted">
        <Loader2 className="h-4 w-4 animate-spin text-alloro-orange" />
        Generating…
      </div>
    );
  }
  if (error) {
    return (
      <div className="space-y-2">
        <div className="flex items-start gap-2">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
          <p className="text-sm text-red-700">{error.message}</p>
        </div>
        <button
          type="button"
          onClick={onGenerate}
          className="text-sm font-medium text-alloro-navy underline underline-offset-4 transition-colors hover:text-alloro-orange"
        >
          Try again
        </button>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <p className="text-[15px] text-alloro-navy">
        Want a plain-English read on what changed?
      </p>
      <button
        type="button"
        onClick={onGenerate}
        className="inline-flex items-center gap-2 font-display text-[15px] font-semibold text-alloro-orange transition-colors hover:text-alloro-navy"
      >
        <Sparkles className="h-4 w-4" />
        Explain this comparison
      </button>
    </div>
  );
}

function InsightPanel({
  isPending,
  error,
  insight,
  onGenerate,
}: {
  isPending: boolean;
  error: Error | null;
  insight: string | null;
  onGenerate: () => void;
}) {
  return (
    <div className="rounded-[14px] border border-line-soft bg-[var(--color-pm-bg-primary)] p-6 shadow-premium">
      {insight && <PmsEyebrow className="mb-3 block">AI comparison</PmsEyebrow>}
      <InsightBody
        isPending={isPending}
        error={error}
        insight={insight}
        onGenerate={onGenerate}
      />
    </div>
  );
}

function CompareModalHeader({ onClose }: { onClose: () => void }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-line-soft px-6 py-5">
      <div>
        <h2 className="font-display text-xl font-medium text-alloro-navy">
          Compare months
        </h2>
        <p className="mt-0.5 text-sm text-ink-muted">
          Pick two months to see what changed
        </p>
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="rounded-xl p-2 text-ink-muted transition-colors hover:bg-line-soft"
      >
        <X className="h-5 w-5" />
      </button>
    </div>
  );
}

export function CompareMonthsModal({
  isOpen,
  onClose,
  months,
  locationId,
}: CompareMonthsModalProps) {
  const sortedMonths = useMemo(() => sortMonthsDesc(months), [months]);
  const [monthAKey, setMonthAKey] = useState<string | null>(null);
  const [monthBKey, setMonthBKey] = useState<string | null>(null);
  const insights = useGenerateComparisonInsights(locationId);

  // Defaults read left-to-right in time: A = earlier month, B = most recent.
  const effA =
    monthAKey ?? sortedMonths[1]?.month ?? sortedMonths[0]?.month ?? null;
  const effB = monthBKey ?? sortedMonths[0]?.month ?? null;

  const monthA = sortedMonths.find((m) => m.month === effA) ?? null;
  const monthB = sortedMonths.find((m) => m.month === effB) ?? null;
  const canCompare = Boolean(monthA && monthB && effA !== effB);

  const sourceRows = useMemo(
    () => (canCompare ? buildSourceComparison(monthA, monthB) : []),
    [canCompare, monthA, monthB]
  );

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  const handleChangeA = (key: string) => {
    setMonthAKey(key);
    insights.reset();
  };
  const handleChangeB = (key: string) => {
    setMonthBKey(key);
    insights.reset();
  };
  const handleGenerate = () => {
    if (canCompare && effA && effB) insights.mutate({ monthA: effA, monthB: effB });
  };

  const labelA = formatDataMonth(effA);
  const labelB = formatDataMonth(effB);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-black/50 p-4 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.96, opacity: 0, y: 16 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.96, opacity: 0, y: 16 }}
            transition={{ type: "spring", damping: 26, stiffness: 300 }}
            className="pm-light relative my-auto flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <CompareModalHeader onClose={onClose} />

            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                <MonthCalendarPicker
                  id="compare-month-a"
                  label="Month A"
                  valueKey={effA}
                  months={sortedMonths}
                  onChange={handleChangeA}
                />
                <MonthCalendarPicker
                  id="compare-month-b"
                  label="Month B"
                  valueKey={effB}
                  months={sortedMonths}
                  onChange={handleChangeB}
                />
              </div>

              {monthA && monthB && effA !== effB ? (
                <>
                  <InsightPanel
                    isPending={insights.isPending}
                    error={insights.error}
                    insight={insights.data?.insight ?? null}
                    onGenerate={handleGenerate}
                  />
                  <CompareMetricGrid
                    monthA={monthA}
                    monthB={monthB}
                    labelA={labelA}
                    labelB={labelB}
                  />
                  <CompareSourceList
                    rows={sourceRows}
                    labelA={labelA}
                    labelB={labelB}
                  />
                </>
              ) : (
                <div className="rounded-[14px] border border-line-soft bg-white p-5 text-sm text-ink-muted shadow-premium">
                  Pick two different months to compare.
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
