import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowDown,
  ArrowUp,
  DollarSign,
  RefreshCw,
  Trash2,
  User,
} from "lucide-react";

import { formatMoney } from "../pmsDataTransform";
import type { SourceRow } from "../types";
import { ALORO_ORANGE_DARK } from "../pmsLatestJobEditor.utils";
import { formatPmsSourceType, usePmsCopy } from "../pmsCopy";

interface SourceRowItemProps {
  row: SourceRow;
  confirmDeleteRowId: number | null;
  handleSourceChange: (rowId: number, value: string) => void;
  handleTypeToggle: (rowId: number) => void;
  handleReferralsChange: (rowId: number, value: string) => void;
  handleProductionChange: (rowId: number, value: string) => void;
  incrementField: (
    rowId: number,
    field: "referrals" | "production",
    delta: number,
  ) => void;
  requestDeleteRow: (id: number) => void;
  deleteRow: (id: number) => void;
  setConfirmDeleteRowId: (value: number | null) => void;
}

export const SourceRowItem: React.FC<SourceRowItemProps> = ({
  row,
  confirmDeleteRowId,
  handleSourceChange,
  handleTypeToggle,
  handleReferralsChange,
  handleProductionChange,
  incrementField,
  requestDeleteRow,
  deleteRow,
  setConfirmDeleteRowId,
}) => {
  const copy = usePmsCopy();

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.2 }}
      className="grid grid-cols-13 gap-4 mb-4 items-center px-2"
    >
      {/* Source Input */}
      <div className="col-span-3 relative">
        <User
          className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
          size={16}
        />
        <input
          value={row.source}
          onChange={(e) => handleSourceChange(row.id, e.target.value)}
          placeholder={copy.sourcePlaceholder}
          className="pl-9 w-full border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-alloro-orange/20 transition-colors"
        />
      </div>

      {/* Type Toggle */}
      <div className="col-span-2">
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={() => handleTypeToggle(row.id)}
          className="w-full border rounded-xl px-3 py-3 flex items-center justify-between capitalize text-sm font-semibold transition-colors"
          style={{
            backgroundColor: row.type === "self" ? "#C9765E11" : "#C9765E22",
          }}
        >
          <span>{formatPmsSourceType(copy, row.type)}</span>
          <RefreshCw size={14} className="text-gray-400" />
        </motion.button>
      </div>

      {/* Count (with +/- buttons) */}
      <div
        className="col-span-3 relative rounded-xl"
        style={{
          backgroundColor: row.type === "self" ? "#C9765E11" : "#C9765E22",
        }}
      >
        <User
          className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
          size={16}
        />
        <input
          type="text"
          value={row.referrals}
          onChange={(e) => handleReferralsChange(row.id, e.target.value)}
          className="pl-9 pr-12 w-full border rounded-xl px-4 py-3 text-sm bg-transparent focus:outline-none focus:ring-2 focus:ring-alloro-orange/20 transition-colors"
        />
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex flex-col">
          <button
            onClick={() => incrementField(row.id, "referrals", 1)}
            className="p-0.5 text-gray-500 hover:text-gray-700 transition-colors"
          >
            <ArrowUp size={14} />
          </button>
          <button
            onClick={() => incrementField(row.id, "referrals", -1)}
            className="p-0.5 text-gray-500 hover:text-gray-700 transition-colors"
          >
            <ArrowDown size={14} />
          </button>
        </div>
      </div>

      {/* Dollar amount (with +/- buttons) */}
      <div
        className="col-span-4 relative rounded-xl"
        style={{
          backgroundColor: row.type === "self" ? "#C9765E11" : "#C9765E22",
        }}
      >
        <DollarSign
          className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
          size={16}
        />
        <input
          type="text"
          value={formatMoney(row.production)}
          onChange={(e) => handleProductionChange(row.id, e.target.value)}
          className="pl-9 pr-12 w-full border rounded-xl px-4 py-3 text-sm bg-transparent focus:outline-none focus:ring-2 focus:ring-alloro-orange/20 transition-colors"
        />
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex flex-col">
          <button
            onClick={() => incrementField(row.id, "production", 1)}
            className="p-0.5 text-gray-500 hover:text-gray-700 transition-colors"
          >
            <ArrowUp size={14} />
          </button>
          <button
            onClick={() => incrementField(row.id, "production", -1)}
            className="p-0.5 text-gray-500 hover:text-gray-700 transition-colors"
          >
            <ArrowDown size={14} />
          </button>
        </div>
      </div>

      {/* Delete Button */}
      <div className="col-span-1 flex justify-end relative">
        <button
          onClick={() => requestDeleteRow(row.id)}
          className="p-2.5 rounded-xl transition-colors hover:brightness-110"
          style={{
            backgroundColor: ALORO_ORANGE_DARK,
            color: "white",
          }}
        >
          <Trash2 size={18} />
        </button>

        {/* Confirmation Tooltip */}
        <AnimatePresence>
          {confirmDeleteRowId === row.id && (
            <motion.div
              initial={{
                opacity: 0,
                scale: 0.95,
                y: -6,
              }}
              animate={{
                opacity: 1,
                scale: 1,
                y: 0,
              }}
              exit={{
                opacity: 0,
                scale: 0.95,
                y: -6,
              }}
              className="absolute right-10 top-1/2 -translate-y-1/2 bg-white border rounded-xl shadow-lg p-3 z-10"
            >
              <div className="text-xs mb-2">Delete source?</div>
              <div className="flex gap-2">
                <button
                  onClick={() => deleteRow(row.id)}
                  className="text-xs px-3 py-1 rounded-lg text-white"
                  style={{
                    backgroundColor: ALORO_ORANGE_DARK,
                  }}
                >
                  Delete
                </button>
                <button
                  onClick={() => setConfirmDeleteRowId(null)}
                  className="text-xs px-3 py-1 rounded-lg border border-red-200 text-red-500 hover:bg-red-50"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
};
