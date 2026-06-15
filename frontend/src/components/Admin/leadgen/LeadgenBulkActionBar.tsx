/**
 * LeadgenBulkActionBar
 *
 * Floating action bar that slides up from the bottom when one or more
 * leadgen sessions are selected in the table. Hosts the bulk-delete CTA
 * and a clear-selection button. Animated in/out via framer-motion — uses
 * AnimatePresence on the parent so entering/leaving feels snappy rather
 * than layout-thrashing.
 *
 * Owns the confirm-then-delete flow for the bulk-delete endpoint. Parent
 * is responsible for maintaining `selectedIds` state + re-fetching the
 * list once onDeleted fires.
 */

import { useState } from "react";
import { motion } from "framer-motion";
import { Trash2, X, Loader2 } from "lucide-react";
import { bulkDeleteSubmissions } from "../../../api/leadgenSubmissions";
import { useConfirm } from "../../ui/ConfirmModal";
import { logger } from "../../../lib/logger";

interface Props {
  selectedIds: Set<string>;
  onClear: () => void;
  onDeleted: (ids: string[]) => void;
}

export default function LeadgenBulkActionBar({
  selectedIds,
  onClear,
  onDeleted,
}: Props) {
  const [deleting, setDeleting] = useState(false);
  const confirm = useConfirm();
  const count = selectedIds.size;

  const handleBulkDelete = async () => {
    if (count === 0) return;
    const ok = await confirm({
      title: `Delete ${count} session${count === 1 ? "" : "s"}?`,
      message: `This cascade-deletes their events and cannot be undone.`,
      confirmLabel: `Delete ${count}`,
      variant: "danger",
    });
    if (!ok) return;

    const ids = Array.from(selectedIds);
    try {
      setDeleting(true);
      await bulkDeleteSubmissions(ids);
      onDeleted(ids);
    } catch (err) {
      logger.error("[LeadgenBulkActionBar] bulk delete failed:", err);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <motion.div
      key="bulk-bar"
      initial={{ y: 80, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 80, opacity: 0 }}
      transition={{ type: "spring", stiffness: 260, damping: 26 }}
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 w-[calc(100%-2rem)] max-w-xl"
    >
      <div className="flex items-center justify-between gap-4 rounded-2xl border border-gray-200 bg-white/95 backdrop-blur px-5 py-3 shadow-2xl">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-8 w-8 shrink-0 rounded-lg bg-alloro-orange/10 text-alloro-orange flex items-center justify-center">
            <span className="text-sm font-bold">{count}</span>
          </div>
          <div className="flex flex-col leading-tight min-w-0">
            <span className="text-sm font-semibold text-gray-900">
              {count} selected
            </span>
            <span className="text-[11px] text-gray-500">
              Bulk actions apply to the current selection
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onClear}
            disabled={deleting}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-40 transition-colors"
            title="Clear selection"
          >
            <X className="h-3.5 w-3.5" />
            Clear
          </button>
          <button
            type="button"
            onClick={handleBulkDelete}
            disabled={deleting}
            className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-2 text-xs font-semibold text-white shadow-md hover:bg-red-700 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed transition-all"
          >
            {deleting ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Deleting…
              </>
            ) : (
              <>
                <Trash2 className="h-3.5 w-3.5" />
                Delete {count}
              </>
            )}
          </button>
        </div>
      </div>
    </motion.div>
  );
}
