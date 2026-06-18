import { AnimatePresence, motion } from "framer-motion";

import type { MonthBucket } from "../types";

interface MonthConflictDialogProps {
  monthConflicts: Array<{
    month: string;
    status: "new" | "conflict";
    existingRowCount: number;
  }> | null;
  pendingMonths: MonthBucket[] | null;
  cancelMerge: () => void;
  confirmMerge: () => void;
}

export const MonthConflictDialog: React.FC<MonthConflictDialogProps> = ({
  monthConflicts,
  pendingMonths,
  cancelMerge,
  confirmMerge,
}) => {
  return (
    <AnimatePresence>
      {monthConflicts && pendingMonths && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/30 flex items-center justify-center z-[110]"
          onClick={cancelMerge}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl p-6 w-96 shadow-xl"
          >
            <h3 className="text-lg font-semibold text-gray-900 mb-1">
              Data already exists
            </h3>
            <p className="text-sm text-gray-500 mb-4">
              Some months in this data already have entries. Confirm which
              to replace.
            </p>
            <div className="space-y-2 mb-5">
              {monthConflicts.map((c) => {
                const label = new Date(c.month + "-01").toLocaleDateString(
                  "en-US",
                  { month: "long", year: "numeric" }
                );
                return (
                  <div
                    key={c.month}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${
                      c.status === "conflict"
                        ? "bg-amber-50 border border-amber-200"
                        : "bg-green-50 border border-green-200"
                    }`}
                  >
                    <span className="text-xs font-medium">
                      {c.status === "conflict" ? "⚠️" : "✅"}
                    </span>
                    <span className="flex-1 font-medium text-gray-900">
                      {label}
                    </span>
                    <span className="text-xs text-gray-500">
                      {c.status === "conflict"
                        ? `Replaces ${c.existingRowCount} existing rows`
                        : "New month"}
                    </span>
                  </div>
                );
              })}
            </div>
            <p className="text-xs text-gray-400 mb-4">
              Existing months not listed above will be kept as-is.
            </p>
            <div className="flex gap-3">
              <button
                onClick={cancelMerge}
                className="flex-1 rounded-full border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition"
              >
                Cancel
              </button>
              <button
                onClick={confirmMerge}
                className="flex-1 rounded-full px-4 py-2 text-sm font-medium text-white transition hover:brightness-110"
                style={{ backgroundColor: "#C9765E" }}
              >
                Confirm & Merge
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
