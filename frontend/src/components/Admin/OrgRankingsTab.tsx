import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  RefreshCw,
  Trophy,
  MapPin,
  ChevronRight,
  CheckCircle,
  XCircle,
  Clock,
  Loader2,
  Star,
  Users,
  Layers,
  Trash2,
} from "lucide-react";
import { toast } from "react-hot-toast";
import {
  Badge,
  HorizontalProgressBar,
} from "../ui/DesignSystem";
import {
  expandCollapse,
  chevronVariants,
} from "../../lib/animations";
import { useConfirm } from "../ui/ConfirmModal";
import {
  useAdminOrgRankings,
  useInvalidateAdminOrgRankings,
} from "../../hooks/queries/useAdminOrgTabQueries";
import { adminFetch } from "../../api";

interface OrgRankingsTabProps {
  organizationId: number;
  locationId: number | null;
}

interface RankingJob {
  id: number;
  organization_id?: number;
  location_id?: number | null;
  location_name?: string | null;
  specialty: string;
  location: string | null;
  gbp_location_id?: string | null;
  gbp_location_name?: string | null;
  batch_id?: string | null;
  status: string;
  rank_score?: number | null;
  rank_position?: number | null;
  total_competitors?: number | null;
  created_at?: string;
  status_detail?: {
    currentStep: string;
    message: string;
    progress: number;
  } | null;
}

interface RankingResult {
  id: number;
  specialty: string;
  location: string | null;
  gbpLocationName?: string | null;
  rankScore: number | string;
  rankPosition: number;
  totalCompetitors: number;
  rankingFactors: Record<
    string,
    { score: number; weighted: number; weight: number; value?: number }
  > | null;
  rawData: {
    client_gbp: {
      totalReviewCount?: number;
      averageRating?: number;
      primaryCategory?: string;
    } | null;
    competitors: Array<{
      name: string;
      rankScore: number;
      rankPosition: number;
      totalReviews: number;
      averageRating: number;
    }>;
  } | null;
  llmAnalysis: {
    client_summary?: string | null;
    verdict: string;
  } | null;
}

interface BatchGroup {
  batchId: string;
  jobs: RankingJob[];
  status: "processing" | "completed" | "failed" | "pending";
  createdAt: Date;
  totalLocations: number;
  completedLocations: number;
}

export function OrgRankingsTab({
  organizationId,
  locationId,
}: OrgRankingsTabProps) {
  const [expandedBatches, setExpandedBatches] = useState<Set<string>>(
    new Set()
  );
  const [expandedJobId, setExpandedJobId] = useState<number | null>(null);
  const [jobResults, setJobResults] = useState<Record<number, RankingResult>>(
    {}
  );
  const [loadingResults, setLoadingResults] = useState<number | null>(null);
  const [deletingJob, setDeletingJob] = useState<number | null>(null);

  const confirm = useConfirm();

  // TanStack Query — replaces useEffect + useState
  const { data: jobs = [], isLoading: loading } = useAdminOrgRankings(
    organizationId,
    locationId,
  );
  const { invalidateForOrg } = useInvalidateAdminOrgRankings();

  const groupedBatches = useMemo((): BatchGroup[] => {
    const batchMap = new Map<string, BatchGroup>();

    jobs.forEach((job) => {
      if (job.batch_id) {
        const jobDate = new Date(job.created_at || 0);

        if (!batchMap.has(job.batch_id)) {
          batchMap.set(job.batch_id, {
            batchId: job.batch_id,
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

        const hasProcessing = batch.jobs.some(
          (j) => j.status === "processing" || j.status === "pending"
        );
        const hasFailed = batch.jobs.some((j) => j.status === "failed");
        const allCompleted = batch.jobs.every(
          (j) => j.status === "completed"
        );

        if (allCompleted) batch.status = "completed";
        else if (hasFailed) batch.status = "failed";
        else if (hasProcessing) batch.status = "processing";
        else batch.status = "pending";
      }
    });

    return Array.from(batchMap.values()).sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
    );
  }, [jobs]);

  const standaloneJobs = useMemo(() => {
    return jobs
      .filter((job) => !job.batch_id)
      .sort(
        (a, b) =>
          new Date(b.created_at || 0).getTime() -
          new Date(a.created_at || 0).getTime()
      );
  }, [jobs]);

  const toggleBatch = (batchId: string) => {
    setExpandedBatches((prev) => {
      const next = new Set(prev);
      if (next.has(batchId)) next.delete(batchId);
      else next.add(batchId);
      return next;
    });
  };

  const toggleExpand = (jobId: number) => {
    if (expandedJobId === jobId) {
      setExpandedJobId(null);
    } else {
      setExpandedJobId(jobId);
      const job = jobs.find((j) => j.id === jobId);
      if (job?.status === "completed" && !jobResults[jobId]) {
        fetchJobResults(jobId);
      }
    }
  };

  const fetchJobResults = async (jobId: number) => {
    setLoadingResults(jobId);
    try {
      const response = await adminFetch(
        `/api/admin/practice-ranking/results/${jobId}`,
      );
      if (!response.ok) throw new Error("Failed to fetch results");
      const data = await response.json();
      setJobResults((prev) => ({ ...prev, [jobId]: data.ranking }));
    } catch {
      toast.error("Failed to load ranking results");
    } finally {
      setLoadingResults(null);
    }
  };

  const deleteJob = async (jobId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    const ok = await confirm({ title: "Delete this ranking analysis?", confirmLabel: "Delete", variant: "danger" });
    if (!ok) return;

    setDeletingJob(jobId);
    try {
      const response = await adminFetch(`/api/admin/practice-ranking/${jobId}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("Failed to delete");
      toast.success("Analysis deleted");
      invalidateForOrg(organizationId);
      if (expandedJobId === jobId) setExpandedJobId(null);
    } catch {
      toast.error("Failed to delete analysis");
    } finally {
      setDeletingJob(null);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return (
          <Badge variant="success">
            <CheckCircle className="h-3 w-3 mr-1" />
            Completed
          </Badge>
        );
      case "failed":
        return (
          <Badge variant="danger">
            <XCircle className="h-3 w-3 mr-1" />
            Failed
          </Badge>
        );
      case "processing":
        return (
          <Badge variant="info">
            <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
            Processing
          </Badge>
        );
      default:
        return (
          <Badge variant="default">
            <Clock className="h-3 w-3 mr-1" />
            Pending
          </Badge>
        );
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-green-600";
    if (score >= 60) return "text-yellow-600";
    return "text-red-600";
  };

  const getWeekLabel = (date: Date): string => {
    const ordinals = ["1st", "2nd", "3rd", "4th", "5th"];
    const week = Math.ceil(date.getDate() / 7);
    const month = date.toLocaleDateString("en-US", { month: "long" });
    return `${month} ${ordinals[week - 1]} Week`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-gray-500">
        <RefreshCw className="h-5 w-5 animate-spin mr-2" />
        Loading rankings...
      </div>
    );
  }

  if (jobs.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        <Trophy className="h-8 w-8 mx-auto mb-2 text-gray-300" />
        <p>No practice rankings found</p>
      </div>
    );
  }

  // Summary stats
  const completedJobs = jobs.filter((j) => j.status === "completed");
  const avgScore =
    completedJobs.length > 0
      ? completedJobs.reduce(
          (sum, j) => sum + (j.rank_score ?? 0),
          0
        ) / completedJobs.length
      : 0;

  return (
    <div className="space-y-6">
      {/* Key Metrics */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="grid grid-cols-1 sm:grid-cols-3 gap-4"
      >
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wider font-medium mb-1">
            Total Rankings
          </p>
          <p className="text-2xl font-bold text-gray-900">{jobs.length}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wider font-medium mb-1">
            Completed
          </p>
          <p className="text-2xl font-bold text-green-600">
            {completedJobs.length}
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wider font-medium mb-1">
            <Trophy className="h-3 w-3 inline mr-1" />
            Avg Score
          </p>
          <p className="text-2xl font-bold text-gray-900">
            {avgScore > 0 ? avgScore.toFixed(1) : "—"}
          </p>
        </div>
      </motion.div>

      {/* Batch List */}
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <div className="divide-y divide-gray-100">
          {groupedBatches.map((batch) => (
            <div key={batch.batchId}>
              <motion.div
                className="flex cursor-pointer items-center gap-4 px-6 py-4 hover:bg-gray-50 transition-colors"
                onClick={() => toggleBatch(batch.batchId)}
                whileHover={{ backgroundColor: "rgba(0,0,0,0.02)" }}
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-purple-100 text-purple-600">
                  <Layers className="h-4 w-4" />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-900 text-sm">
                    {getWeekLabel(batch.createdAt)}
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    {batch.createdAt.toLocaleDateString("en-US", {
                      month: "2-digit",
                      day: "2-digit",
                      year: "numeric",
                    })}{" "}
                    • {batch.totalLocations} location
                    {batch.totalLocations !== 1 ? "s" : ""}
                    {batch.status === "processing" && (
                      <span className="ml-2 text-blue-600">
                        <RefreshCw className="h-3 w-3 inline animate-spin mr-1" />
                        {batch.completedLocations}/{batch.totalLocations}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {getStatusBadge(batch.status)}
                  <motion.div
                    variants={chevronVariants}
                    animate={
                      expandedBatches.has(batch.batchId) ? "open" : "closed"
                    }
                    className="text-gray-400"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </motion.div>
                </div>
              </motion.div>

              <AnimatePresence>
                {expandedBatches.has(batch.batchId) && (
                  <motion.div
                    className="bg-gray-50/50 border-t border-gray-100"
                    variants={expandCollapse}
                    initial="collapsed"
                    animate="expanded"
                    exit="collapsed"
                  >
                    {batch.jobs.map((job) => (
                      <RankingJobRow
                        key={job.id}
                        job={job}
                        isExpanded={expandedJobId === job.id}
                        onToggle={() => toggleExpand(job.id)}
                        onDelete={(e) => deleteJob(job.id, e)}
                        deletingJob={deletingJob}
                        loadingResults={loadingResults}
                        result={jobResults[job.id]}
                        getStatusBadge={getStatusBadge}
                        getScoreColor={getScoreColor}
                      />
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}

          {standaloneJobs.map((job) => (
            <RankingJobRow
              key={job.id}
              job={job}
              isExpanded={expandedJobId === job.id}
              onToggle={() => toggleExpand(job.id)}
              onDelete={(e) => deleteJob(job.id, e)}
              deletingJob={deletingJob}
              loadingResults={loadingResults}
              result={jobResults[job.id]}
              getStatusBadge={getStatusBadge}
              getScoreColor={getScoreColor}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function RankingJobRow({
  job,
  isExpanded,
  onToggle,
  onDelete,
  deletingJob,
  loadingResults,
  result,
  getStatusBadge,
  getScoreColor,
}: {
  job: RankingJob;
  isExpanded: boolean;
  onToggle: () => void;
  onDelete: (e: React.MouseEvent) => void;
  deletingJob: number | null;
  loadingResults: number | null;
  result?: RankingResult;
  getStatusBadge: (status: string) => React.ReactNode;
  getScoreColor: (score: number) => string;
}) {
  return (
    <div className="transition-colors hover:bg-gray-50/80">
      <motion.div
        className="flex cursor-pointer items-center gap-4 p-3 pl-12 pr-6"
        onClick={onToggle}
        whileHover={{ backgroundColor: "rgba(0,0,0,0.02)" }}
      >
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-green-100 text-green-600">
          <MapPin className="h-4 w-4" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="font-medium text-gray-900 text-sm">
              {job.gbp_location_name || job.specialty}
            </h4>
            <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600">
              {job.specialty}
            </span>
            {(job.location_name || job.location) && (
              <span className="flex items-center gap-1 text-xs text-gray-500">
                <MapPin className="h-3 w-3" />
                {job.location_name || job.location}
              </span>
            )}
          </div>
          {(job.status === "processing" || job.status === "pending") &&
            job.status_detail && (
              <div className="mt-2">
                <HorizontalProgressBar
                  value={job.status_detail.progress ?? 0}
                  height={4}
                />
                {job.status_detail.message && (
                  <span className="text-xs text-gray-500 mt-1 block truncate">
                    {job.status_detail.message}
                  </span>
                )}
              </div>
            )}
        </div>

        <div className="flex items-center gap-3">
          {job.status === "completed" && job.rank_score != null && (
            <div className="text-right">
              <div
                className={`text-xl font-bold ${getScoreColor(
                  Number(job.rank_score)
                )}`}
              >
                {Number(job.rank_score).toFixed(1)}
              </div>
              <div className="text-xs text-gray-500">
                #{job.rank_position ?? "-"} of {job.total_competitors ?? "-"}
              </div>
            </div>
          )}
          {getStatusBadge(job.status)}
          <motion.button
            onClick={onDelete}
            disabled={deletingJob === job.id}
            className="p-1.5 text-gray-400 hover:text-red-600 transition-colors disabled:opacity-50 rounded-lg hover:bg-red-50"
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
          >
            {deletingJob === job.id ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
          </motion.button>
          <motion.div
            variants={chevronVariants}
            animate={isExpanded ? "open" : "closed"}
            className="text-gray-400"
          >
            <ChevronRight className="h-4 w-4" />
          </motion.div>
        </div>
      </motion.div>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            className="border-t border-gray-100 bg-gray-50/50 p-6 pl-12"
            variants={expandCollapse}
            initial="collapsed"
            animate="expanded"
            exit="collapsed"
          >
            {job.status === "completed" ? (
              loadingResults === job.id ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 text-blue-600 animate-spin" />
                </div>
              ) : result ? (
                <CompactResultView result={result} getScoreColor={getScoreColor} />
              ) : (
                <div className="text-center text-gray-500">
                  Failed to load results
                </div>
              )
            ) : job.status === "failed" ? (
              <div className="flex items-center gap-3 rounded-xl bg-red-50 border border-red-200 p-4 text-red-700 text-sm">
                <XCircle className="h-5 w-5" />
                Analysis failed. Please try again.
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <Loader2 className="h-5 w-5 text-blue-600 animate-spin" />
                <span className="text-gray-600 text-sm">
                  {job.status_detail?.message || "Processing..."}
                </span>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function CompactResultView({
  result,
  getScoreColor,
}: {
  result: RankingResult;
  getScoreColor: (score: number) => string;
}) {
  const factors = result.rankingFactors;

  return (
    <div className="space-y-4">
      {/* Summary */}
      {result.llmAnalysis?.client_summary && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
          <p className="text-sm text-blue-800">
            {result.llmAnalysis.client_summary}
          </p>
        </div>
      )}

      {/* Score Grid */}
      <div className="grid gap-3 grid-cols-4">
        <div className="rounded-xl border border-gray-200 bg-white p-3 text-center">
          <div
            className={`text-2xl font-bold ${getScoreColor(
              Number(result.rankScore)
            )}`}
          >
            {Number(result.rankScore).toFixed(1)}
          </div>
          <div className="text-xs text-gray-500 mt-1">Score</div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-3 text-center">
          <div className="text-2xl font-bold text-gray-900">
            #{result.rankPosition}
          </div>
          <div className="text-xs text-gray-500 mt-1">
            of {result.totalCompetitors}
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-3 text-center">
          <div className="text-2xl font-bold text-gray-900 flex items-center justify-center gap-1">
            {result.rawData?.client_gbp?.totalReviewCount || 0}
          </div>
          <div className="text-xs text-gray-500 mt-1">Reviews</div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-3 text-center">
          <div className="text-2xl font-bold text-gray-900 flex items-center justify-center gap-1">
            {(
              factors?.star_rating?.value ??
              result.rawData?.client_gbp?.averageRating ??
              0
            ).toFixed(1)}
            <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
          </div>
          <div className="text-xs text-gray-500 mt-1">Rating</div>
        </div>
      </div>

      {/* Ranking Factors */}
      {factors && (
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <h4 className="text-sm font-semibold text-gray-900 mb-3">
            Ranking Factors
          </h4>
          <div className="space-y-2">
            {Object.entries(factors).map(([key, value]) => (
              <div key={key} className="flex items-center gap-3">
                <div className="w-32 text-xs text-gray-600 capitalize">
                  {key.replace(/_/g, " ")}
                </div>
                <div className="flex-1">
                  <HorizontalProgressBar
                    value={(value?.score ?? 0) * 100}
                    height={6}
                  />
                </div>
                <div className="w-12 text-right text-xs font-medium text-gray-900">
                  {((value?.score ?? 0) * 100).toFixed(0)}%
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top Competitors */}
      {result.rawData?.competitors && result.rawData.competitors.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <h4 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <Users className="h-4 w-4 text-blue-600" />
            Top Competitors
          </h4>
          <div className="space-y-2">
            {result.rawData.competitors.slice(0, 5).map((comp, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between text-sm"
              >
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400 w-6">
                    #{comp.rankPosition}
                  </span>
                  <span className="text-gray-900">{comp.name}</span>
                </div>
                <div className="flex items-center gap-4 text-xs text-gray-500">
                  <span>{comp.totalReviews} reviews</span>
                  <span
                    className={`font-medium ${getScoreColor(comp.rankScore)}`}
                  >
                    {comp.rankScore.toFixed(1)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
