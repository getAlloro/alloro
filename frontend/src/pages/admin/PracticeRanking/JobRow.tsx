import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  RefreshCw,
  MapPin,
  AlertCircle,
  ChevronRight,
  Trash2,
  Loader2,
} from "lucide-react";
import {
  Badge,
  HorizontalProgressBar,
} from "../../../components/ui/DesignSystem";
import {
  expandCollapse,
  chevronVariants,
} from "../../../lib/animations";
import type {
  RankingJob,
  RankingResult,
} from "../practiceRanking.types";
import { RankingResultsView } from "./RankingResultsView";

// Job Row Component for displaying individual ranking jobs
export function JobRow({
  job,
  isExpanded,
  onToggle,
  onDelete,
  onRetry,
  deletingJob,
  retryingJob,
  loadingResults,
  jobResults,
  refreshingCompetitors,
  onRefreshCompetitors,
  getStatusBadge,
  getScoreColor,
  indentLevel = 0,
}: {
  job: RankingJob;
  isExpanded: boolean;
  onToggle: () => void;
  onDelete: (e: React.MouseEvent) => void;
  onRetry: (e: React.MouseEvent) => void;
  deletingJob: number | null;
  retryingJob: number | null;
  loadingResults: number | null;
  jobResults: Record<number, RankingResult>;
  refreshingCompetitors: boolean;
  onRefreshCompetitors: () => void;
  getStatusBadge: (status: string) => React.ReactNode;
  getScoreColor: (score: number) => string;
  indentLevel?: number;
}) {
  const paddingLeft =
    indentLevel === 2 ? "pl-20" : indentLevel === 1 ? "pl-12" : "pl-6";

  return (
    <div className="transition-colors hover:bg-gray-50/80">
      {/* Job Header */}
      <motion.div
        className={`flex cursor-pointer items-center gap-4 p-3 pr-6 ${paddingLeft}`}
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
            <Badge variant="default">{job.specialty}</Badge>
            {(job.location_name || job.location) && (
              <span className="flex items-center gap-1 text-xs text-gray-500">
                <MapPin className="h-3 w-3" />
                {job.location_name || job.location}
              </span>
            )}
          </div>
          {/* Progress bar for pending/processing jobs */}
          {(job.status === "processing" || job.status === "pending") && (
            <div className="mt-2">
              <HorizontalProgressBar
                value={job.status_detail?.progress ?? 0}
                height={4}
              />
              {job.status_detail?.message && (
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
          {(job.status === "failed" || job.status === "completed") && (
            <motion.button
              onClick={onRetry}
              disabled={retryingJob === job.id}
              className="p-1.5 text-gray-400 hover:text-blue-600 transition-colors disabled:opacity-50 rounded-lg hover:bg-blue-50"
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              title="Retry analysis"
            >
              {retryingJob === job.id ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
            </motion.button>
          )}
          <motion.button
            onClick={onDelete}
            disabled={deletingJob === job.id}
            className="p-1.5 text-gray-400 hover:text-red-600 transition-colors disabled:opacity-50 rounded-lg hover:bg-red-50"
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            title="Delete analysis"
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

      {/* Expanded Results */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            className={`border-t border-gray-100 bg-gray-50/50 p-6 ${paddingLeft}`}
            variants={expandCollapse}
            initial="collapsed"
            animate="expanded"
            exit="collapsed"
          >
            {job.status === "completed" ? (
              loadingResults === job.id ? (
                <div className="flex items-center justify-center py-8">
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                  >
                    <Loader2 className="h-6 w-6 text-blue-600" />
                  </motion.div>
                </div>
              ) : jobResults[job.id] ? (
                <RankingResultsView
                  result={jobResults[job.id]}
                  onRefreshCompetitors={onRefreshCompetitors}
                  refreshingCompetitors={refreshingCompetitors}
                />
              ) : (
                <div className="text-center text-gray-500">
                  Failed to load results
                </div>
              )
            ) : job.status === "failed" ? (
              <motion.div
                className="flex items-center gap-3 rounded-xl bg-red-50 border border-red-200 p-4 text-red-700"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
              >
                <AlertCircle className="h-5 w-5" />
                <span>Analysis failed. Please try again.</span>
              </motion.div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                  >
                    <Loader2 className="h-5 w-5 text-blue-600" />
                  </motion.div>
                  <span className="text-gray-600">
                    {job.status_detail?.message || "Processing..."}
                  </span>
                </div>
                {job.status_detail && (
                  <HorizontalProgressBar value={job.status_detail.progress} />
                )}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
