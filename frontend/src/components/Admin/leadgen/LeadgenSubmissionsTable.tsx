import { useState } from "react";
import { Inbox } from "lucide-react";
import { deleteSubmission } from "../../../api/leadgenSubmissions";
import { logger } from "../../../lib/logger";
import type { SubmissionSummary } from "../../../types/leadgen";
import { useConfirm } from "../../ui/ConfirmModal";
import { LeadgenSubmissionRow } from "./LeadgenSubmissionRow";

export type LeadgenSubmissionsTableProps = {
  items: SubmissionSummary[];
  loading: boolean;
  onRowClick: (id: string) => void;
  onDeleted?: (id: string) => void;
  activeId?: string | null;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
  onToggleSelectAll?: (selectAll: boolean) => void;
};

const TABLE_HEADERS = [
  "Email",
  "Domain",
  "Practice",
  "Final Stage",
  "Audit",
  "First Seen",
  "Last Seen",
  "Actions",
];

function LeadgenSubmissionsTable({
  items,
  loading,
  onRowClick,
  onDeleted,
  activeId,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
}: LeadgenSubmissionsTableProps) {
  const confirm = useConfirm();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const isSelectionEnabled = Boolean(selectedIds && onToggleSelect);
  const isAllSelected =
    isSelectionEnabled &&
    items.length > 0 &&
    items.every((item) => selectedIds?.has(item.id));
  const isSomeSelected =
    isSelectionEnabled &&
    !isAllSelected &&
    items.some((item) => selectedIds?.has(item.id));

  const handleDelete = async (id: string) => {
    const isConfirmed = await confirm({
      title: "Delete session",
      message: "Delete this session and all its events? This cannot be undone.",
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (!isConfirmed) return;

    try {
      setDeletingId(id);
      await deleteSubmission(id);
      onDeleted?.(id);
    } catch (error) {
      logger.error("Failed to delete leadgen submission:", error);
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) {
    return (
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="divide-y divide-gray-50">
          {[0, 1, 2, 3, 4].map((index) => (
            <div key={index} className="h-12 animate-pulse bg-gray-50/60" />
          ))}
        </div>
      </div>
    );
  }

  if (!items.length) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200 py-16">
        <Inbox className="h-10 w-10 text-gray-300" />
        <p className="mt-3 text-sm font-medium text-gray-500">
          No submissions yet.
        </p>
        <p className="mt-1 text-xs text-gray-400">
          Leadgen tool sessions will appear here once events start flowing.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      <table className="w-full">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50/50">
            {isSelectionEnabled && (
              <th className="w-10 py-3 pl-4 pr-2">
                <input
                  type="checkbox"
                  className="h-4 w-4 cursor-pointer rounded border-gray-300 text-alloro-orange focus:ring-alloro-orange/40"
                  checked={isAllSelected}
                  ref={(element) => {
                    if (element) element.indeterminate = isSomeSelected;
                  }}
                  onChange={(event) =>
                    onToggleSelectAll?.(event.target.checked)
                  }
                  aria-label="Select all on this page"
                />
              </th>
            )}
            {TABLE_HEADERS.map((header) => (
              <th
                key={header}
                className={`px-4 py-3 text-xs font-medium uppercase tracking-wider text-gray-500 ${header === "Actions" ? "text-right" : "text-left"}`}
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {items.map((submission) => (
            <LeadgenSubmissionRow
              key={submission.id}
              submission={submission}
              isActive={activeId === submission.id}
              isSelected={Boolean(selectedIds?.has(submission.id))}
              isSelectionEnabled={isSelectionEnabled}
              isDeleting={deletingId === submission.id}
              onRowClick={onRowClick}
              onToggleSelect={onToggleSelect}
              onDelete={handleDelete}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default LeadgenSubmissionsTable;

// Backward-compatible exports for the detail and funnel components.
/* eslint-disable react-refresh/only-export-components */
export {
  STAGE_CLASSES,
  STAGE_LABEL,
  STAGE_TONE,
} from "./leadgenSubmissionDisplay.utils";
/* eslint-enable react-refresh/only-export-components */
