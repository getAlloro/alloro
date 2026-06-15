import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, RefreshCw, Edit3 } from "lucide-react";

interface RerunWarmupDialogProps {
  open: boolean;
  /** True when rehydration source data (locations, URLs, texts) is present. */
  canKeepSources: boolean;
  onKeepSources: () => void;
  onEditSources: () => void;
  onCancel: () => void;
}

/**
 * Three-button confirm dialog specific to re-running the identity warmup.
 * `useConfirm` from `ui/ConfirmModal.tsx` only supports a 2-button yes/no
 * shape, so this is a dedicated component matching the confirm modal's
 * visual language (dark glass panel, framer-motion spring).
 */
export default function RerunWarmupDialog({
  open,
  canKeepSources,
  onKeepSources,
  onEditSources,
  onCancel,
}: RerunWarmupDialogProps) {
  const keepRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    // Prefer focusing the primary action when enabled; fall back to Edit.
    const t = setTimeout(() => keepRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onCancel]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[110] flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          {/* Backdrop */}
          <motion.div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={onCancel}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />

          {/* Panel */}
          <motion.div
            className="relative w-full max-w-lg rounded-2xl border border-white/10 bg-[#1a1a24]/80 p-6 shadow-[0_25px_60px_-12px_rgba(0,0,0,0.5)] backdrop-blur-2xl backdrop-saturate-[180%]"
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
          >
            <div className="flex items-start gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/15">
                <AlertTriangle className="h-5 w-5 text-amber-400" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-base font-semibold text-[#eaeaea] leading-snug">
                  Re-run warmup?
                </h3>
                <p className="mt-2 text-sm text-[#9a9aa4] leading-relaxed">
                  This rebuilds the entire project identity. Existing manual
                  edits will be lost.
                </p>
                {!canKeepSources && (
                  <p className="mt-2 text-xs text-[#6a6a75] leading-relaxed italic">
                    No prior sources detected — you'll need to re-enter URLs
                    and text inputs.
                  </p>
                )}
              </div>
            </div>

            <div className="mt-6 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2">
              <motion.button
                onClick={onCancel}
                className="rounded-xl border border-white/10 bg-white/[0.06] px-4 py-2.5 text-sm font-semibold text-[#a0a0a8] transition-colors hover:bg-white/[0.1] hover:text-[#eaeaea]"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                Cancel
              </motion.button>
              <motion.button
                onClick={onEditSources}
                className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border border-white/10 bg-white/[0.08] px-4 py-2.5 text-sm font-semibold text-[#d0d0d8] transition-colors hover:bg-white/[0.12] hover:text-[#eaeaea]"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <Edit3 className="h-3.5 w-3.5" />
                Edit sources
              </motion.button>
              <motion.button
                ref={keepRef}
                onClick={onKeepSources}
                disabled={!canKeepSources}
                title={
                  canKeepSources
                    ? "Replay warmup with the current URLs, texts, and locations"
                    : "No prior sources to reuse"
                }
                className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border border-transparent bg-alloro-orange px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-alloro-orange/25 transition-colors hover:bg-alloro-orange/90 focus:outline-none focus:ring-2 focus:ring-alloro-orange focus:ring-offset-2 focus:ring-offset-[#1a1a24] disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
                whileHover={canKeepSources ? { scale: 1.02 } : {}}
                whileTap={canKeepSources ? { scale: 0.98 } : {}}
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Keep current sources
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
