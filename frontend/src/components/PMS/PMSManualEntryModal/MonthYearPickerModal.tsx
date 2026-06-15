import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";

import type { MonthBucket } from "../types";
import { ALORO_ORANGE } from "../pmsManualEntryModal.utils";

interface MonthYearPickerModalProps {
  showMonthPicker: boolean;
  activeMonth: MonthBucket | undefined;
  setShowMonthPicker: (value: boolean) => void;
  pickerStep: "month" | "year";
  setPickerStep: (value: "month" | "year") => void;
  tempMonth: string | null;
  setTempMonth: (value: string | null) => void;
  commitMonthChange: (ym: string) => void;
}

export const MonthYearPickerModal: React.FC<MonthYearPickerModalProps> = ({
  showMonthPicker,
  activeMonth,
  setShowMonthPicker,
  pickerStep,
  setPickerStep,
  tempMonth,
  setTempMonth,
  commitMonthChange,
}) => {
  return (
    <AnimatePresence>
      {showMonthPicker && activeMonth && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/30 flex items-center justify-center z-[110]"
          onClick={() => setShowMonthPicker(false)}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl p-6 w-96 shadow-xl relative"
          >
            <button
              onClick={() => setShowMonthPicker(false)}
              className="absolute right-3 top-3 p-1 rounded-lg hover:bg-gray-50"
              aria-label="Close"
            >
              <X size={16} className="text-gray-400" />
            </button>

            {pickerStep === "month" && (
              <>
                <div className="text-sm font-semibold text-gray-500 mb-4 text-center">
                  Select Month
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {Array.from({ length: 12 }).map((_, i) => {
                    const m = String(i + 1).padStart(2, "0");
                    const label = new Date(`2024-${m}-01`).toLocaleString(
                      undefined,
                      { month: "short" }
                    );
                    const isSelected = m === tempMonth;
                    return (
                      <motion.button
                        key={m}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => {
                          setTempMonth(m);
                          setPickerStep("year");
                        }}
                        className="rounded-xl py-2 text-sm border transition hover:bg-gray-50"
                        style={{
                          backgroundColor: isSelected
                            ? "rgba(201,118,94,0.12)"
                            : undefined,
                        }}
                      >
                        {label}
                      </motion.button>
                    );
                  })}
                </div>
              </>
            )}

            {pickerStep === "year" && (
              <>
                <div className="text-sm font-semibold text-gray-500 mb-2 text-center">
                  Select Year
                </div>
                <div className="text-xs text-gray-400 text-center mb-4">
                  for{" "}
                  {new Date(`2024-${tempMonth}-01`).toLocaleString(
                    undefined,
                    {
                      month: "long",
                    }
                  )}
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {Array.from({ length: 5 }).map((_, i) => {
                    const y = new Date().getFullYear() - i;
                    const candidate = `${y}-${tempMonth}`;
                    const isActive = candidate === activeMonth.month;
                    return (
                      <motion.button
                        key={y}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => commitMonthChange(candidate)}
                        className="rounded-xl py-2 text-sm border transition"
                        style={{
                          backgroundColor: isActive
                            ? ALORO_ORANGE
                            : undefined,
                          color: isActive ? "white" : undefined,
                        }}
                      >
                        {y}
                      </motion.button>
                    );
                  })}
                </div>

                <div className="flex justify-center mt-5">
                  <button
                    onClick={() => setPickerStep("month")}
                    className="text-xs text-gray-500 hover:text-gray-700"
                  >
                    Back to months
                  </button>
                </div>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
