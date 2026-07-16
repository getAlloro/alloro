import { Trash2 } from "lucide-react";
import type { SubmissionSummary } from "../../../types/leadgen";
import {
  STAGE_CLASSES,
  formatSubmissionDate,
  friendlyUserAgent,
  getAuditStatusDisplay,
  shortSessionId,
} from "./leadgenSubmissionDisplay.utils";
import { LeadgenSubmissionStageCell } from "./LeadgenSubmissionStageCell";

export type LeadgenSubmissionRowProps = {
  submission: SubmissionSummary;
  isActive: boolean;
  isSelected: boolean;
  isSelectionEnabled: boolean;
  isDeleting: boolean;
  onRowClick: (id: string) => void;
  onToggleSelect?: (id: string) => void;
  onDelete: (id: string) => Promise<void>;
};

export function LeadgenSubmissionRow({
  submission,
  isActive,
  isSelected,
  isSelectionEnabled,
  isDeleting,
  onRowClick,
  onToggleSelect,
  onDelete,
}: LeadgenSubmissionRowProps) {
  const audit = getAuditStatusDisplay(submission.audit_status);
  const rowTone = isActive
    ? "bg-alloro-orange/5 hover:bg-alloro-orange/10"
    : isSelected
      ? "bg-blue-50/60 hover:bg-blue-50"
      : "hover:bg-gray-50/80";

  const handleRowKeyDown = (
    event: React.KeyboardEvent<HTMLTableRowElement>,
  ) => {
    if (event.target === event.currentTarget && event.key === "Enter") {
      onRowClick(submission.id);
    }
  };

  return (
    <tr
      className={`cursor-pointer transition-colors ${rowTone}`}
      onClick={() => onRowClick(submission.id)}
      onKeyDown={handleRowKeyDown}
      tabIndex={0}
      aria-label={`Open session ${shortSessionId(submission.id)}`}
    >
      {isSelectionEnabled && (
        <td
          className="w-10 py-3 pl-4 pr-2"
          onClick={(event) => event.stopPropagation()}
        >
          <input
            type="checkbox"
            className="h-4 w-4 cursor-pointer rounded border-gray-300 text-alloro-orange focus:ring-alloro-orange/40"
            checked={isSelected}
            onChange={() => onToggleSelect?.(submission.id)}
            aria-label={`Select session ${shortSessionId(submission.id)}`}
          />
        </td>
      )}
      <td className="px-4 py-3">
        {submission.email ? (
          <span className="text-sm font-medium text-gray-800">
            {submission.email}
          </span>
        ) : (
          <div className="flex flex-col">
            <span className="text-xs font-medium text-gray-500">
              {friendlyUserAgent(submission.user_agent) ?? "Unknown device"}
            </span>
            <span className="font-mono text-[10px] text-gray-400">
              session {shortSessionId(submission.id)}
            </span>
          </div>
        )}
      </td>
      <td className="px-4 py-3 text-sm text-gray-600">
        {submission.domain || "—"}
      </td>
      <td className="max-w-[220px] truncate px-4 py-3 text-sm text-gray-600">
        {submission.practice_search_string || "—"}
      </td>
      <LeadgenSubmissionStageCell submission={submission} />
      <td className="px-4 py-3">
        {audit ? (
          <span
            className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${STAGE_CLASSES[audit.tone]}`}
          >
            {audit.label}
          </span>
        ) : (
          <span className="text-xs text-gray-400">—</span>
        )}
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-600">
        {formatSubmissionDate(submission.first_seen_at)}
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-600">
        {formatSubmissionDate(submission.last_seen_at)}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center justify-end">
          <button
            onClick={(event) => {
              event.stopPropagation();
              void onDelete(submission.id);
            }}
            disabled={isDeleting}
            className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600 focus:ring-2 focus:ring-alloro-orange/40 disabled:cursor-not-allowed disabled:opacity-40"
            title="Delete session"
            aria-label={`Delete session ${shortSessionId(submission.id)}`}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </td>
    </tr>
  );
}
