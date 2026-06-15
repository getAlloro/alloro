import { useState } from "react";
import { motion } from "framer-motion";
import {
  RefreshCw,
  CheckSquare,
  Archive,
  ArchiveRestore,
  Loader2,
  Eye,
  Calendar,
  Clock,
  CheckCircle,
  Circle,
  ShieldCheck,
  ShieldX,
} from "lucide-react";
import { toast } from "react-hot-toast";
import {
  archiveTask,
  unarchiveTask,
  bulkArchiveTasks,
  bulkUnarchiveTasks,
  bulkApproveTasks,
} from "../../api/tasks";
import type { ActionItem } from "../../types/tasks";
import { TaskDetailsModal } from "../tasks/TaskDetailsModal";
import { AgentTypePill } from "../tasks/AgentTypePill";
import { BulkActionBar, ActionButton } from "../ui/DesignSystem";
import { useConfirm } from "../ui/ConfirmModal";
import {
  useAdminOrgTasks,
  useInvalidateAdminOrgTasks,
} from "../../hooks/queries/useAdminOrgTabQueries";

interface OrgTasksTabProps {
  organizationId: number;
  locationId: number | null;
}

export function OrgTasksTab({ organizationId, locationId }: OrgTasksTabProps) {
  const [statusFilter, setStatusFilter] = useState<
    "all" | "complete" | "pending" | "in_progress" | "archived"
  >("all");
  const [categoryFilter, setCategoryFilter] = useState<
    "all" | "ALLORO" | "USER"
  >("all");
  const [page, setPage] = useState(1);

  // Detail modal
  const [selectedTask, setSelectedTask] = useState<ActionItem | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);

  // Multi-select
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);

  // Individual action loading
  const [archivingId, setArchivingId] = useState<number | null>(null);
  const [approvingId, setApprovingId] = useState<number | null>(null);

  const confirm = useConfirm();

  const pageSize = 50;

  // TanStack Query — replaces useEffect + useState for data fetching
  const { data, isLoading: loading } = useAdminOrgTasks({
    organizationId,
    locationId,
    statusFilter,
    categoryFilter,
    page,
    pageSize,
  });
  const { invalidateForOrg } = useInvalidateAdminOrgTasks();

  const tasks = data?.tasks ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / pageSize);

  const loadTasks = () => invalidateForOrg(organizationId);

  const getStatusColor = (status: string) => {
    switch (status) {
      case "pending":
        return "border-yellow-200 bg-yellow-100 text-yellow-700";
      case "in_progress":
        return "border-blue-200 bg-blue-100 text-blue-700";
      case "complete":
        return "border-green-200 bg-green-100 text-green-700";
      case "archived":
        return "border-gray-200 bg-gray-100 text-gray-500";
      default:
        return "border-gray-200 bg-gray-100 text-gray-700";
    }
  };

  const getCategoryColor = (category: string) => {
    return category === "ALLORO"
      ? "bg-alloro-orange/10 text-alloro-orange border-alloro-orange/20"
      : "bg-purple-50 text-purple-700 border-purple-200";
  };

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString();
    } catch {
      return dateStr;
    }
  };

  const formatRelativeTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMinutes = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMinutes < 1) return "just now";
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return formatDate(dateStr);
  };

  // --- Actions ---

  const toggleSelect = (id: number) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const handleViewDetails = (task: ActionItem) => {
    setSelectedTask(task);
    setShowDetailsModal(true);
  };

  const handleArchive = async (id: number) => {
    if (archivingId) return;
    const ok = await confirm({ title: "Archive this task?", confirmLabel: "Archive", variant: "danger" });
    if (!ok) return;
    try {
      setArchivingId(id);
      await archiveTask(id);
      await loadTasks();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to archive");
    } finally {
      setArchivingId(null);
    }
  };

  const handleUnarchive = async (id: number) => {
    if (archivingId) return;
    const ok = await confirm({ title: "Restore this task?", confirmLabel: "Restore", variant: "danger" });
    if (!ok) return;
    try {
      setArchivingId(id);
      await unarchiveTask(id);
      await loadTasks();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to restore");
    } finally {
      setArchivingId(null);
    }
  };

  const handleBulkArchive = async () => {
    if (selectedIds.size === 0) return;
    const ok = await confirm({ title: `Archive ${selectedIds.size} task(s)?`, confirmLabel: "Archive", variant: "danger" });
    if (!ok) return;
    try {
      setBulkLoading(true);
      await bulkArchiveTasks(Array.from(selectedIds));
      setSelectedIds(new Set());
      await loadTasks();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to archive");
    } finally {
      setBulkLoading(false);
    }
  };

  const handleBulkUnarchive = async () => {
    if (selectedIds.size === 0) return;
    const ok = await confirm({ title: `Restore ${selectedIds.size} task(s)?`, confirmLabel: "Restore", variant: "danger" });
    if (!ok) return;
    try {
      setBulkLoading(true);
      await bulkUnarchiveTasks(Array.from(selectedIds));
      setSelectedIds(new Set());
      await loadTasks();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to restore");
    } finally {
      setBulkLoading(false);
    }
  };

  const handleApprove = async (id: number) => {
    if (approvingId) return;
    try {
      setApprovingId(id);
      await bulkApproveTasks([id], true);
      toast.success("Task approved");
      await loadTasks();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to approve");
    } finally {
      setApprovingId(null);
    }
  };

  const handleUnapprove = async (id: number) => {
    if (approvingId) return;
    try {
      setApprovingId(id);
      await bulkApproveTasks([id], false);
      toast.success("Task unapproved");
      await loadTasks();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to unapprove");
    } finally {
      setApprovingId(null);
    }
  };

  const handleBulkApprove = async () => {
    if (selectedIds.size === 0) return;
    try {
      setBulkLoading(true);
      await bulkApproveTasks(Array.from(selectedIds), true);
      toast.success(`${selectedIds.size} task(s) approved`);
      setSelectedIds(new Set());
      await loadTasks();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to approve");
    } finally {
      setBulkLoading(false);
    }
  };

  const handleBulkUnapprove = async () => {
    if (selectedIds.size === 0) return;
    try {
      setBulkLoading(true);
      await bulkApproveTasks(Array.from(selectedIds), false);
      toast.success(`${selectedIds.size} task(s) unapproved`);
      setSelectedIds(new Set());
      await loadTasks();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to unapprove");
    } finally {
      setBulkLoading(false);
    }
  };

  const allSelectedArchived =
    selectedIds.size > 0 &&
    Array.from(selectedIds).every(
      (id) => tasks.find((t) => t.id === id)?.status === "archived"
    );

  const anySelectedNotArchived =
    selectedIds.size > 0 &&
    Array.from(selectedIds).some(
      (id) => tasks.find((t) => t.id === id)?.status !== "archived"
    );

  const anySelectedNotApproved =
    selectedIds.size > 0 &&
    Array.from(selectedIds).some(
      (id) => !tasks.find((t) => t.id === id)?.is_approved
    );

  const anySelectedApproved =
    selectedIds.size > 0 &&
    Array.from(selectedIds).some(
      (id) => tasks.find((t) => t.id === id)?.is_approved
    );

  return (
    <div className="space-y-4">
      {/* Filters + Select All */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-wrap gap-3">
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(
                e.target.value as
                  | "all"
                  | "complete"
                  | "pending"
                  | "in_progress"
                  | "archived"
              );
              setPage(1);
              setSelectedIds(new Set());
            }}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-alloro-orange/50"
          >
            <option value="all">All Status</option>
            <option value="pending">Pending</option>
            <option value="in_progress">In Progress</option>
            <option value="complete">Complete</option>
            <option value="archived">Archived</option>
          </select>

          <select
            value={categoryFilter}
            onChange={(e) => {
              setCategoryFilter(e.target.value as "all" | "ALLORO" | "USER");
              setPage(1);
              setSelectedIds(new Set());
            }}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-alloro-orange/50"
          >
            <option value="all">All Categories</option>
            <option value="ALLORO">ALLORO</option>
            <option value="USER">USER</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">{total} total</span>
          <button
            onClick={() => {
              if (selectedIds.size === tasks.length && tasks.length > 0) {
                setSelectedIds(new Set());
              } else {
                setSelectedIds(new Set(tasks.map((t) => t.id)));
              }
            }}
            disabled={tasks.length === 0}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-600 transition hover:border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {selectedIds.size === tasks.length && tasks.length > 0 ? (
              <CheckCircle className="h-4 w-4 text-blue-600" />
            ) : (
              <Circle className="h-4 w-4 text-gray-400" />
            )}
            {selectedIds.size === tasks.length && tasks.length > 0
              ? "Deselect All"
              : "Select All"}
          </button>
        </div>
      </div>

      {/* Bulk Actions */}
      <BulkActionBar
        selectedCount={selectedIds.size}
        totalCount={tasks.length}
        onSelectAll={() => setSelectedIds(new Set(tasks.map((t) => t.id)))}
        onDeselectAll={() => setSelectedIds(new Set())}
        isAllSelected={
          selectedIds.size === tasks.length && tasks.length > 0
        }
        actions={
          <>
            {anySelectedNotApproved && (
              <ActionButton
                label="Approve"
                icon={<ShieldCheck className="w-4 h-4" />}
                onClick={handleBulkApprove}
                variant="primary"
                size="sm"
                disabled={bulkLoading}
                loading={bulkLoading}
              />
            )}
            {anySelectedApproved && (
              <ActionButton
                label="Unapprove"
                icon={<ShieldX className="w-4 h-4" />}
                onClick={handleBulkUnapprove}
                variant="secondary"
                size="sm"
                disabled={bulkLoading}
                loading={bulkLoading}
              />
            )}
            {anySelectedNotArchived && (
              <ActionButton
                label="Archive"
                icon={<Archive className="w-4 h-4" />}
                onClick={handleBulkArchive}
                variant="secondary"
                size="sm"
                disabled={bulkLoading}
                loading={bulkLoading}
              />
            )}
            {allSelectedArchived && (
              <ActionButton
                label="Restore"
                icon={<ArchiveRestore className="w-4 h-4" />}
                onClick={handleBulkUnarchive}
                variant="secondary"
                size="sm"
                disabled={bulkLoading}
                loading={bulkLoading}
              />
            )}
          </>
        }
      />

      {/* Task List */}
      {loading ? (
        <div className="flex items-center justify-center py-12 text-gray-500">
          <RefreshCw className="h-5 w-5 animate-spin mr-2" />
          Loading tasks...
        </div>
      ) : tasks.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <CheckSquare className="h-8 w-8 mx-auto mb-2 text-gray-300" />
          <p>No tasks found</p>
        </div>
      ) : (
        <div className="space-y-3">
          {tasks.map((task, index) => (
            <motion.div
              key={task.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.03, duration: 0.2 }}
              onClick={() => toggleSelect(task.id)}
              className={`rounded-xl border bg-white shadow-sm transition-all hover:shadow-md cursor-pointer ${
                selectedIds.has(task.id)
                  ? "border-blue-300 ring-2 ring-blue-100"
                  : "border-gray-200"
              } ${task.status === "archived" ? "opacity-60" : ""}`}
            >
              <div className="p-4">
                <div className="flex items-start gap-3">
                  {/* Checkbox */}
                  <div className="mt-0.5 flex-shrink-0">
                    {selectedIds.has(task.id) ? (
                      <CheckCircle className="h-5 w-5 text-blue-600" />
                    ) : (
                      <Circle className="h-5 w-5 text-gray-300" />
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    {/* Title row */}
                    <div className="flex flex-wrap items-start justify-between gap-2 mb-1">
                      <h4 className="text-base font-semibold text-gray-900 line-clamp-1 flex-1 min-w-0">
                        {task.title}
                      </h4>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold ${getStatusColor(task.status)}`}
                        >
                          {task.status === "complete" && (
                            <CheckCircle className="h-3 w-3" />
                          )}
                          {task.status === "pending" && (
                            <Clock className="h-3 w-3" />
                          )}
                          {task.status}
                        </span>
                        <span
                          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${getCategoryColor(task.category)}`}
                        >
                          {task.category}
                        </span>
                      </div>
                    </div>

                    {/* Description */}
                    {task.description && (
                      <p className="text-sm text-gray-500 line-clamp-2 mb-2">
                        {task.description}
                      </p>
                    )}

                    {/* Metadata row */}
                    <div className="flex flex-wrap items-center gap-3 text-sm">
                      {task.location_name && (
                        <span className="text-gray-600 font-medium">
                          {task.location_name}
                        </span>
                      )}
                      <div className="flex items-center gap-1.5 text-gray-500">
                        <Calendar className="h-3.5 w-3.5 text-gray-400" />
                        <span>{formatRelativeTime(task.created_at)}</span>
                      </div>
                      <AgentTypePill agentType={task.agent_type ?? null} />
                      {task.is_approved && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">
                          <CheckCircle className="h-3 w-3" />
                          Approved
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div
                    className="flex items-center gap-2 flex-shrink-0"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <motion.button
                      onClick={() => handleViewDetails(task)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 transition hover:border-gray-300 hover:bg-gray-50"
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      <Eye className="h-3.5 w-3.5" />
                      View
                    </motion.button>
                    {approvingId === task.id ? (
                      <span className="inline-flex items-center gap-1.5 rounded-lg border border-green-200 bg-green-50 px-3 py-1.5 text-xs font-semibold text-green-700">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      </span>
                    ) : task.is_approved ? (
                      <motion.button
                        onClick={() => handleUnapprove(task.id)}
                        disabled={approvingId !== null}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-white px-3 py-1.5 text-xs font-semibold text-amber-600 transition hover:border-amber-300 hover:bg-amber-50 disabled:opacity-50 disabled:cursor-not-allowed"
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                      >
                        <ShieldX className="h-3.5 w-3.5" />
                        Unapprove
                      </motion.button>
                    ) : (
                      <motion.button
                        onClick={() => handleApprove(task.id)}
                        disabled={approvingId !== null}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-green-200 bg-white px-3 py-1.5 text-xs font-semibold text-green-600 transition hover:border-green-300 hover:bg-green-50 disabled:opacity-50 disabled:cursor-not-allowed"
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                      >
                        <ShieldCheck className="h-3.5 w-3.5" />
                        Approve
                      </motion.button>
                    )}
                    {task.status === "archived" ? (
                      archivingId === task.id ? (
                        <span className="inline-flex items-center gap-1.5 rounded-lg border border-green-200 bg-green-50 px-3 py-1.5 text-xs font-semibold text-green-700">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        </span>
                      ) : (
                        <motion.button
                          onClick={() => handleUnarchive(task.id)}
                          disabled={archivingId !== null}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-green-200 bg-white px-3 py-1.5 text-xs font-semibold text-green-600 transition hover:border-green-300 hover:bg-green-50 disabled:opacity-50 disabled:cursor-not-allowed"
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                        >
                          <ArchiveRestore className="h-3.5 w-3.5" />
                          Restore
                        </motion.button>
                      )
                    ) : archivingId === task.id ? (
                      <span className="inline-flex items-center gap-1.5 rounded-lg border border-orange-200 bg-orange-50 px-3 py-1.5 text-xs font-semibold text-orange-700">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      </span>
                    ) : (
                      <motion.button
                        onClick={() => handleArchive(task.id)}
                        disabled={archivingId !== null}
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
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-4 border-t border-gray-200">
          <div className="text-sm text-gray-600">
            Page {page} of {totalPages} ({total} total)
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => {
                setPage(Math.max(1, page - 1));
                setSelectedIds(new Set());
              }}
              disabled={page === 1}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <button
              onClick={() => {
                setPage(Math.min(totalPages, page + 1));
                setSelectedIds(new Set());
              }}
              disabled={page === totalPages}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Task Details Modal */}
      <TaskDetailsModal
        task={selectedTask}
        isOpen={showDetailsModal}
        onClose={() => {
          setShowDetailsModal(false);
          setSelectedTask(null);
        }}
      />
    </div>
  );
}
