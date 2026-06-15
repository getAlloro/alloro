import { motion } from "framer-motion";
import {
  Loader2,
  Eye,
  Archive,
  ArchiveRestore,
  Calendar,
  Building2,
  CheckCircle,
  Circle,
} from "lucide-react";
import type { ActionItem } from "../../../../types/tasks";
import { AgentTypePill } from "../../../tasks/AgentTypePill";
import { parseHighlightTags } from "../../../../utils/textFormatting";
import { ApprovalSwitch } from "./ApprovalSwitch";
import { AnimatedDropdown } from "./AnimatedDropdown";
import { CATEGORY_OPTIONS, STATUS_OPTIONS, formatDate } from "../actionItemsHub.utils";

interface TaskCardProps {
  task: ActionItem;
  index: number;
  selectedTaskIds: Set<number>;
  updatingApprovalId: number | null;
  updatingCategoryId: number | null;
  updatingStatusId: number | null;
  deletingId: number | null;
  organizations: { id: number; name: string }[];
  toggleSelectTask: (taskId: number) => void;
  handleApprove: (taskId: number, currentApproval: boolean) => void;
  handleCategoryChange: (taskId: number, newCategory: string) => void;
  handleStatusChange: (taskId: number, newStatus: string) => void;
  handleViewDetails: (task: ActionItem) => void;
  handleUnarchive: (taskId: number) => void;
  handleArchive: (taskId: number) => void;
}

export function TaskCard({
  task,
  index,
  selectedTaskIds,
  updatingApprovalId,
  updatingCategoryId,
  updatingStatusId,
  deletingId,
  organizations,
  toggleSelectTask,
  handleApprove,
  handleCategoryChange,
  handleStatusChange,
  handleViewDetails,
  handleUnarchive,
  handleArchive,
}: TaskCardProps) {
  return (
    <motion.div
      key={task.id}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.3 }}
      onClick={() => toggleSelectTask(task.id)}
      className={`rounded-xl border bg-white shadow-sm transition-all hover:shadow-md cursor-pointer ${
        selectedTaskIds.has(task.id)
          ? "border-blue-300 ring-2 ring-blue-100"
          : "border-gray-200"
      } ${task.status === "archived" ? "opacity-60" : ""}`}
    >
      <div className="p-4">
        <div className="flex items-start gap-4">
          {/* Selection checkbox */}
          <motion.div
            className="mt-1 flex-shrink-0"
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
          >
            {selectedTaskIds.has(task.id) ? (
              <CheckCircle className="h-5 w-5 text-blue-600" />
            ) : (
              <Circle className="h-5 w-5 text-gray-300" />
            )}
          </motion.div>

          {/* Main content */}
          <div className="flex-1 min-w-0">
            {/* Top row: Title and badges */}
            <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
              <div className="flex-1 min-w-0">
                <h3 className="text-base font-semibold text-gray-900 line-clamp-1">
                  {parseHighlightTags(task.title, "underline")}
                </h3>
                {task.description && (
                  <p className="text-sm text-gray-500 line-clamp-2 mt-1">
                    {parseHighlightTags(task.description, "underline")}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {/* Approval Switch */}
                <ApprovalSwitch
                  isApproved={task.is_approved}
                  isLoading={updatingApprovalId === task.id}
                  disabled={updatingApprovalId !== null}
                  onToggle={() => handleApprove(task.id, task.is_approved)}
                />
              </div>
            </div>

            {/* Metadata row */}
            <div className="flex flex-wrap items-center gap-3 text-sm">
              {/* Organization + Location */}
              <div className="flex items-center gap-1.5 text-gray-600">
                <Building2 className="h-3.5 w-3.5 text-gray-400" />
                <span className="font-medium">
                  {task.organization_id
                    ? organizations.find((o) => o.id === task.organization_id)?.name || `Org #${task.organization_id}`
                    : "Unassigned"}
                  {task.location_name ? ` · ${task.location_name}` : ""}
                </span>
              </div>

              {/* Date */}
              <div className="flex items-center gap-1.5 text-gray-500">
                <Calendar className="h-3.5 w-3.5 text-gray-400" />
                <span>{formatDate(task.created_at)}</span>
              </div>

              {/* Agent Type */}
              <AgentTypePill agentType={task.agent_type ?? null} />

              {/* Category */}
              <AnimatedDropdown
                value={task.category}
                options={CATEGORY_OPTIONS}
                onChange={(value) =>
                  handleCategoryChange(task.id, value)
                }
                disabled={updatingCategoryId !== null}
                isLoading={updatingCategoryId === task.id}
                variant="category"
              />

              {/* Status */}
              <AnimatedDropdown
                value={task.status}
                options={STATUS_OPTIONS}
                onChange={(value) =>
                  handleStatusChange(task.id, value)
                }
                disabled={updatingStatusId !== null}
                isLoading={updatingStatusId === task.id}
                variant="status"
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
            <motion.button
              onClick={() => handleViewDetails(task)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 transition hover:border-gray-300 hover:bg-gray-50"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <Eye className="h-3.5 w-3.5" />
              View
            </motion.button>
            {task.status === "archived" ? (
              deletingId === task.id ? (
                <span className="inline-flex items-center gap-1.5 rounded-lg border border-green-200 bg-green-50 px-3 py-1.5 text-xs font-semibold text-green-700">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Restoring...
                </span>
              ) : (
                <motion.button
                  onClick={() => handleUnarchive(task.id)}
                  disabled={deletingId !== null}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-green-200 bg-white px-3 py-1.5 text-xs font-semibold text-green-600 transition hover:border-green-300 hover:bg-green-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <ArchiveRestore className="h-3.5 w-3.5" />
                  Restore
                </motion.button>
              )
            ) : deletingId === task.id ? (
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-orange-200 bg-orange-50 px-3 py-1.5 text-xs font-semibold text-orange-700">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Archiving...
              </span>
            ) : (
              <motion.button
                onClick={() => handleArchive(task.id)}
                disabled={deletingId !== null}
                className="inline-flex items-center gap-1.5 rounded-lg border border-orange-200 bg-white px-3 py-1.5 text-xs font-semibold text-orange-600 transition hover:border-orange-300 hover:bg-orange-50 disabled:opacity-50 disabled:cursor-not-allowed"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <Archive className="h-3.5 w-3.5" />
                Archive
              </motion.button>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
