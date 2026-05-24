import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import HighlightedText from "./HighlightedText";

export interface ProoflineModalProps {
  open: boolean;
  onClose: () => void;
  proofline: {
    title?: string;
    explanation?: string;
    trajectory?: string;
    metric_signal?: string;
    value_change?: string | number;
  } | null;
}

/**
 * ProoflineModal — extracted from the legacy DashboardOverview.tsx (lines
 * 1604-1651). Visual treatment preserved (rounded panel, blur overlay, close
 * button), upgraded to the project's framer-motion AnimatePresence + motion
 * pattern (see SessionExpiredModal.tsx for reference).
 *
 * The component is the modal only — it does NOT include the trigger button.
 * Trigger lives on the consuming component (Trajectory).
 */
export function ProoflineModal({
  open,
  onClose,
  proofline,
}: ProoflineModalProps) {
  return (
    <AnimatePresence>
      {open && proofline && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          {/* Backdrop */}
          <motion.div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* Panel */}
          <motion.div
            className="relative bg-white rounded-3xl max-w-2xl w-full max-h-[80vh] overflow-y-auto shadow-2xl"
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.2 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-8 lg:p-10 space-y-6">
              <div className="flex items-start justify-between">
                <div className="space-y-2">
                  <h3 className="text-2xl lg:text-3xl font-black font-heading text-alloro-navy tracking-tight">
                    {proofline.title || "Practice Trajectory Update"}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="p-2 hover:bg-slate-100 rounded-xl transition-colors"
                  aria-label="Close"
                >
                  <X size={24} className="text-slate-400" />
                </button>
              </div>

              {(proofline.metric_signal !== undefined ||
                proofline.value_change !== undefined) && (
                <div className="flex items-center gap-3 pt-2">
                  {proofline.metric_signal && (
                    <span className="px-3 py-1 rounded-full bg-slate-100 text-xs font-bold uppercase tracking-wider text-slate-600">
                      {proofline.metric_signal}
                    </span>
                  )}
                  {proofline.value_change !== undefined && (
                    <span className="text-sm font-mono font-semibold text-alloro-navy">
                      {proofline.value_change}
                    </span>
                  )}
                </div>
              )}

              {proofline.explanation && (
                <div className="pt-6 border-t border-slate-100">
                  <p className="text-lg text-slate-600 font-medium leading-relaxed">
                    <HighlightedText text={proofline.explanation} />
                  </p>
                </div>
              )}

              <div className="pt-4 flex justify-end">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-6 py-3 bg-alloro-navy text-white rounded-xl text-sm font-bold hover:bg-black transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default ProoflineModal;
