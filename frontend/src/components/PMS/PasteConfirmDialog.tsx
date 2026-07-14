import { AnimatePresence, motion } from "framer-motion";
import { ClipboardPaste, FileText, X } from "lucide-react";

import { PasteConfirmation } from "./PasteConfirmation";
import { PasteProgress } from "./PasteProgress";
import type { PastePhase } from "./pastePipeline";
import type { PasteInfo } from "./types";

export type PasteConfirmDialogProps = {
  pasteInfo: PasteInfo | null;
  isPasting: boolean;
  phase: PastePhase;
  rowsParsed: number | null;
  requiresSanitization: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  droppedFileName?: string | null;
};

function getDialogTitle(
  phase: PastePhase,
  isPasting: boolean,
  isFile: boolean,
): string {
  if (phase === "ready") return "Data ready";
  if (isPasting) {
    return phase === "sanitizing" ? "Cleaning your data" : "Parsing your data";
  }
  return isFile ? "File detected" : "Paste detected";
}

export function PasteConfirmDialog({
  pasteInfo,
  isPasting,
  phase,
  rowsParsed,
  requiresSanitization,
  onConfirm,
  onCancel,
  droppedFileName,
}: PasteConfirmDialogProps) {
  if (!pasteInfo) return null;
  const isFile = Boolean(droppedFileName);
  const isComplete = phase === "ready";

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[110] flex items-center justify-center bg-alloro-navy/40 backdrop-blur-sm"
        onClick={isPasting ? undefined : onCancel}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          onClick={(event) => event.stopPropagation()}
          className="relative w-96 rounded-xl border border-alloro-navy/10 bg-slate-50 p-6 shadow-xl"
        >
          <button
            type="button"
            onClick={onCancel}
            disabled={isPasting && !isComplete}
            className="absolute right-3 top-3 rounded-lg p-2 text-alloro-navy/40 transition-all duration-200 hover:bg-alloro-navy/5 hover:text-alloro-navy focus-visible:ring-2 focus-visible:ring-alloro-teal/50 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>

          <div className="flex flex-col items-center">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-alloro-orange/10 text-alloro-orange">
              {isFile ? (
                <FileText className="h-6 w-6" />
              ) : (
                <ClipboardPaste className="h-6 w-6" />
              )}
            </div>

            <h3 className="mb-1 text-lg font-semibold text-alloro-navy">
              {getDialogTitle(phase, isPasting, isFile)}
            </h3>

            {!isPasting && !isComplete ? (
              <PasteConfirmation
                pasteInfo={pasteInfo}
                isFile={isFile}
                droppedFileName={droppedFileName}
                onCancel={onCancel}
                onConfirm={onConfirm}
              />
            ) : (
              phase !== "idle" && (
                <>
                  <PasteProgress
                    phase={phase}
                    rowsParsed={rowsParsed}
                    requiresSanitization={requiresSanitization}
                  />
                  {isComplete && (
                    <button
                      type="button"
                      onClick={onCancel}
                      className="mt-5 w-full rounded-lg bg-alloro-orange px-4 py-2 text-sm font-medium text-slate-50 transition-all duration-200 hover:brightness-105 focus-visible:ring-2 focus-visible:ring-alloro-teal/50"
                    >
                      Review parsed data
                    </button>
                  )}
                </>
              )
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
