import { useState } from "react";
import { motion } from "framer-motion";
import {
  RefreshCw,
  AlertCircle,
  Archive,
  ArchiveRestore,
  Loader2,
  Eye,
  Trash2,
  Database,
  Bot,
  Calendar,
  Clock,
  CheckCircle,
  Circle,
} from "lucide-react";
import { toast } from "react-hot-toast";
import {
  archiveAgentOutput,
  unarchiveAgentOutput,
  bulkArchiveAgentOutputs,
  bulkUnarchiveAgentOutputs,
  deleteAgentOutput,
  bulkDeleteAgentOutputs,
} from "../../api/agentOutputs";
import type { AgentOutput, AgentOutputType } from "../../types/agentOutputs";
import { AgentOutputDetailModal } from "./AgentOutputDetailModal";
import { BulkActionBar, ActionButton } from "../ui/DesignSystem";
import { useConfirm } from "../ui/ConfirmModal";
import {
  useAdminOrgAgentOutputs,
  useInvalidateAdminOrgAgentOutputs,
} from "../../hooks/queries/useAdminOrgTabQueries";

interface OrgAgentOutputsTabProps {
  organizationId: number;
  agentType: AgentOutputType;
  locationId: number | null;
}

export function OrgAgentOutputsTab({
  organizationId,
  agentType,
  locationId,
}: OrgAgentOutputsTabProps) {
  const [statusFilter, setStatusFilter] = useState<
    "all" | "success" | "pending" | "error" | "archived"
  >("all");
  const [page, setPage] = useState(1);

  // Detail modal
  const [selectedOutput, setSelectedOutput] = useState<AgentOutput | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);

  // Multi-select
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);

  // Individual action loading
  const [archivingId, setArchivingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const confirm = useConfirm();

  const pageSize = 50;

  // TanStack Query — replaces useEffect + useState
  const { data, isLoading: loading } = useAdminOrgAgentOutputs({
    organizationId,
    agentType,
    locationId,
    statusFilter,
    page,
    pageSize,
  });
  const { invalidateForOrg } = useInvalidateAdminOrgAgentOutputs();

  const outputs = data?.outputs ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / pageSize);

  const loadOutputs = () => invalidateForOrg(organizationId);

  const getStatusStyles = (status: string) => {
    switch (status?.toLowerCase()) {
      case "success":
        return "border-green-200 bg-green-100 text-green-700";
      case "pending":
        return "border-yellow-200 bg-yellow-100 text-yellow-700";
      case "error":
        return "border-red-200 bg-red-100 text-red-700";
      case "archived":
        return "border-gray-200 bg-gray-100 text-gray-500";
      default:
        return "border-gray-200 bg-gray-100 text-gray-700";
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "—";
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

  const formatAgentType = (type: string): string => {
    return type
      .split("_")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
  };

  // --- Actions ---

  const toggleSelect = (id: number) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const handleViewDetails = (output: AgentOutput) => {
    setSelectedOutput(output);
    setShowDetailModal(true);
  };

  const handleArchive = async (id: number) => {
    if (archivingId) return;
    const ok = await confirm({ title: "Archive this agent output?", confirmLabel: "Archive", variant: "danger" });
    if (!ok) return;
    try {
      setArchivingId(id);
      await archiveAgentOutput(id);
      await loadOutputs();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to archive");
    } finally {
      setArchivingId(null);
    }
  };

  const handleUnarchive = async (id: number) => {
    if (archivingId) return;
    const ok = await confirm({ title: "Restore this agent output?", confirmLabel: "Restore", variant: "danger" });
    if (!ok) return;
    try {
      setArchivingId(id);
      await unarchiveAgentOutput(id);
      await loadOutputs();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to restore");
    } finally {
      setArchivingId(null);
    }
  };

  const handleDelete = async (id: number) => {
    if (deletingId) return;
    const ok = await confirm({ title: "Permanently delete this agent output?", message: "This cannot be undone.", confirmLabel: "Delete", variant: "danger" });
    if (!ok) return;
    try {
      setDeletingId(id);
      await deleteAgentOutput(id);
      await loadOutputs();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete");
    } finally {
      setDeletingId(null);
    }
  };

  const handleBulkArchive = async () => {
    if (selectedIds.size === 0) return;
    const ok = await confirm({ title: `Archive ${selectedIds.size} output(s)?`, confirmLabel: "Archive", variant: "danger" });
    if (!ok) return;
    try {
      setBulkLoading(true);
      await bulkArchiveAgentOutputs(Array.from(selectedIds));
      setSelectedIds(new Set());
      await loadOutputs();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to archive");
    } finally {
      setBulkLoading(false);
    }
  };

  const handleBulkUnarchive = async () => {
    if (selectedIds.size === 0) return;
    const ok = await confirm({ title: `Restore ${selectedIds.size} output(s)?`, confirmLabel: "Restore", variant: "danger" });
    if (!ok) return;
    try {
      setBulkLoading(true);
      await bulkUnarchiveAgentOutputs(Array.from(selectedIds));
      setSelectedIds(new Set());
      await loadOutputs();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to restore");
    } finally {
      setBulkLoading(false);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    const ok = await confirm({ title: `Permanently delete ${selectedIds.size} output(s)?`, message: "This cannot be undone.", confirmLabel: "Delete", variant: "danger" });
    if (!ok) return;
    try {
      setBulkLoading(true);
      await bulkDeleteAgentOutputs(Array.from(selectedIds));
      setSelectedIds(new Set());
      await loadOutputs();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete");
    } finally {
      setBulkLoading(false);
    }
  };

  const allSelectedArchived =
    selectedIds.size > 0 &&
    Array.from(selectedIds).every(
      (id) => outputs.find((o) => o.id === id)?.status === "archived"
    );

  const anySelectedNotArchived =
    selectedIds.size > 0 &&
    Array.from(selectedIds).some(
      (id) => outputs.find((o) => o.id === id)?.status !== "archived"
    );

  return (
    <div className="space-y-4">
      {/* Filter + Select All */}
      <div className="flex items-center justify-between gap-3">
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(
              e.target.value as
                | "all"
                | "success"
                | "pending"
                | "error"
                | "archived"
            );
            setPage(1);
            setSelectedIds(new Set());
          }}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-alloro-orange/50"
        >
          <option value="all">All Status</option>
          <option value="success">Success</option>
          <option value="pending">Pending</option>
          <option value="error">Error</option>
          <option value="archived">Archived</option>
        </select>

        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">{total} total</span>
          <button
            onClick={() => {
              if (
                selectedIds.size === outputs.length &&
                outputs.length > 0
              ) {
                setSelectedIds(new Set());
              } else {
                setSelectedIds(new Set(outputs.map((o) => o.id)));
              }
            }}
            disabled={outputs.length === 0}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-600 transition hover:border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {selectedIds.size === outputs.length && outputs.length > 0 ? (
              <CheckCircle className="h-4 w-4 text-blue-600" />
            ) : (
              <Circle className="h-4 w-4 text-gray-400" />
            )}
            {selectedIds.size === outputs.length && outputs.length > 0
              ? "Deselect All"
              : "Select All"}
          </button>
        </div>
      </div>

      {/* Bulk Actions */}
      <BulkActionBar
        selectedCount={selectedIds.size}
        totalCount={outputs.length}
        onSelectAll={() => setSelectedIds(new Set(outputs.map((o) => o.id)))}
        onDeselectAll={() => setSelectedIds(new Set())}
        isAllSelected={
          selectedIds.size === outputs.length && outputs.length > 0
        }
        actions={
          <>
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
            <ActionButton
              label="Delete"
              icon={<Trash2 className="w-4 h-4" />}
              onClick={handleBulkDelete}
              variant="danger"
              size="sm"
              disabled={bulkLoading}
              loading={bulkLoading}
            />
          </>
        }
      />

      {/* Output List */}
      {loading ? (
        <div className="flex items-center justify-center py-12 text-gray-500">
          <RefreshCw className="h-5 w-5 animate-spin mr-2" />
          Loading outputs...
        </div>
      ) : outputs.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <Database className="h-8 w-8 mx-auto mb-2 text-gray-300" />
          <p>No agent outputs found</p>
        </div>
      ) : (
        <div className="space-y-3">
          {outputs.map((output, index) => (
            <motion.div
              key={output.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.03, duration: 0.2 }}
              onClick={() => toggleSelect(output.id)}
              className={`rounded-xl border bg-white shadow-sm transition-all hover:shadow-md cursor-pointer ${
                selectedIds.has(output.id)
                  ? "border-blue-300 ring-2 ring-blue-100"
                  : "border-gray-200"
              } ${output.status === "archived" ? "opacity-60" : ""}`}
            >
              <div className="p-4">
                <div className="flex items-start gap-3">
                  {/* Checkbox */}
                  <div className="mt-0.5 flex-shrink-0">
                    {selectedIds.has(output.id) ? (
                      <CheckCircle className="h-5 w-5 text-blue-600" />
                    ) : (
                      <Circle className="h-5 w-5 text-gray-300" />
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    {/* Title row */}
                    <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                      <div className="flex-1 min-w-0">
                        <h4 className="text-base font-semibold text-gray-900">
                          {formatAgentType(output.agent_type)}
                        </h4>
                        <p className="text-sm text-gray-500 mt-0.5">
                          Output #{output.id}
                        </p>
                      </div>
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${getStatusStyles(output.status)}`}
                      >
                        {output.status === "success" && (
                          <CheckCircle className="h-3 w-3" />
                        )}
                        {output.status === "pending" && (
                          <Clock className="h-3 w-3" />
                        )}
                        {output.status === "error" && (
                          <AlertCircle className="h-3 w-3" />
                        )}
                        {output.status === "archived" && (
                          <Archive className="h-3 w-3" />
                        )}
                        {output.status.charAt(0).toUpperCase() +
                          output.status.slice(1)}
                      </span>
                    </div>

                    {/* Error message */}
                    {output.error_message && (
                      <p className="text-sm text-red-600 mb-2 line-clamp-2">
                        {output.error_message}
                      </p>
                    )}

                    {/* Metadata row */}
                    <div className="flex flex-wrap items-center gap-3 text-sm">
                      {output.date_start && (
                        <div className="flex items-center gap-1.5 text-gray-600">
                          <Calendar className="h-3.5 w-3.5 text-gray-400" />
                          <span>
                            {formatDate(output.date_start)} –{" "}
                            {formatDate(output.date_end)}
                          </span>
                        </div>
                      )}
                      <div className="flex items-center gap-1.5 text-gray-500">
                        <Clock className="h-3.5 w-3.5 text-gray-400" />
                        <span>{formatRelativeTime(output.created_at)}</span>
                      </div>
                      <span className="inline-flex items-center gap-1 rounded-lg border border-purple-200 bg-purple-50 px-2 py-0.5 text-xs font-medium text-purple-700">
                        <Bot className="h-3 w-3" />
                        {formatAgentType(output.agent_type)}
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div
                    className="flex items-center gap-2 flex-shrink-0"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <motion.button
                      onClick={() => handleViewDetails(output)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 transition hover:border-gray-300 hover:bg-gray-50"
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      <Eye className="h-3.5 w-3.5" />
                      View
                    </motion.button>
                    {output.status === "archived" ? (
                      archivingId === output.id ? (
                        <span className="inline-flex items-center gap-1.5 rounded-lg border border-green-200 bg-green-50 px-3 py-1.5 text-xs font-semibold text-green-700">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        </span>
                      ) : (
                        <motion.button
                          onClick={() => handleUnarchive(output.id)}
                          disabled={archivingId !== null}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-green-200 bg-white px-3 py-1.5 text-xs font-semibold text-green-600 transition hover:border-green-300 hover:bg-green-50 disabled:opacity-50 disabled:cursor-not-allowed"
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                        >
                          <ArchiveRestore className="h-3.5 w-3.5" />
                          Restore
                        </motion.button>
                      )
                    ) : archivingId === output.id ? (
                      <span className="inline-flex items-center gap-1.5 rounded-lg border border-orange-200 bg-orange-50 px-3 py-1.5 text-xs font-semibold text-orange-700">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      </span>
                    ) : (
                      <motion.button
                        onClick={() => handleArchive(output.id)}
                        disabled={archivingId !== null}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-orange-200 bg-white px-3 py-1.5 text-xs font-semibold text-orange-600 transition hover:border-orange-300 hover:bg-orange-50 disabled:opacity-50 disabled:cursor-not-allowed"
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                      >
                        <Archive className="h-3.5 w-3.5" />
                        Archive
                      </motion.button>
                    )}
                    {deletingId === output.id ? (
                      <span className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      </span>
                    ) : (
                      <motion.button
                        onClick={() => handleDelete(output.id)}
                        disabled={deletingId !== null}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-600 transition hover:border-red-300 hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed"
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Delete
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

      {/* Detail Modal */}
      <AgentOutputDetailModal
        output={selectedOutput}
        isOpen={showDetailModal}
        onClose={() => {
          setShowDetailModal(false);
          setSelectedOutput(null);
        }}
      />
    </div>
  );
}
