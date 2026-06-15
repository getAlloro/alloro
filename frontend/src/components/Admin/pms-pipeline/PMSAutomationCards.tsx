import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import {
  fetchPmsJobs,
  deletePmsJob,
  togglePmsJobApproval,
  updatePmsJobResponse,
  type PmsJob,
  type AutomationStatusDetail,
} from "../../api/pms";
import { fetchOrganizations } from "../../api/agentOutputs";
import { PMSAutomationProgressDropdown } from "./PMSAutomationProgressDropdown";
import { PMSDataViewer } from "../PMS/PMSDataViewer";
import { PMSPipelineModal } from "./PMSPipelineModal";
import {
  AdminPageHeader,
  FilterBar,
  EmptyState,
  ActionButton,
  Badge,
} from "../ui/DesignSystem";
import { ConfirmModal } from "@/components/settings/ConfirmModal";
import { logger } from "../../lib/logger";
import { getErrorMessage } from "../../lib/errorMessage";

type StatusFilter =
  | "all"
  | "pending"
  | "waiting_for_approval"
  | "approved"
  | "completed"
  | "error";
type ApprovalFilter = "all" | "approved" | "unapproved";

interface PaginationState {
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
}

interface JobEditorState {
  draft: string;
  isDirty: boolean;
  error?: string;
}

const STATUS_LABELS: Record<StatusFilter, string> = {
  all: "All Jobs",
  pending: "Pending",
  waiting_for_approval: "Waiting for Approval",
  approved: "Approved",
  completed: "Completed",
  error: "Error",
};

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-gray-200 text-gray-700 border-gray-300",
  waiting_for_approval: "bg-yellow-100 text-yellow-700 border-yellow-200",
  approved: "bg-green-100 text-green-700 border-green-200",
  completed: "bg-blue-100 text-blue-700 border-blue-200",
  error: "bg-red-100 text-red-700 border-red-200",
};

const STATUS_OPTIONS: StatusFilter[] = [
  "all",
  "pending",
  "waiting_for_approval",
  "approved",
  "completed",
  "error",
];


const APPROVAL_TEXT: Record<"locked" | "pending", string> = {
  locked: "Approved",
  pending: "Needs approval",
};

const POLL_INTERVAL_MS = 2000;

// Filter Dropdown Component
interface FilterDropdownOption {
  value: string;
  label: string;
}

interface FilterDropdownProps {
  value: string;
  options: FilterDropdownOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  icon?: React.ReactNode;
  label?: string;
}

const FilterDropdown: React.FC<FilterDropdownProps> = ({
  value,
  options,
  onChange,
  disabled = false,
  placeholder = "Select...",
  icon,
  label,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const currentOption = options.find((opt) => opt.value === value);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  return (
    <div className="flex flex-col gap-1">
      {label && (
        <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 flex items-center gap-1">
          {icon}
          {label}
        </span>
      )}
      <div ref={dropdownRef} className="relative">
        <motion.button
          onClick={() => !disabled && setIsOpen(!isOpen)}
          disabled={disabled}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 transition-all hover:border-gray-300 focus:border-alloro-orange focus:outline-none focus:ring-2 focus:ring-alloro-orange/20 disabled:opacity-50 disabled:cursor-not-allowed min-w-[140px] justify-between"
          whileHover={{ scale: disabled ? 1 : 1.01 }}
          whileTap={{ scale: disabled ? 1 : 0.99 }}
        >
          <span className="truncate">{currentOption?.label || placeholder}</span>
          <motion.div
            animate={{ rotate: isOpen ? 180 : 0 }}
            transition={{ duration: 0.2 }}
          >
            <ChevronDown className="h-4 w-4 text-gray-400" />
          </motion.div>
        </motion.button>

        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ opacity: 0, y: -8, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.95 }}
              transition={{ duration: 0.15 }}
              className="absolute top-full left-0 mt-1 z-50 min-w-full overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg max-h-60 overflow-y-auto"
            >
              {options.map((option) => (
                <motion.button
                  key={option.value}
                  onClick={() => {
                    onChange(option.value);
                    setIsOpen(false);
                  }}
                  className={`w-full px-3 py-2 text-left text-sm font-medium transition-colors ${
                    option.value === value
                      ? "bg-alloro-orange/10 text-alloro-orange"
                      : "text-gray-700 hover:bg-gray-50"
                  }`}
                  whileHover={{ backgroundColor: option.value === value ? undefined : "rgba(0,0,0,0.03)" }}
                >
                  <div className="flex items-center gap-2">
                    {option.value === value && (
                      <Check className="h-3.5 w-3.5 text-alloro-orange" />
                    )}
                    <span className={option.value === value ? "ml-0" : "ml-5"}>
                      {option.label}
                    </span>
                  </div>
                </motion.button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

// Approval Switch Component
interface ApprovalSwitchProps {
  isApproved: boolean;
  isLoading: boolean;
  disabled: boolean;
  onToggle: () => void;
}

const ApprovalSwitch: React.FC<ApprovalSwitchProps> = ({
  isApproved,
  isLoading,
  disabled,
  onToggle,
}) => {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      disabled={disabled || isLoading || isApproved}
      className="flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <span
        className={`text-xs font-medium w-20 text-right ${
          isApproved ? "text-green-600" : "text-gray-500"
        }`}
      >
        {isLoading ? "Approving..." : isApproved ? "Approved" : "Needs Review"}
      </span>
      <motion.div
        className={`relative w-10 h-5 rounded-full transition-colors ${
          isApproved ? "bg-green-500" : "bg-gray-300"
        } ${isApproved ? "cursor-default" : "cursor-pointer"}`}
        whileTap={{ scale: isApproved ? 1 : 0.95 }}
      >
        <motion.div
          className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm flex items-center justify-center"
          initial={false}
          animate={{ x: isApproved ? 22 : 2 }}
          transition={{ type: "spring", stiffness: 500, damping: 30 }}
        >
          {isLoading && (
            <Loader2 className="w-2.5 h-2.5 text-gray-400 animate-spin" />
          )}
        </motion.div>
      </motion.div>
    </button>
  );
};

const formatTimeElapsed = (value: number | null): string => {
  if (!value && value !== 0) {
    return "—";
  }

  if (value < 60) {
    return `${value}s`;
  }

  const minutes = Math.floor(value / 60);
  const seconds = value % 60;
  return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
};

const formatTimestamp = (value: string): string => {
  if (!value) {
    return "—";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
};

const serializeResponse = (value: unknown): string => {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return "";
    }
    try {
      return JSON.stringify(JSON.parse(trimmed), null, 2);
    } catch (error) {
      return value;
    }
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch (error) {
    return String(value);
  }
};

const validateJson = (value: string): string | undefined => {
  const trimmed = value.trim();

  if (!trimmed) {
    return undefined;
  }

  try {
    JSON.parse(trimmed);
    return undefined;
  } catch (error: unknown) {
    return getErrorMessage(error) || "Invalid JSON";
  }
};

export function PMSAutomationCards() {
  const [jobs, setJobs] = useState<PmsJob[]>([]);
  const [pagination, setPagination] = useState<PaginationState>({
    page: 1,
    perPage: 10,
    total: 0,
    totalPages: 1,
    hasNextPage: false,
  });
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [approvalFilter, setApprovalFilter] = useState<ApprovalFilter>("all");
  const [organizationFilter, setOrganizationFilter] = useState<string>("all");
  const [organizations, setOrganizations] = useState<{ id: number; name: string }[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [approvingJobId, setApprovingJobId] = useState<number | null>(null);
  const [, setSavingResponseJobId] = useState<number | null>(null);
  const [activeModalJobId, setActiveModalJobId] = useState<number | null>(null);
  const [pipelineJobId, setPipelineJobId] = useState<number | null>(null);
  const [editorStates, setEditorStates] = useState<
    Record<number, JobEditorState>
  >({});
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [deletingJobId, setDeletingJobId] = useState<number | null>(null);
  const [expandedAutomationJobIds, setExpandedAutomationJobIds] = useState<
    Set<number>
  >(new Set());
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    type?: "danger" | "warning" | "info";
  }>({ isOpen: false, title: "", message: "", onConfirm: () => {} });

  const isFetchingRef = useRef(false);

  const loadJobs = useCallback(
    async (options?: { silent?: boolean }) => {
      if (isFetchingRef.current) {
        return;
      }

      isFetchingRef.current = true;

      if (!options?.silent) {
        setIsLoading(true);
      }

      try {
        const response = (await fetchPmsJobs({
          page: pagination.page,
          status: statusFilter === "all" ? undefined : [statusFilter],
          isApproved:
            approvalFilter === "all"
              ? undefined
              : approvalFilter === "approved",
          organization_id: organizationFilter === "all" ? undefined : parseInt(organizationFilter, 10),
        })) as any;

        if (response?.success && response.data) {
          const incomingJobs: PmsJob[] = response.data.jobs;

          setJobs(incomingJobs);
          setPagination({
            page: response.data.pagination.page,
            perPage: response.data.pagination.perPage,
            total: response.data.pagination.total,
            totalPages: response.data.pagination.totalPages,
            hasNextPage: response.data.pagination.hasNextPage,
          });
          setEditorStates((previous) => {
            const next: Record<number, JobEditorState> = {};

            incomingJobs.forEach((job) => {
              const existing = previous[job.id];
              if (existing && existing.isDirty) {
                next[job.id] = existing;
              } else {
                next[job.id] = {
                  draft: serializeResponse(job.response_log),
                  isDirty: false,
                  error: undefined,
                };
              }
            });

            return next;
          });
          setError(null);
          setLastUpdated(new Date());
        } else {
          const fallbackError =
            response?.error ||
            response?.errorMessage ||
            "Unable to fetch PMS jobs right now.";

          if (!options?.silent) {
            setJobs([]);
            setEditorStates({});
          }

          setError(fallbackError);
        }
      } catch (err) {
        logger.error("Failed to load PMS jobs", err);
        if (!options?.silent) {
          setJobs([]);
          setEditorStates({});
        }
        setError("An unexpected error occurred while loading PMS jobs.");
      } finally {
        if (!options?.silent) {
          setIsLoading(false);
        }
        isFetchingRef.current = false;
      }
    },
    [approvalFilter, organizationFilter, pagination.page, statusFilter]
  );

  useEffect(() => {
    loadJobs();
  }, [loadJobs]);

  // Load organizations for filter dropdown
  useEffect(() => {
    const loadOrganizations = async () => {
      try {
        const response = await fetchOrganizations();
        if (response.success && response.organizations) {
          setOrganizations(response.organizations);
        }
      } catch (err) {
        logger.error("Failed to load organizations for filter", err);
      }
    };
    loadOrganizations();
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      loadJobs({ silent: true });
    }, POLL_INTERVAL_MS);

    return () => {
      clearInterval(interval);
    };
  }, [loadJobs]);

  const handleStatusFilterChange = (value: StatusFilter) => {
    setStatusFilter(value);
    setPagination((prev) => ({ ...prev, page: 1 }));
  };

  const handleApprovalFilterChange = (value: ApprovalFilter) => {
    setApprovalFilter(value);
    setPagination((prev) => ({ ...prev, page: 1 }));
  };

  const handleOrganizationFilterChange = (value: string) => {
    setOrganizationFilter(value);
    setPagination((prev) => ({ ...prev, page: 1 }));
  };

  const goToPreviousPage = () => {
    setPagination((prev) => {
      if (prev.page <= 1) {
        return prev;
      }

      return { ...prev, page: prev.page - 1 };
    });
  };

  const goToNextPage = () => {
    setPagination((prev) => {
      if (prev.page >= prev.totalPages) {
        return prev;
      }

      return { ...prev, page: prev.page + 1 };
    });
  };

  const handleApprovalToggle = async (job: PmsJob) => {
    if (job.is_approved || approvingJobId) {
      return;
    }

    setApprovingJobId(job.id);

    try {
      const response = (await togglePmsJobApproval(job.id, true)) as any;

      if (response?.success && response.data?.job) {
        const updatedJob: PmsJob = response.data.job;
        setJobs((prev) =>
          prev.map((item) => (item.id === job.id ? updatedJob : item))
        );
        setEditorStates((prev) => {
          const next = { ...prev };
          const existing = next[job.id];
          if (existing && existing.isDirty) {
            return next;
          }
          next[job.id] = {
            draft: serializeResponse(updatedJob.response_log),
            isDirty: false,
          };
          return next;
        });
        setError(null);
      } else {
        const fallbackError =
          response?.error ||
          response?.errorMessage ||
          "Unable to approve the PMS job.";
        setError(fallbackError);
      }
    } catch (err) {
      logger.error("Failed to toggle PMS job approval", err);
      setError("Failed to approve the job. Please try again.");
    } finally {
      setApprovingJobId(null);
    }
  };

  const handleSaveResponse = async (jobId: number, updatedData?: unknown) => {
    // Use the updated data from PMSDataViewer if provided, otherwise fall back to editor state
    let payloadToSave: unknown;

    if (updatedData !== undefined) {
      // Data from PMSDataViewer - already transformed to backend format
      payloadToSave = updatedData;
    } else {
      // Fall back to editor state for backward compatibility
      const editorState = editorStates[jobId];
      if (!editorState) {
        return;
      }

      const validationError = validateJson(editorState.draft);
      if (validationError) {
        setEditorStates((prev) => ({
          ...prev,
          [jobId]: {
            ...editorState,
            error: validationError,
          },
        }));
        return;
      }

      payloadToSave = editorState.draft.trim().length
        ? editorState.draft
        : null;
    }

    setSavingResponseJobId(jobId);

    try {
      // Convert payload to JSON string if it's an object
      const payload =
        typeof payloadToSave === "string"
          ? payloadToSave
          : JSON.stringify(payloadToSave);

      const response = (await updatePmsJobResponse(
        jobId,
        payload.trim().length ? payload : null
      )) as any;

      if (response?.success && response.data?.job) {
        const updatedJob: PmsJob = response.data.job;
        setJobs((prev) =>
          prev.map((job) => (job.id === jobId ? updatedJob : job))
        );
        setEditorStates((prev) => ({
          ...prev,
          [jobId]: {
            draft: serializeResponse(updatedJob.response_log),
            isDirty: false,
            error: undefined,
          },
        }));
        setError(null);
        setLastUpdated(new Date());
      } else {
        const fallbackError =
          response?.error ||
          response?.errorMessage ||
          "Unable to update the response log.";
        setError(fallbackError);
      }
    } catch (err) {
      logger.error("Failed to update PMS job response", err);
      setError("Failed to save the response log. Please try again.");
    } finally {
      setSavingResponseJobId(null);
    }
  };

  const handleDeleteJob = (jobId: number) => {
    if (deletingJobId !== null) {
      return;
    }

    setConfirmModal({
      isOpen: true,
      title: "Delete PMS Job",
      message: "Are you sure you want to delete this PMS job? This action cannot be undone.",
      type: "danger",
      onConfirm: async () => {
        setConfirmModal(prev => ({ ...prev, isOpen: false }));

        setDeletingJobId(jobId);

        try {
          const response = (await deletePmsJob(jobId)) as any;

          if (response?.success) {
            setJobs((prev) => prev.filter((job) => job.id !== jobId));
            setEditorStates((prev) => {
              const next = { ...prev };
              delete next[jobId];
              return next;
            });

            const nextTotal = Math.max(pagination.total - 1, 0);
            const nextTotalPages = Math.max(
              Math.ceil(nextTotal / pagination.perPage),
              1
            );
            const nextPage = Math.min(pagination.page, nextTotalPages);
            const shouldRefetchImmediately = nextPage === pagination.page;

            setPagination((prev) => ({
              ...prev,
              total: nextTotal,
              totalPages: nextTotalPages,
              page: nextPage,
              hasNextPage: nextPage < nextTotalPages,
            }));

            if (shouldRefetchImmediately) {
              void loadJobs({ silent: true });
            }

            setError(null);
            setLastUpdated(new Date());
          } else {
            const fallbackError =
              response?.error ||
              response?.errorMessage ||
              "Unable to delete the PMS job.";
            setError(fallbackError);
          }
        } catch (err) {
          logger.error("Failed to delete PMS job", err);
          setError("Failed to delete the PMS job. Please try again.");
        } finally {
          setDeletingJobId(null);
        }
      },
    });
  };

  const toggleAutomationExpansion = (jobId: number) => {
    setExpandedAutomationJobIds((prev) => {
      const next = new Set(prev);
      if (next.has(jobId)) {
        next.delete(jobId);
      } else {
        next.add(jobId);
      }
      return next;
    });
  };

  const handleAutomationStatusChange = (
    jobId: number,
    status: AutomationStatusDetail | null
  ) => {
    if (status) {
      setJobs((prev) =>
        prev.map((job) =>
          job.id === jobId ? { ...job, automation_status_detail: status } : job
        )
      );
    }
  };

  const { rangeStart, rangeEnd } = useMemo(() => {
    if (jobs.length === 0) {
      return { rangeStart: 0, rangeEnd: 0 };
    }

    const start = (pagination.page - 1) * pagination.perPage + 1;
    const end = start + jobs.length - 1;
    return { rangeStart: start, rangeEnd: end };
  }, [jobs.length, pagination.page, pagination.perPage]);

  const activeModalJob = useMemo(() => {
    if (!activeModalJobId) {
      return undefined;
    }

    return jobs.find((job) => job.id === activeModalJobId);
  }, [activeModalJobId, jobs]);

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
