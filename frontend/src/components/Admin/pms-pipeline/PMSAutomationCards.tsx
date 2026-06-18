import { motion, AnimatePresence } from "framer-motion";
import {
  Eye,
  Loader2,
  RefreshCw,
  Trash2,
  ChevronDown,
  Cpu,
  Building2,
  Filter,
  Check,
  Clock,
  CheckCircle,
  Calendar,
  AlertCircle,
  GitBranch,
} from "lucide-react";
import { PMSAutomationProgressDropdown } from "./PMSAutomationProgressDropdown";
import { PMSDataViewer } from "../../PMS/PMSDataViewer";
import { PMSPipelineModal } from "./PMSPipelineModal";
import {
  AdminPageHeader,
  FilterBar,
  EmptyState,
  ActionButton,
  Badge,
} from "../../ui/DesignSystem";
import { ConfirmModal } from "@/components/settings/ConfirmModal";
import type { StatusFilter, ApprovalFilter } from "./pmsAutomationCards.types";
import {
  STATUS_LABELS,
  STATUS_STYLES,
  STATUS_OPTIONS,
  APPROVAL_TEXT,
  formatTimeElapsed,
  formatTimestamp,
} from "./pmsAutomationCards.utils";
import { FilterDropdown } from "./PMSAutomationCards/FilterDropdown";
import { ApprovalSwitch } from "./PMSAutomationCards/ApprovalSwitch";
import { usePmsAutomationJobs } from "./usePmsAutomationJobs";

export function PMSAutomationCards() {
  const {
    jobs,
    pagination,
    statusFilter,
    approvalFilter,
    organizationFilter,
    organizations,
    isLoading,
    error,
    approvingJobId,
    setActiveModalJobId,
    pipelineJobId,
    setPipelineJobId,
    lastUpdated,
    deletingJobId,
    expandedAutomationJobIds,
    confirmModal,
    setConfirmModal,
    loadJobs,
    handleStatusFilterChange,
    handleApprovalFilterChange,
    handleOrganizationFilterChange,
    goToPreviousPage,
    goToNextPage,
    handleApprovalToggle,
    handleSaveResponse,
    handleDeleteJob,
    toggleAutomationExpansion,
    handleAutomationStatusChange,
    rangeStart,
    rangeEnd,
    activeModalJob,
  } = usePmsAutomationJobs();
  return (
    <div className="space-y-6">
      {/* Page Header */}
      <AdminPageHeader
        icon={<Cpu className="w-6 h-6" />}
        title="AI PMS Automation"
        description="Monitor and manage PMS data processing jobs"
        actionButtons={
          <div className="flex items-center gap-2">
            <Badge label={`${pagination.total} jobs`} color="blue" />
            <ActionButton
              label={isLoading ? "Loading" : "Refresh"}
              icon={
                <RefreshCw
                  className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`}
                />
              }
              onClick={() => loadJobs()}
              variant="secondary"
              disabled={isLoading}
              loading={isLoading}
            />
          </div>
        }
      />

      {/* Filters */}
      <FilterBar>
        <div className="flex flex-wrap items-end gap-3">
          <FilterDropdown
            value={statusFilter}
            onChange={(value) => handleStatusFilterChange(value as StatusFilter)}
            label="Status"
            icon={<Filter className="w-3 h-3" />}
            placeholder="All Jobs"
            options={STATUS_OPTIONS.map((option) => ({
              value: option,
              label: STATUS_LABELS[option],
            }))}
          />
          <FilterDropdown
            value={organizationFilter}
            onChange={(value) => handleOrganizationFilterChange(value)}
            label="Organization"
            icon={<Building2 className="w-3 h-3" />}
            placeholder="All Organizations"
            options={[
              { value: "all", label: "All Organizations" },
              ...organizations.map((org) => ({
                value: String(org.id),
                label: org.name,
              })),
            ]}
          />
          <FilterDropdown
            value={approvalFilter}
            onChange={(value) => handleApprovalFilterChange(value as ApprovalFilter)}
            label="Approval"
            icon={<CheckCircle className="w-3 h-3" />}
            placeholder="All"
            options={[
              { value: "all", label: "All" },
              { value: "approved", label: "Approved" },
              { value: "unapproved", label: "Needs Review" },
            ]}
          />
        </div>
        {lastUpdated && (
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <Clock className="w-3.5 h-3.5" />
            Updated {lastUpdated.toLocaleTimeString()}
          </div>
        )}
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
              <p className="text-sm font-medium text-red-900">Error loading jobs</p>
              <p className="text-sm text-red-700 mt-1">{error}</p>
            </div>
            <ActionButton
              label="Retry"
              onClick={() => loadJobs()}
              variant="danger"
              size="sm"
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Loading State */}
      {isLoading && jobs.length === 0 ? (
        <motion.div
          className="flex items-center justify-center py-16"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <div className="flex items-center gap-3 text-gray-500">
            <Loader2 className="h-5 w-5 animate-spin" />
            Loading PMS jobs...
          </div>
        </motion.div>
      ) : jobs.length === 0 ? (
        <EmptyState
          icon={<Cpu className="w-12 h-12" />}
          title="No PMS jobs found"
          description="No jobs match the selected filters. Try adjusting your filters or wait for new jobs to be created."
        />
      ) : (
        /* Jobs List - Card-based layout */
        <div className="space-y-3">
          {jobs.map((job, index) => {
            const statusClass =
              STATUS_STYLES[job.status] ||
              "bg-gray-100 text-gray-700 border-gray-200";
            const isDeleting = deletingJobId === job.id;
            const hasAutomationStatus = !!job.automation_status_detail;
            const isAutomationExpanded = expandedAutomationJobIds.has(job.id);
            const isPending = job.status === "pending";
            // Pipeline data only exists once monthly_agents has produced
            // agent_results rows. Show the button when the run reached
            // task_creation/complete, or when monthly_agents itself is at
            // least processing (RE/Summary outputs may already be persisted).
            const automationCurrentStep =
              job.automation_status_detail?.currentStep;
            const showPipelineButton =
              hasAutomationStatus &&
              (automationCurrentStep === "task_creation" ||
                automationCurrentStep === "complete" ||
                automationCurrentStep === "monthly_agents");

            return (
              <motion.div
                key={job.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05, duration: 0.3 }}
                className={`rounded-xl border bg-white shadow-sm transition-all hover:shadow-md ${
                  isPending ? "opacity-70" : ""
                } border-gray-200`}
              >
                {/* Pending overlay effect */}
                {isPending && (
                  <div className="absolute inset-0 rounded-xl overflow-hidden pointer-events-none">
                    <div className="h-full w-full animate-pulse bg-gradient-to-r from-gray-100 via-gray-200 to-gray-100 opacity-30" />
                  </div>
                )}

                <div className="p-4 relative">
                  <div className="flex items-start gap-4">
                    {/* Expand button for automation status */}
                    {hasAutomationStatus && (
                      <motion.button
                        onClick={() => toggleAutomationExpansion(job.id)}
                        className="mt-1 flex-shrink-0 p-1 rounded-lg hover:bg-gray-100 transition"
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                      >
                        <motion.div
                          animate={{ rotate: isAutomationExpanded ? 180 : 0 }}
                          transition={{ duration: 0.2 }}
                        >
                          <ChevronDown className="h-5 w-5 text-gray-400" />
                        </motion.div>
                      </motion.button>
                    )}

                    {/* Main content */}
                    <div className="flex-1 min-w-0">
                      {/* Top row: Domain and status badge */}
                      <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                        <div className="flex-1 min-w-0">
                          <h3 className="text-base font-semibold text-gray-900 line-clamp-1">
                            {job.organization_id
                              ? organizations.find((o) => o.id === job.organization_id)?.name || `Organization #${job.organization_id}`
                              : "Unassigned"}
                          </h3>
                          <p className="text-sm text-gray-500 mt-0.5">
                            Job #{job.id}{job.location_name ? ` · ${job.location_name}` : ""}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {/* Status badge */}
                          <span
                            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClass}`}
                          >
                            {job.status === "completed" && <Check className="h-3 w-3" />}
                            {job.status === "pending" && <Clock className="h-3 w-3" />}
                            {job.status === "error" && <AlertCircle className="h-3 w-3" />}
                            {job.status === "waiting_for_approval" && <Clock className="h-3 w-3" />}
                            {job.status === "approved" && <CheckCircle className="h-3 w-3" />}
                            {STATUS_LABELS[job.status as StatusFilter] || job.status}
                          </span>
                        </div>
                      </div>

                      {/* Metadata row */}
                      <div className="flex flex-wrap items-center gap-4 text-sm">
                        {/* Time Elapsed */}
                        <div className="flex items-center gap-1.5 text-gray-600">
                          <Clock className="h-3.5 w-3.5 text-gray-400" />
                          <span className="font-medium">{formatTimeElapsed(job.time_elapsed)}</span>
                        </div>

                        {/* Created */}
                        <div className="flex items-center gap-1.5 text-gray-500">
                          <Calendar className="h-3.5 w-3.5 text-gray-400" />
                          <span>{formatTimestamp(job.timestamp)}</span>
                        </div>

                        {/* Approval Switch */}
                        <ApprovalSwitch
                          isApproved={job.is_approved}
                          isLoading={approvingJobId === job.id}
                          disabled={isPending}
                          onToggle={() => handleApprovalToggle(job)}
                        />
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <motion.button
                        onClick={() => setActiveModalJobId(job.id)}
                        disabled={isPending}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 transition hover:border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                      >
                        <Eye className="h-3.5 w-3.5" />
                        View
                      </motion.button>
                      {showPipelineButton && (
                        <motion.button
                          onClick={() => setPipelineJobId(job.id)}
                          disabled={isPending}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-alloro-navy/20 bg-white px-3 py-1.5 text-xs font-semibold text-alloro-navy transition hover:border-alloro-navy/40 hover:bg-alloro-navy/5 disabled:opacity-50 disabled:cursor-not-allowed"
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          title="View agent inputs and outputs for this run"
                        >
                          <GitBranch className="h-3.5 w-3.5" />
                          Pipeline
                        </motion.button>
                      )}
                      {isDeleting ? (
                        <span className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          Deleting...
                        </span>
                      ) : (
                        <motion.button
                          onClick={() => handleDeleteJob(job.id)}
                          disabled={isPending}
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

                {/* Automation Progress Dropdown */}
                <AnimatePresence>
                  {hasAutomationStatus && isAutomationExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden border-t border-gray-100"
                    >
                      <div className="px-4 py-4 bg-gray-50/50">
                        <PMSAutomationProgressDropdown
                          jobId={job.id}
                          initialStatus={job.automation_status_detail}
                          onStatusChange={(status) =>
                            handleAutomationStatusChange(job.id, status)
                          }
                        />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <motion.div
          className="flex items-center justify-between pt-4"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <ActionButton
            label="Previous"
            onClick={goToPreviousPage}
            variant="secondary"
            disabled={pagination.page === 1 || isLoading}
          />
          <span className="text-sm text-gray-600">
            Page {Math.min(pagination.page, Math.max(pagination.totalPages, 1))} of{" "}
            {Math.max(pagination.totalPages, 1)} ({pagination.total} total)
          </span>
          <ActionButton
            label="Next"
            onClick={goToNextPage}
            variant="secondary"
            disabled={
              pagination.page >= pagination.totalPages ||
              isLoading ||
              !pagination.hasNextPage
            }
          />
        </motion.div>
      )}

      {/* Summary Stats */}
      {!isLoading && !error && jobs.length > 0 && (
        <motion.div
          className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-gray-200 bg-white px-4 py-3"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <span className="text-sm text-gray-600">
            Showing {rangeStart}–{rangeEnd} of {pagination.total} job{pagination.total !== 1 ? "s" : ""}
          </span>
          <div className="flex items-center gap-6 text-sm">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-green-400" />
              <span className="text-gray-600">
                <strong className="text-gray-900">
                  {jobs.filter((j) => j.status === "completed").length}
                </strong>{" "}
                completed
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-yellow-400" />
              <span className="text-gray-600">
                <strong className="text-gray-900">
                  {jobs.filter((j) => j.status === "waiting_for_approval").length}
                </strong>{" "}
                awaiting
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-red-400" />
              <span className="text-gray-600">
                <strong className="text-gray-900">
                  {jobs.filter((j) => j.status === "error").length}
                </strong>{" "}
                errors
              </span>
            </div>
          </div>
        </motion.div>
      )}

      {/* PMS Data Viewer Modal */}
      {activeModalJob && (
        <PMSDataViewer
          isOpen={true}
          jobId={activeModalJob.id}
          title="Review PMS Response Data"
          subtitle={`${activeModalJob.organization_id ? (organizations.find((o) => o.id === activeModalJob.organization_id)?.name || `Org #${activeModalJob.organization_id}`) : "Unassigned"} • ${
            APPROVAL_TEXT[activeModalJob.is_approved ? "locked" : "pending"]
          }`}
          initialData={activeModalJob.response_log}
          onClose={() => setActiveModalJobId(null)}
          onSave={async (transformedData) => {
            await handleSaveResponse(activeModalJob.id, transformedData);
            await loadJobs({ silent: true });
          }}
          readOnly={false}
        />
      )}

      <ConfirmModal
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
        onConfirm={confirmModal.onConfirm}
        title={confirmModal.title}
        message={confirmModal.message}
        type={confirmModal.type}
        confirmText="Delete"
      />

      <PMSPipelineModal
        jobId={pipelineJobId}
        isOpen={pipelineJobId !== null}
        onClose={() => setPipelineJobId(null)}
      />
    </div>
  );
}
