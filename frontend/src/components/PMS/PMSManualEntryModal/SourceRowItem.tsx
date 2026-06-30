import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowDown,
  ArrowUp,
  DollarSign,
  RefreshCw,
  Trash2,
  User,
} from "lucide-react";

import { formatMoney, sanitizeNumber } from "../pmsDataTransform";
import type { SourceRow } from "../types";
import { ALORO_ORANGE_DARK } from "../pmsManualEntryModal.utils";
import { formatPmsSourceType, usePmsCopy } from "../pmsCopy";

interface SourceRowItemProps {
  row: SourceRow;
  confirmDeleteRowId: number | null;
  updateRow: (id: number, field: keyof SourceRow, value: string) => void;
  handleTypeToggle: (rowId: number) => void;
  incrementField: (
    rowId: number,
    field: "referrals" | "production",
    delta: number,
  ) => void;
  requestDeleteRow: (rowId: number) => void;
  deleteRow: (rowId: number) => void;
  setConfirmDeleteRowId: (value: number | null) => void;
}

export const SourceRowItem: React.FC<SourceRowItemProps> = ({
  row,
  confirmDeleteRowId,
  updateRow,
  handleTypeToggle,
  incrementField,
  requestDeleteRow,
  deleteRow,
  setConfirmDeleteRowId,
}) => {
  const copy = usePmsCopy();

  return (
    <motion.div
      key={row.id}
      layout
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      className="grid grid-cols-13 gap-4 items-center px-2"
    >
      {/* Source */}
      <div className="col-span-3 relative">
        <User
          className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
          size={16}
        />
        <input
          value={row.source}
          onChange={(e) => updateRow(row.id, "source", e.target.value)}
          placeholder={copy.sourcePlaceholder}
          className="pl-9 w-full border rounded-xl px-4 py-3 text-sm bg-white focus:ring-2 focus:ring-orange-200 focus:border-orange-300 outline-none transition"
        />
      </div>

      {/* Type */}
      <div className="col-span-2">
        <button
          onClick={() => handleTypeToggle(row.id)}
          className="w-full border rounded-xl px-3 py-3 flex items-center justify-between capitalize text-sm font-semibold transition hover:brightness-95"
          style={{
            backgroundColor: row.type === "self" ? "#C9765E11" : "#C9765E22",
          }}
        >
          <span>{formatPmsSourceType(copy, row.type)}</span>
          <RefreshCw size={14} className="text-gray-400" />
        </button>
      </div>

      {/* Count */}
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
          onChange={(e) =>
            updateRow(row.id, "referrals", sanitizeNumber(e.target.value))
          }
          placeholder="0"
          className="pl-9 pr-12 w-full border rounded-xl px-4 py-3 text-sm bg-transparent focus:ring-2 focus:ring-orange-200 focus:border-orange-300 outline-none transition"
        />
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex flex-col">
          <button
            onClick={() => incrementField(row.id, "referrals", 1)}
            className="p-0.5 text-gray-500 hover:text-gray-700"
          >
            <ArrowUp size={14} />
          </button>
          <button
            onClick={() => incrementField(row.id, "referrals", -1)}
            className="p-0.5 text-gray-500 hover:text-gray-700"
          >
            <ArrowDown size={14} />
          </button>
        </div>
      </div>

      {/* Dollar amount */}
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
          onChange={(e) =>
            updateRow(row.id, "production", sanitizeNumber(e.target.value))
          }
          placeholder="0"
          className="pl-9 pr-12 w-full border rounded-xl px-4 py-3 text-sm bg-transparent focus:ring-2 focus:ring-orange-200 focus:border-orange-300 outline-none transition"
        />
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex flex-col">
          <button
            onClick={() => incrementField(row.id, "production", 100)}
            className="p-0.5 text-gray-500 hover:text-gray-700"
          >
            <ArrowUp size={14} />
          </button>
          <button
            onClick={() => incrementField(row.id, "production", -100)}
            className="p-0.5 text-gray-500 hover:text-gray-700"
          >
            <ArrowDown size={14} />
          </button>
        </div>
      </div>

      {/* Delete */}
      <div className="col-span-1 flex justify-end relative">
        <button
          onClick={() => requestDeleteRow(row.id)}
          className="p-2.5 rounded-xl transition hover:brightness-110"
          style={{
            backgroundColor: ALORO_ORANGE_DARK,
            color: "white",
          }}
        >
          <Trash2 size={18} />
        </button>

        <AnimatePresence>
          {confirmDeleteRowId === row.id && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: -6 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -6 }}
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
                  className="text-xs px-3 py-1 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
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
