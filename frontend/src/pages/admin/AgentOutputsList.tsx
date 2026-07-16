import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
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
  Building2,
  Filter,
  CheckCircle,
  Circle,
  Calendar,
  Clock,
} from "lucide-react";
import {
  archiveAgentOutput,
  unarchiveAgentOutput,
  bulkArchiveAgentOutputs,
  bulkUnarchiveAgentOutputs,
  deleteAgentOutput,
  bulkDeleteAgentOutputs,
} from "../../api/agentOutputs";
import type {
  AgentOutput,
  FetchAgentOutputsRequest,
  AgentOutputStatus,
  AgentOutputType,
} from "../../types/agentOutputs";
import { AgentOutputDetailModal } from "../../components/Admin/agents/AgentOutputDetailModal";
import {
  AdminPageHeader,
  FilterBar,
  BulkActionBar,
  EmptyState,
  Badge,
  ActionButton,
} from "../../components/ui/DesignSystem";
import { useConfirm } from "../../components/ui/ConfirmModal";
import {
  useAdminAgentOutputsList,
  useAdminAgentOutputOrgs,
  useAdminAgentOutputTypesList,
  useInvalidateAdminAgentOutputs,
} from "../../hooks/queries/useAdminStandaloneQueries";
import { AnimatedDropdown } from "./AgentOutputsList/AnimatedDropdown";
import {
  formatDateRange,
  formatRelativeTime,
  formatAgentType,
  getStatusStyles,
} from "./agentOutputsList.utils";

/**
 * Agent Outputs List Page
 * Shows list of agent output cards with filtering and archive functionality
 */
export default function AgentOutputsList() {
  const confirm = useConfirm();

  // Modal state
  const [selectedOutput, setSelectedOutput] = useState<AgentOutput | null>(
    null
  );
  const [showDetailModal, setShowDetailModal] = useState(false);

  // Multi-select state
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkOperationLoading, setBulkOperationLoading] = useState(false);

  // Individual action loading
  const [archivingId, setArchivingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  // Filter states
  const [filters, setFilters] = useState<FetchAgentOutputsRequest>({
    page: 1,
    limit: 50,
  });
  const [selectedOrganization, setSelectedOrganization] = useState<string>("all");
  const [selectedAgentType, setSelectedAgentType] = useState<string>("all");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");

  // TanStack Query — replaces useEffect + useState for data fetching
  const {
    data: queryData,
    isLoading: loading,
    error: queryError,
  } = useAdminAgentOutputsList(filters);
  const { data: organizations = [] } = useAdminAgentOutputOrgs();
  const { data: agentTypes = [] } = useAdminAgentOutputTypesList();
  const { invalidateAll: invalidateOutputs } = useInvalidateAdminAgentOutputs();

  const outputs = queryData?.data ?? [];
  const totalPages = queryData?.totalPages ?? 1;
  const total = queryData?.total ?? 0;
  const error = queryError?.message ?? null;

  const loadOutputs = () => invalidateOutputs();

  const applyFilters = () => {
    const newFilters: FetchAgentOutputsRequest = {
      page: 1,
      limit: 50,
    };

    if (selectedOrganization !== "all") {
      newFilters.organization_id = parseInt(selectedOrganization, 10);
    }
    if (selectedAgentType !== "all") {
      newFilters.agent_type = selectedAgentType as AgentOutputType;
    }
    if (selectedStatus !== "all") {
      newFilters.status = selectedStatus as AgentOutputStatus;
    }

    setFilters(newFilters);
  };

  const resetFilters = () => {
    setSelectedOrganization("all");
    setSelectedAgentType("all");
    setSelectedStatus("all");
    setFilters({ page: 1, limit: 50 });
  };

  const handleViewDetails = (output: AgentOutput) => {
    setSelectedOutput(output);
    setShowDetailModal(true);
  };

  const handleArchive = async (id: number) => {
    if (archivingId) return;
    const ok = await confirm({ title: "Archive this agent output?", confirmLabel: "Archive", variant: "default" });
    if (!ok) return;

    try {
      setArchivingId(id);
      await archiveAgentOutput(id);
      await loadOutputs();
    } catch (err) {
      alert(
        err instanceof Error ? err.message : "Failed to archive agent output"
      );
    } finally {
      setArchivingId(null);
    }
  };

  const handleUnarchive = async (id: number) => {
    if (archivingId) return;
    const ok = await confirm({ title: "Restore this agent output?", confirmLabel: "Restore", variant: "default" });
    if (!ok) return;

    try {
      setArchivingId(id);
      await unarchiveAgentOutput(id);
      await loadOutputs();
    } catch (err) {
      alert(
        err instanceof Error ? err.message : "Failed to restore agent output"
      );
    } finally {
      setArchivingId(null);
    }
  };

  const toggleSelectOutput = (id: number) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const handleBulkArchive = async () => {
    if (selectedIds.size === 0) return;
    const ok = await confirm({ title: `Archive ${selectedIds.size} agent output(s)?`, confirmLabel: "Archive", variant: "default" });
    if (!ok) return;

    try {
      setBulkOperationLoading(true);
      await bulkArchiveAgentOutputs(Array.from(selectedIds));
      setSelectedIds(new Set());
      await loadOutputs();
    } catch (err) {
      alert(
        err instanceof Error ? err.message : "Failed to archive agent outputs"
      );
    } finally {
      setBulkOperationLoading(false);
    }
  };

  const handleBulkUnarchive = async () => {
    if (selectedIds.size === 0) return;
    const ok = await confirm({ title: `Restore ${selectedIds.size} agent output(s)?`, confirmLabel: "Restore", variant: "default" });
    if (!ok) return;

    try {
      setBulkOperationLoading(true);
      await bulkUnarchiveAgentOutputs(Array.from(selectedIds));
      setSelectedIds(new Set());
      await loadOutputs();
    } catch (err) {
      alert(
        err instanceof Error ? err.message : "Failed to restore agent outputs"
      );
    } finally {
      setBulkOperationLoading(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (deletingId) return;
    const ok = await confirm({ title: "Permanently delete this agent output?", message: "This action cannot be undone.", confirmLabel: "Delete", variant: "danger" });
    if (!ok) return;

    try {
      setDeletingId(id);
      await deleteAgentOutput(id);
      await loadOutputs();
    } catch (err) {
      alert(
        err instanceof Error ? err.message : "Failed to delete agent output"
      );
    } finally {
      setDeletingId(null);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    const ok = await confirm({ title: `Permanently delete ${selectedIds.size} agent output(s)?`, message: "This action cannot be undone.", confirmLabel: "Delete", variant: "danger" });
    if (!ok) return;

    try {
      setBulkOperationLoading(true);
      await bulkDeleteAgentOutputs(Array.from(selectedIds));
      setSelectedIds(new Set());
      await loadOutputs();
    } catch (err) {
      alert(
        err instanceof Error ? err.message : "Failed to delete agent outputs"
      );
    } finally {
      setBulkOperationLoading(false);
    }
  };

  const handlePageChange = (newPage: number) => {
    setFilters((prev) => ({ ...prev, page: newPage }));
    setSelectedIds(new Set());
  };

  const allSelectedAreArchived =
    selectedIds.size > 0 &&
    Array.from(selectedIds).every((id) => {
      const output = outputs.find((o) => o.id === id);
      return output?.status === "archived";
    });

  const anySelectedNotArchived =
    selectedIds.size > 0 &&
    Array.from(selectedIds).some((id) => {
      const output = outputs.find((o) => o.id === id);
      return output?.status !== "archived";
    });

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <AdminPageHeader
        icon={<Database className="w-6 h-6" />}
        title="Agent Outputs"
        description="View and manage AI agent execution results"
        actionButtons={
          <div className="flex items-center gap-2">
            <Badge label={`${total} total`} color="blue" />
            <ActionButton
              label={loading ? "Loading" : "Refresh"}
              icon={
                <RefreshCw
                  className={`w-4 h-4 ${loading ? "animate-spin" : ""}`}
                />
              }
              onClick={() => loadOutputs()}
              variant="secondary"
              disabled={loading}
              loading={loading}
            />
          </div>
        }
      />

      {/* Bulk Actions Bar */}
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
                disabled={bulkOperationLoading}
                loading={bulkOperationLoading}
              />
            )}
            {allSelectedAreArchived && (
              <ActionButton
                label="Restore"
                icon={<ArchiveRestore className="w-4 h-4" />}
                onClick={handleBulkUnarchive}
                variant="secondary"
                size="sm"
                disabled={bulkOperationLoading}
                loading={bulkOperationLoading}
              />
            )}
            <ActionButton
              label="Delete"
              icon={<Trash2 className="w-4 h-4" />}
              onClick={handleBulkDelete}
              variant="danger"
              size="sm"
              disabled={bulkOperationLoading}
              loading={bulkOperationLoading}
            />
          </>
        }
      />

      {/* Filters */}
      <FilterBar>
        <div className="flex flex-wrap items-end gap-3">
          <AnimatedDropdown
            value={selectedOrganization}
            onChange={(value) => setSelectedOrganization(value)}
            label="Organization"
            icon={<Building2 className="w-3 h-3" />}
            placeholder="All Organizations"
            options={[
              { value: "all", label: "All Organizations" },
              ...organizations.map((org) => ({ value: String(org.id), label: org.name })),
            ]}
          />
          <AnimatedDropdown
            value={selectedAgentType}
            onChange={(value) => setSelectedAgentType(value)}
            label="Agent Type"
            icon={<Bot className="w-3 h-3" />}
            placeholder="All Types"
            options={[
              { value: "all", label: "All Types" },
              ...agentTypes.map((type) => ({
                value: type,
                label: formatAgentType(type),
              })),
            ]}
          />
          <AnimatedDropdown
            value={selectedStatus}
            onChange={(value) => setSelectedStatus(value)}
            label="Status"
            icon={<Filter className="w-3 h-3" />}
            placeholder="All Statuses"
            options={[
              { value: "all", label: "All Statuses" },
              { value: "success", label: "Success" },
              { value: "pending", label: "Pending" },
              { value: "error", label: "Error" },
              { value: "archived", label: "Archived" },
            ]}
          />
          <div className="flex items-center gap-2 self-end">
            <ActionButton
              label="Apply"
              onClick={applyFilters}
              variant="primary"
            />
            <ActionButton
              label="Reset"
              onClick={resetFilters}
              variant="secondary"
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              if (selectedIds.size === outputs.length && outputs.length > 0) {
                setSelectedIds(new Set());
              } else {
                setSelectedIds(new Set(outputs.map((o) => o.id)));
              }
            }}
            disabled={outputs.length === 0}
            className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-600 transition hover:border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
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
      </FilterBar>

      {/* Error State */}
      <AnimatePresence>
        {error && (
          <motion.div
            className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-red-900">
                Error loading outputs
              </p>
              <p className="text-sm text-red-700 mt-1">{error}</p>
            </div>
            <ActionButton
              label="Retry"
              onClick={() => loadOutputs()}
              variant="danger"
              size="sm"
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Loading State */}
      {loading && outputs.length === 0 ? (
        <motion.div
          className="flex items-center justify-center py-16"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <div className="flex items-center gap-3 text-gray-500">
            <Loader2 className="h-5 w-5 animate-spin" />
            Loading agent outputs...
          </div>
        </motion.div>
      ) : outputs.length === 0 ? (
        <EmptyState
          icon={<Database className="w-12 h-12" />}
          title="No agent outputs found"
          description="No outputs match the selected filters. Try adjusting your filters or run some agents."
          action={{ label: "Reset Filters", onClick: resetFilters }}
        />
      ) : (
        /* Outputs list */
        <div className="space-y-3">
          {outputs.map((output, index) => (
            <motion.div
              key={output.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05, duration: 0.3 }}
              onClick={() => toggleSelectOutput(output.id)}
              className={`rounded-xl border bg-white shadow-sm transition-all hover:shadow-md cursor-pointer ${
                selectedIds.has(output.id)
                  ? "border-blue-300 ring-2 ring-blue-100"
                  : "border-gray-200"
              } ${output.status === "archived" ? "opacity-60" : ""}`}
            >
              <div className="p-4">
                <div className="flex items-start gap-4">
                  {/* Selection checkbox */}
                  <motion.div
                    className="mt-1 flex-shrink-0"
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                  >
                    {selectedIds.has(output.id) ? (
                      <CheckCircle className="h-5 w-5 text-blue-600" />
                    ) : (
                      <Circle className="h-5 w-5 text-gray-300" />
                    )}
                  </motion.div>

                  {/* Main content */}
                  <div className="flex-1 min-w-0">
                    {/* Top row: Domain and status badge */}
                    <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                      <div className="flex-1 min-w-0">
                        <h3 className="text-base font-semibold text-gray-900 line-clamp-1">
                          {output.organization_id
                            ? organizations.find((o) => o.id === output.organization_id)?.name ?? `Org #${output.organization_id}`
                            : "System"}
                        </h3>
                        <p className="text-sm text-gray-500 mt-0.5">
                          {formatAgentType(output.agent_type)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {/* Status badge */}
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
                    </div>

                    {/* Metadata row */}
                    <div className="flex flex-wrap items-center gap-3 text-sm">
                      {/* Date Range */}
                      <div className="flex items-center gap-1.5 text-gray-600">
                        <Calendar className="h-3.5 w-3.5 text-gray-400" />
                        <span>
                          {formatDateRange(output.date_start)} -{" "}
                          {formatDateRange(output.date_end)}
                        </span>
                      </div>

                      {/* Created */}
                      <div className="flex items-center gap-1.5 text-gray-500">
                        <Clock className="h-3.5 w-3.5 text-gray-400" />
                        <span>{formatRelativeTime(output.created_at)}</span>
                      </div>

                      {/* Agent Type Pill */}
                      <span className="inline-flex items-center gap-1.5 rounded-lg border border-purple-200 bg-purple-50 px-2 py-0.5 text-xs font-medium text-purple-700">
                        <Bot className="h-3 w-3" />
                        {formatAgentType(output.agent_type)}
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
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
                          Restoring...
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
                        Archiving...
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
                        Deleting...
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
        <motion.div
          className="flex items-center justify-between pt-4"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <ActionButton
            label="Previous"
            onClick={() =>
              handlePageChange(Math.max(1, (filters.page || 1) - 1))
            }
            variant="secondary"
            disabled={(filters.page || 1) === 1 || loading}
          />
          <span className="text-sm text-gray-600">
            Page {filters.page || 1} of {totalPages} ({total} total)
          </span>
          <ActionButton
            label="Next"
            onClick={() =>
              handlePageChange(Math.min(totalPages, (filters.page || 1) + 1))
            }
            variant="secondary"
            disabled={(filters.page || 1) === totalPages || loading}
          />
        </motion.div>
      )}

      {/* Summary Stats */}
      {!loading && !error && outputs.length > 0 && (
        <motion.div
          className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-gray-200 bg-white px-4 py-3"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <span className="text-sm text-gray-600">
            Showing {outputs.length} of {total} output{total !== 1 ? "s" : ""}
          </span>
          <div className="flex items-center gap-6 text-sm">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-green-400" />
              <span className="text-gray-600">
                <strong className="text-gray-900">
                  {outputs.filter((o) => o.status === "success").length}
                </strong>{" "}
                success
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-yellow-400" />
              <span className="text-gray-600">
                <strong className="text-gray-900">
                  {outputs.filter((o) => o.status === "pending").length}
                </strong>{" "}
                pending
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-red-400" />
              <span className="text-gray-600">
                <strong className="text-gray-900">
                  {outputs.filter((o) => o.status === "error").length}
                </strong>{" "}
                error
              </span>
            </div>
          </div>
        </motion.div>
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
