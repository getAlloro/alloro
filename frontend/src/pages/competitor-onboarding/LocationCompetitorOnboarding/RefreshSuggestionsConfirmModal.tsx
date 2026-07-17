import { motion, AnimatePresence } from "framer-motion";
import { Loader2, Info } from "lucide-react";

export function RefreshSuggestionsConfirmModal({
  open,
  onCancel,
  onConfirm,
  loading,
}: {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  loading: boolean;
}) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[1200] flex items-center justify-center bg-alloro-navy/55 px-4 backdrop-blur-sm sm:px-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="refresh-suggestions-title"
            className="w-full max-w-md rounded-[14px] border border-white/10 bg-alloro-bg p-6 shadow-premium"
            initial={{ opacity: 0, y: 18, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
          >
            <div className="mb-5 flex items-start gap-3">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-alloro-orange/10 text-alloro-orange">
                <Info size={18} />
              </div>
              <div>
                <h2
                  id="refresh-suggestions-title"
                  className="font-display text-xl font-medium tracking-tight text-alloro-navy"
                >
                  refreshing suggestions will clear the current list, proceed?
                </h2>
                <p className="mt-2 text-sm font-medium leading-relaxed text-slate-500">
                  Your saved comparison set will not change until you save and
                  rerun ranking.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={onCancel}
                disabled={loading}
                className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-black text-alloro-navy transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onConfirm}
                disabled={loading}
                className="inline-flex items-center gap-2 rounded-xl bg-alloro-orange px-4 py-2 text-sm font-black text-white shadow-md transition hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading && <Loader2 size={15} className="animate-spin" />}
                Proceed
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
