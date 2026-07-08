import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { AlertCircle, Inbox } from "lucide-react";
import { EmptyState } from "../../../components/ui/DesignSystem";
import { listItemVariants, staggerContainer } from "../../../lib/animations";
import type { EmailLogListItem } from "../../../api/email-logs";
import { CategoryBadge, StatusBadge } from "./badges";
import { formatDateTime, recipientLabel } from "./constants";

/**
 * Email Logs — the list table (plans/07082026-email-logs-ui-polish).
 * Staggered row entrance, skeleton loading, and design-system empty/error states.
 */

export type EmailLogsTableProps = {
  logs: EmailLogListItem[];
  isLoading: boolean;
  isError: boolean;
  onSelect: (id: string) => void;
  onReset: () => void;
};

const COLUMNS = ["Sent", "Category", "Status", "Subject", "Recipient"] as const;
const SKELETON_ROWS = 6;
const TH_CLASS =
  "px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-gray-500";

function SkeletonRows() {
  return (
    <tbody className="divide-y divide-gray-100">
      {Array.from({ length: SKELETON_ROWS }).map((_, i) => (
        <tr key={i}>
          {COLUMNS.map((col) => (
            <td key={col} className="px-4 py-3">
              <div className="h-4 w-24 animate-pulse rounded bg-gray-200" />
            </td>
          ))}
        </tr>
      ))}
    </tbody>
  );
}

function TableShell({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-black/5 bg-white shadow-premium">
      <table className="min-w-full text-sm">
        <thead className="bg-alloro-bg/60">
          <tr>
            {COLUMNS.map((col) => (
              <th key={col} className={TH_CLASS}>
                {col}
              </th>
            ))}
          </tr>
        </thead>
        {children}
      </table>
    </div>
  );
}

export default function EmailLogsTable({
  logs,
  isLoading,
  isError,
  onSelect,
  onReset,
}: EmailLogsTableProps) {
  if (isLoading) {
    return (
      <TableShell>
        <SkeletonRows />
      </TableShell>
    );
  }

  if (logs.length === 0) {
    return (
      <div className="rounded-2xl border border-black/5 bg-white shadow-premium">
        {isError ? (
          <EmptyState
            icon={<AlertCircle className="h-8 w-8" />}
            title="Couldn't load email logs"
            description="Something went wrong fetching this page. Try again in a moment."
          />
        ) : (
          <EmptyState
            icon={<Inbox className="h-8 w-8" />}
            title="No emails match these filters"
            description="Try clearing or widening your filters to see more results."
            action={{ label: "Reset filters", onClick: onReset }}
          />
        )}
      </div>
    );
  }

  return (
    <TableShell>
      <motion.tbody
        className="divide-y divide-gray-100"
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
      >
        {logs.map((row) => (
          <motion.tr
            key={row.id}
            variants={listItemVariants}
            className="cursor-pointer transition-colors hover:bg-alloro-bg/40"
            onClick={() => onSelect(row.id)}
          >
            <td className="whitespace-nowrap px-4 py-3 text-gray-600 tabular-nums">
              {formatDateTime(row.created_at)}
            </td>
            <td className="px-4 py-3">
              <CategoryBadge category={row.category} />
            </td>
            <td className="px-4 py-3">
              <StatusBadge status={row.status} />
            </td>
            <td className="max-w-md truncate px-4 py-3 text-gray-800">
              {row.subject ?? "—"}
            </td>
            <td className="whitespace-nowrap px-4 py-3 text-gray-600">
              {recipientLabel(row)}
            </td>
          </motion.tr>
        ))}
      </motion.tbody>
    </TableShell>
  );
}
