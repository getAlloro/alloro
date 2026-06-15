import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  fetchPmsJobs,
  deletePmsJob,
  togglePmsJobApproval,
  updatePmsJobResponse,
  type PmsJob,
  type AutomationStatusDetail,
} from "../../../api/pms";
import { fetchOrganizations } from "../../../api/agentOutputs";
import { logger } from "../../../lib/logger";
import type {
  StatusFilter,
  ApprovalFilter,
  PaginationState,
  JobEditorState,
} from "./pmsAutomationCards.types";
import {
  serializeResponse,
  validateJson,
  POLL_INTERVAL_MS,
} from "./pmsAutomationCards.utils";

export function usePmsAutomationJobs() {
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

  return {
    jobs,
    pagination,
    statusFilter,
    approvalFilter,
    organizationFilter,
    organizations,
    isLoading,
    error,
    approvingJobId,
    activeModalJobId,
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
  };
}
