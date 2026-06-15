import { useState, useEffect, useMemo } from "react";
import { adminFetch } from "../../api";
import { fetchOrganizations } from "../../api/agentOutputs";
import { toast } from "react-hot-toast";
import { useConfirm } from "../../components/ui/ConfirmModal";
import { logger } from "../../lib/logger";
import { normalizeJob } from "./practiceRanking.utils";
import type {
  GoogleAccount,
  LocationFormData,
  RankingJob,
  BatchStatus,
  RankingResult,
  RankingTask,
  BatchGroup,
  MonthGroup,
} from "./practiceRanking.types";

export function usePracticeRanking() {
  const confirm = useConfirm();
  const [accounts, setAccounts] = useState<GoogleAccount[]>([]);
  const [jobs, setJobs] = useState<RankingJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAccount, setSelectedAccount] = useState<number | null>(null);
  const [selectedLocationIds, setSelectedLocationIds] = useState<Set<string>>(new Set());
  const [triggering, setTriggering] = useState(false);
  const [retryingJob, setRetryingJob] = useState<number | null>(null);
  const [retryingBatch, setRetryingBatch] = useState<string | null>(null);
  const [expandedJobId, setExpandedJobId] = useState<number | null>(null);
  const [expandedBatches, setExpandedBatches] = useState<Set<string>>(
    new Set()
  );
  const [jobResults, setJobResults] = useState<Record<number, RankingResult>>(
    {}
  );
  const [rankingTasks, setRankingTasks] = useState<
    Record<number, RankingTask[]>
  >({});
  const [loadingResults, setLoadingResults] = useState<number | null>(null);
  const [pollingJobs, setPollingJobs] = useState<Set<number>>(new Set());
  const [pollingBatches, setPollingBatches] = useState<Set<string>>(new Set());

  const [, setBatchStatuses] = useState<Record<string, BatchStatus>>({});
  const [deletingJob, setDeletingJob] = useState<number | null>(null);
  const [deletingBatch, setDeletingBatch] = useState<string | null>(null);
  const [refreshingCompetitors, setRefreshingCompetitors] = useState(false);
  const [organizations, setOrganizations] = useState<{ id: number; name: string }[]>([]);
  const [organizationFilter, setOrganizationFilter] = useState<string>("");

  // Get selected account data
  const selectedAccountData = accounts.find(
    (a) => String(a.id) === String(selectedAccount)
  );

  // Helper to get organization name by ID
  const getOrgName = (orgId: number | null | undefined): string => {
    if (!orgId) return "Unknown Organization";
    return organizations.find((o) => o.id === orgId)?.name || `Org #${orgId}`;
  };

  // Group jobs by batch - flat list sorted by date (newest first)
  const groupedBatches = useMemo((): BatchGroup[] => {
    const batchMap = new Map<string, BatchGroup>();

    jobs.forEach((job) => {
      if (job.batch_id) {
        const jobDate = new Date(job.created_at || 0);

        if (!batchMap.has(job.batch_id)) {
          batchMap.set(job.batch_id, {
            batchId: job.batch_id,
            organization_id: job.organization_id ?? null,
            organization_name: job.organization_name ?? null,
            jobs: [],
            status: "pending",
            createdAt: jobDate,
            totalLocations: 0,
            completedLocations: 0,
          });
        }

        const batch = batchMap.get(job.batch_id)!;
        batch.jobs.push(job);
        batch.totalLocations = batch.jobs.length;
        batch.completedLocations = batch.jobs.filter(
          (j) => j.status === "completed"
        ).length;

        // Use org name from the first job that has it
        if (!batch.organization_name && job.organization_name) {
          batch.organization_name = job.organization_name;
        }

        // Determine batch status
        const hasProcessing = batch.jobs.some(
          (j) => j.status === "processing" || j.status === "pending"
        );
        const hasFailed = batch.jobs.some((j) => j.status === "failed");
        const allCompleted = batch.jobs.every((j) => j.status === "completed");

        if (allCompleted) {
          batch.status = "completed";
        } else if (hasFailed) {
          batch.status = "failed";
        } else if (hasProcessing) {
          batch.status = "processing";
        } else {
          batch.status = "pending";
        }
      }
    });

    return Array.from(batchMap.values()).sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
    );
  }, [jobs]);

  // Group batches by month for card layout
  const monthGroups = useMemo((): MonthGroup[] => {
    const monthMap = new Map<string, MonthGroup>();

    groupedBatches.forEach((batch) => {
      const d = batch.createdAt;
      const sortKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = d.toLocaleDateString("en-US", { month: "long", year: "numeric" });

      if (!monthMap.has(sortKey)) {
        monthMap.set(sortKey, { label, sortKey, batches: [] });
      }
      monthMap.get(sortKey)!.batches.push(batch);
    });

    return Array.from(monthMap.values()).sort(
      (a, b) => b.sortKey.localeCompare(a.sortKey)
    );
  }, [groupedBatches]);

  // Get standalone jobs (no batch) sorted by date
  const standaloneJobs = useMemo(() => {
    return jobs
      .filter((job) => !job.batch_id)
      .sort(
        (a, b) =>
          new Date(b.created_at || 0).getTime() -
          new Date(a.created_at || 0).getTime()
      );
  }, [jobs]);

  // Toggle batch expansion
  const toggleBatch = (batchId: string) => {
    setExpandedBatches((prev) => {
      const next = new Set(prev);
      if (next.has(batchId)) {
        next.delete(batchId);
      } else {
        next.add(batchId);
      }
      return next;
    });
  };

  useEffect(() => {
    fetchAccounts();
    fetchOrganizations().then((res) => setOrganizations(res.organizations || [])).catch(() => {});
  }, []);

  // Re-fetch jobs when organization filter changes
  useEffect(() => {
    fetchJobs();
  }, [organizationFilter]);

  // When account is selected, select all locations by default
  useEffect(() => {
    if (selectedAccountData && selectedAccountData.gbpLocations.length > 0) {
      setSelectedLocationIds(
        new Set(selectedAccountData.gbpLocations.map((loc) => loc.locationId))
      );
    } else {
      setSelectedLocationIds(new Set());
    }
  }, [selectedAccount, selectedAccountData]);

  // Derive location forms from selected IDs
  const locationForms: LocationFormData[] = useMemo(() => {
    if (!selectedAccountData) return [];
    return selectedAccountData.gbpLocations
      .filter((loc) => selectedLocationIds.has(loc.locationId))
      .map((loc) => ({
        gbpAccountId: loc.accountId,
        gbpLocationId: loc.locationId,
        gbpLocationName: loc.displayName,
      }));
  }, [selectedAccountData, selectedLocationIds]);

  // Poll for job status updates
  useEffect(() => {
    if (pollingJobs.size === 0 && pollingBatches.size === 0) return;

    const interval = setInterval(() => {
      pollingJobs.forEach((jobId) => {
        fetchJobStatus(jobId);
      });
      pollingBatches.forEach((batchId) => {
        fetchBatchStatus(batchId);
      });
    }, 2000);

    return () => clearInterval(interval);
  }, [pollingJobs, pollingBatches]);

  const fetchAccounts = async () => {
    try {
      const response = await adminFetch("/api/admin/practice-ranking/accounts");

      if (!response.ok) throw new Error("Failed to fetch accounts");

      const data = await response.json();
      setAccounts(data.accounts);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "An error occurred");
    }
  };

  const fetchJobs = async () => {
    try {
      const params = new URLSearchParams();
      if (organizationFilter) {
        params.set("organization_id", organizationFilter);
      }
      const url = `/api/admin/practice-ranking/list${params.toString() ? `?${params.toString()}` : ""}`;
      const response = await adminFetch(url);

      if (!response.ok) throw new Error("Failed to fetch jobs");

      const data = await response.json();
      setJobs(data.rankings.map(normalizeJob));

      // Start polling for any in-progress jobs
      const inProgress = data.rankings
        .filter(
          (j: RankingJob) =>
            j.status === "processing" || j.status === "pending"
        )
        .map((j: RankingJob) => j.id);
      setPollingJobs(new Set(inProgress));

      // Collect unique batch IDs that are still in progress
      const inProgressBatches = new Set<string>();
      data.rankings.forEach((j: RankingJob) => {
        const batchId = j.batchId || j.batch_id;
        if (batchId && (j.status === "processing" || j.status === "pending")) {
          inProgressBatches.add(batchId);
        }
      });
      setPollingBatches(inProgressBatches);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  const fetchJobStatus = async (jobId: number) => {
    try {
      const response = await adminFetch(
        `/api/admin/practice-ranking/status/${jobId}`,
      );

      if (!response.ok) return;

      const data = await response.json();

      const statusUpdate: Partial<RankingJob> = {
        status: data.status,
        status_detail: data.statusDetail,
        rank_score: data.rankScore,
        rank_position: data.rankPosition,
        total_competitors: data.totalCompetitors,
        gbp_location_id: data.gbpLocationId,
        gbp_location_name: data.gbpLocationName,
        batch_id: data.batchId,
      };

      setJobs((prev) =>
        prev.map((j) => (j.id === jobId ? { ...j, ...statusUpdate } : j))
      );

      if (data.status === "completed" || data.status === "failed") {
        setPollingJobs((prev) => {
          const next = new Set(prev);
          next.delete(jobId);
          return next;
        });
        fetchJobs();
      }
    } catch (error) {
      logger.error("Failed to fetch job status:", error);
    }
  };

  const fetchBatchStatus = async (batchId: string) => {
    try {
      const response = await adminFetch(
        `/api/admin/practice-ranking/batch/${batchId}/status`,
      );

      if (!response.ok) return;

      const data = await response.json();
      setBatchStatuses((prev) => ({
        ...prev,
        [batchId]: data as BatchStatus,
      }));

      if (data.status === "completed" || data.status === "failed") {
        setPollingBatches((prev) => {
          const next = new Set(prev);
          next.delete(batchId);
          return next;
        });
        fetchJobs();
      }
    } catch (error) {
      logger.error("Failed to fetch batch status:", error);
    }
  };

  const fetchJobResults = async (jobId: number) => {
    if (jobResults[jobId]) return;

    setLoadingResults(jobId);
    try {
      const response = await adminFetch(
        `/api/admin/practice-ranking/results/${jobId}`,
      );

      if (!response.ok) throw new Error("Failed to fetch results");

      const data = await response.json();
      setJobResults((prev) => ({ ...prev, [jobId]: data.ranking }));

      fetchRankingTasks(jobId);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "An error occurred");
    } finally {
      setLoadingResults(null);
    }
  };

  const fetchRankingTasks = async (practiceRankingId: number) => {
    try {
      const response = await adminFetch(
        `/api/practice-ranking/tasks?practiceRankingId=${practiceRankingId}`,
      );

      if (!response.ok) {
        logger.error("Failed to fetch ranking tasks");
        return;
      }

      const data = await response.json();
      setRankingTasks((prev) => ({ ...prev, [practiceRankingId]: data.tasks }));
    } catch (error) {
      logger.error("Error fetching ranking tasks:", error);
    }
  };

  const triggerAnalysis = async () => {
    if (!selectedAccount || locationForms.length === 0) {
      toast.error("Please select an account");
      return;
    }

    setTriggering(true);
    try {
      const response = await adminFetch("/api/admin/practice-ranking/trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          googleAccountId: selectedAccount,
          locations: locationForms.map((form) => ({
            gbpAccountId: form.gbpAccountId,
            gbpLocationId: form.gbpLocationId,
            gbpLocationName: form.gbpLocationName,
          })),
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(
          error.message || error.error || "Failed to trigger analysis"
        );
      }

      const data = await response.json();
      toast.success(
        `Batch analysis started for ${data.totalLocations} location(s)!`
      );

      if (data.batchId) {
        setPollingBatches((prev) => new Set([...prev, data.batchId]));
      }

      fetchJobs();
      setSelectedAccount(null);
      setSelectedLocationIds(new Set());
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "An error occurred");
    } finally {
      setTriggering(false);
    }
  };

  const toggleExpand = (jobId: number) => {
    if (expandedJobId === jobId) {
      setExpandedJobId(null);
    } else {
      setExpandedJobId(jobId);
      const job = jobs.find((j) => j.id === jobId);
      if (job?.status === "completed") {
        fetchJobResults(jobId);
      }
    }
  };

  const deleteJob = async (jobId: number, e: React.MouseEvent) => {
    e.stopPropagation();

    const ok = await confirm({ title: "Delete this analysis?", message: "This action cannot be undone.", confirmLabel: "Delete", variant: "danger" });
    if (!ok) return;

    setDeletingJob(jobId);
    try {
      const response = await adminFetch(`/api/admin/practice-ranking/${jobId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to delete analysis");
      }

      toast.success("Analysis deleted successfully");

      setJobs((prev) => prev.filter((j) => j.id !== jobId));

      if (expandedJobId === jobId) {
        setExpandedJobId(null);
      }
      if (jobResults[jobId]) {
        setJobResults((prev) => {
          const next = { ...prev };
          delete next[jobId];
          return next;
        });
      }
      setPollingJobs((prev) => {
        const next = new Set(prev);
        next.delete(jobId);
        return next;
      });
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "An error occurred");
    } finally {
      setDeletingJob(null);
    }
  };

  const deleteBatch = async (batchId: string, e: React.MouseEvent) => {
    e.stopPropagation();

    const batch = groupedBatches.find((b) => b.batchId === batchId);
    const locationCount = batch?.totalLocations || 0;

    const ok = await confirm({ title: "Delete entire batch?", message: `This will delete ${locationCount} analysis record${locationCount !== 1 ? "s" : ""}. This action cannot be undone.`, confirmLabel: "Delete", variant: "danger" });
    if (!ok) return;

    setDeletingBatch(batchId);
    try {
      const response = await adminFetch(
        `/api/admin/practice-ranking/batch/${batchId}`,
        {
          method: "DELETE",
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to delete batch");
      }

      const data = await response.json();
      toast.success(`Batch deleted (${data.deletedCount} analyses removed)`);

      setJobs((prev) => prev.filter((j) => j.batch_id !== batchId));

      setExpandedBatches((prev) => {
        const next = new Set(prev);
        next.delete(batchId);
        return next;
      });
      setPollingBatches((prev) => {
        const next = new Set(prev);
        next.delete(batchId);
        return next;
      });
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "An error occurred");
    } finally {
      setDeletingBatch(null);
    }
  };

  const retryJob = async (rankingId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setRetryingJob(rankingId);
    try {
      const response = await adminFetch(
        `/api/admin/practice-ranking/retry/${rankingId}`,
        {
          method: "POST",
        }
      );
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to retry");
      }
      toast.success("Retry queued");
      setPollingJobs((prev) => new Set([...prev, rankingId]));
      fetchJobs();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "An error occurred");
    } finally {
      setRetryingJob(null);
    }
  };

  const retryBatchFn = async (batchId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setRetryingBatch(batchId);
    try {
      const response = await adminFetch(
        `/api/admin/practice-ranking/retry-batch/${batchId}`,
        {
          method: "POST",
        }
      );
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to retry batch");
      }
      const data = await response.json();
      toast.success(data.message || "Batch retry queued");
      setPollingBatches((prev) => new Set([...prev, batchId]));
      fetchJobs();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "An error occurred");
    } finally {
      setRetryingBatch(null);
    }
  };

  const refreshCompetitors = async (specialty: string, location: string) => {
    setRefreshingCompetitors(true);
    try {
      const response = await adminFetch(
        "/api/admin/practice-ranking/refresh-competitors",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ specialty, location }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to refresh competitors");
      }

      const data = await response.json();
      toast.success(data.message);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "An error occurred");
    } finally {
      setRefreshingCompetitors(false);
    }
  };

  // Calculate summary stats
  const completedJobs = jobs.filter((j) => j.status === "completed");
  const processingJobs = jobs.filter(
    (j) => j.status === "processing" || j.status === "pending"
  );
  const avgScore =
    completedJobs.length > 0
      ? completedJobs.reduce((sum, j) => sum + (j.rank_score ?? 0), 0) /
        completedJobs.length
      : 0;

  return {
    accounts,
    jobs,
    loading,
    selectedAccount,
    setSelectedAccount,
    selectedLocationIds,
    setSelectedLocationIds,
    triggering,
    retryingJob,
    retryingBatch,
    expandedJobId,
    expandedBatches,
    jobResults,
    rankingTasks,
    loadingResults,
    deletingJob,
    deletingBatch,
    refreshingCompetitors,
    organizations,
    organizationFilter,
    setOrganizationFilter,
    selectedAccountData,
    getOrgName,
    groupedBatches,
    monthGroups,
    standaloneJobs,
    toggleBatch,
    locationForms,
    fetchJobs,
    triggerAnalysis,
    toggleExpand,
    deleteJob,
    deleteBatch,
    retryJob,
    retryBatchFn,
    refreshCompetitors,
    completedJobs,
    processingJobs,
    avgScore,
  };
}
