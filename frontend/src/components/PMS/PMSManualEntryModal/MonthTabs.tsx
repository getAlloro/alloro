import { AnimatePresence, motion } from "framer-motion";
import { Plus, Trash2 } from "lucide-react";

import type { MonthBucket } from "../types";
import { ALORO_ORANGE, ALORO_ORANGE_DARK } from "../pmsManualEntryModal.utils";

interface MonthTabsProps {
  sortedMonths: MonthBucket[];
  months: MonthBucket[];
  activeMonthId: number | null;
  targetMonth?: string | null;
  confirmDeleteMonthId: number | null;
  setActiveMonthId: (id: number) => void;
  requestDeleteMonth: (id: number) => void;
  deleteMonth: (id: number) => void;
  setConfirmDeleteMonthId: (value: number | null) => void;
  addMonthBucket: () => void;
}

export const MonthTabs: React.FC<MonthTabsProps> = ({
  sortedMonths,
  months,
  activeMonthId,
  targetMonth,
  confirmDeleteMonthId,
  setActiveMonthId,
  requestDeleteMonth,
  deleteMonth,
  setConfirmDeleteMonthId,
  addMonthBucket,
}) => {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {sortedMonths.map((m) => {
        const isActive = m.id === activeMonthId;
        return (
          <div key={m.id} className="relative">
            <motion.button
              onClick={() => setActiveMonthId(m.id)}
              className="px-4 py-2 rounded-full text-xs border pr-9 font-medium"
              style={{
                backgroundColor: isActive ? ALORO_ORANGE : "white",
                color: isActive ? "white" : "#374151",
                borderColor: isActive ? ALORO_ORANGE : "#e5e7eb",
              }}
            >
              {new Date(m.month + "-01").toLocaleDateString(
                undefined,
                {
                  month: "short",
                  year: "numeric",
                }
              )}
            </motion.button>

            {/* Delete icon per tab */}
            {months.length > 1 && !targetMonth && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  requestDeleteMonth(m.id);
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-full"
                style={{
                  backgroundColor: isActive
                    ? "rgba(255,255,255,0.22)"
                    : "rgba(0,0,0,0.04)",
                  color: isActive ? "white" : "#ef4444",
                }}
                title="Delete month"
              >
                <Trash2 size={12} />
              </button>
            )}

            {/* Confirm delete month tooltip */}
            <AnimatePresence>
              {confirmDeleteMonthId === m.id && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: -6 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: -6 }}
                  className="absolute left-1/2 -translate-x-1/2 top-12 bg-white border rounded-xl shadow-lg p-3 z-20 w-56"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="text-xs mb-2 text-gray-700">
                    Delete this month?
                  </div>
                  <div className="flex gap-2 justify-end">
                    <button
                      onClick={() => deleteMonth(m.id)}
                      className="text-xs px-3 py-1 rounded-lg text-white"
                      style={{ backgroundColor: ALORO_ORANGE_DARK }}
                    >
                      Delete
                    </button>
                    <button
                      onClick={() => setConfirmDeleteMonthId(null)}
                      className="text-xs px-3 py-1 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}

      <button
        onClick={addMonthBucket}
        className="p-2 rounded-full border border-gray-200 text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition"
        title="Add month"
      >
        <Plus size={14} />
      </button>
    </div>
  );
};
