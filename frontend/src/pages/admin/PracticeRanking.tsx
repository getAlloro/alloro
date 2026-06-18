import { motion, AnimatePresence } from "framer-motion";
import {
  TrendingUp,
  Play,
  RefreshCw,
  CheckCircle,
  XCircle,
  Clock,
  MapPin,
  AlertCircle,
  ChevronRight,
  Trash2,
  Layers,
  Loader2,
  BarChart3,
  Building,
  Building2,
  Target,
  Zap,
} from "lucide-react";
import {
  AdminPageHeader,
  ActionButton,
  EmptyState,
  Badge,
} from "../../components/ui/DesignSystem";
import {
  staggerContainer,
  cardVariants,
  fadeInUp,
  expandCollapse,
  chevronVariants,
} from "../../lib/animations";
import { getWeekLabel } from "./practiceRanking.utils";
import { usePracticeRanking } from "./usePracticeRanking";
import { FilterDropdown } from "./PracticeRanking/FilterDropdown";
import { JobRow } from "./PracticeRanking/JobRow";

export function PracticeRanking() {
  const {
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
  } = usePracticeRanking();

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

  const getScoreColorLocal = (score: number) => {
    if (score >= 80) return "text-green-600";
    if (score >= 60) return "text-yellow-600";
    return "text-red-600";
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <AdminPageHeader
          icon={<BarChart3 className="w-6 h-6" />}
          title="Practice Ranking"
          description="Analyze competitive positioning and track performance"
        />
        <div className="flex items-center justify-center h-64">
          <motion.div
            className="flex items-center gap-3 text-gray-500"
            animate={{ opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 1.5, repeat: Infinity }}
          >
            <Loader2 className="w-5 h-5 animate-spin" />
            Loading practice rankings...
          </motion.div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <AdminPageHeader
        icon={<BarChart3 className="w-6 h-6" />}
        title="Practice Ranking"
        description="Analyze competitive positioning and track performance"
        actionButtons={
          <ActionButton
            label="Refresh"
            icon={<RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />}
            onClick={fetchJobs}
            variant="secondary"
            disabled={loading}
          />
        }
      />

      {/* Summary Stats Bar */}
      <motion.div
        className="grid grid-cols-4 gap-4"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <div className="flex items-center gap-3 bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100">
            <BarChart3 className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-900">{jobs.length}</p>
            <p className="text-xs text-gray-500">Total Analyses</p>
          </div>
        </div>
        <div className="flex items-center gap-3 bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100">
            <CheckCircle className="w-5 h-5 text-green-600" />
          </div>
          <div>
            <p className="text-2xl font-bold text-green-600">{completedJobs.length}</p>
            <p className="text-xs text-gray-500">Completed</p>
          </div>
        </div>
        <div className="flex items-center gap-3 bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-yellow-100">
            <Loader2 className="w-5 h-5 text-yellow-600" />
          </div>
          <div>
            <p className="text-2xl font-bold text-yellow-600">{processingJobs.length}</p>
            <p className="text-xs text-gray-500">Processing</p>
          </div>
        </div>
        <div className="flex items-center gap-3 bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-100">
            <Target className="w-5 h-5 text-purple-600" />
          </div>
          <div>
            <p className="text-2xl font-bold text-purple-600">
              {avgScore > 0 ? avgScore.toFixed(1) : "—"}
            </p>
            <p className="text-xs text-gray-500">Avg Score</p>
          </div>
        </div>
      </motion.div>

      {/* Trigger New Analysis Card */}
      <motion.div
        className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm"
        variants={fadeInUp}
        initial="hidden"
        animate="visible"
      >
        <h3 className="mb-4 flex items-center gap-3 text-base font-semibold text-gray-900">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-lg shadow-blue-500/30">
            <Zap className="h-5 w-5" />
          </div>
          <div>
            <span>Run New Analysis</span>
            <p className="text-sm font-normal text-gray-500 mt-0.5">
              Select a practice to analyze their competitive ranking
            </p>
          </div>
        </h3>

        {/* Account Selector - Animated Dropdown */}
        <div className="mb-4 max-w-lg">
          <FilterDropdown
            value={selectedAccount?.toString() || ""}
            onChange={(value) =>
              setSelectedAccount(value ? Number(value) : null)
            }
            label="Google Account"
            icon={<Building className="w-4 h-4" />}
            placeholder="Select an account to analyze..."
            options={[
              { value: "", label: "Select account...", subtitle: "" },
              ...accounts.map((account) => ({
                value: account.id.toString(),
                label: account.practiceName,
                subtitle: `${account.domain} • ${account.gbpCount} location(s)`,
              })),
            ]}
          />
          {selectedAccountData && (
            <div className="mt-3 flex items-center gap-2">
              {selectedAccountData.hasGbp && (
                <Badge variant="success">
                  <MapPin className="w-3 h-3 mr-1" />
                  {selectedAccountData.gbpCount} GBP Location{selectedAccountData.gbpCount !== 1 ? "s" : ""}
                </Badge>
              )}
            </div>
          )}
        </div>

        {/* Location Selection */}
        <AnimatePresence>
          {selectedAccountData && selectedAccountData.gbpLocations.length > 0 && (
            <motion.div
              className="space-y-4"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
                  <Layers className="h-4 w-4 text-blue-600" />
                  Select Locations ({selectedLocationIds.size} of{" "}
                  {selectedAccountData.gbpLocations.length})
                </div>
                <button
                  onClick={() => {
                    if (selectedLocationIds.size === selectedAccountData.gbpLocations.length) {
                      setSelectedLocationIds(new Set());
                    } else {
                      setSelectedLocationIds(
                        new Set(selectedAccountData.gbpLocations.map((loc) => loc.locationId))
                      );
                    }
                  }}
                  className="text-xs font-medium text-blue-600 hover:text-blue-800 transition-colors"
                >
                  {selectedLocationIds.size === selectedAccountData.gbpLocations.length
                    ? "Deselect All"
                    : "Select All"}
                </button>
              </div>

              <motion.div
                className="space-y-2"
                variants={staggerContainer}
                initial="hidden"
                animate="visible"
              >
                {selectedAccountData.gbpLocations.map((loc) => {
                  const isSelected = selectedLocationIds.has(loc.locationId);
                  return (
                    <motion.label
                      key={loc.locationId}
                      variants={cardVariants}
                      className={`flex items-center gap-3 rounded-xl border p-3 cursor-pointer transition-colors ${
                        isSelected
                          ? "border-blue-200 bg-blue-50/50"
                          : "border-gray-200 bg-gray-50 opacity-60"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => {
                          setSelectedLocationIds((prev) => {
                            const next = new Set(prev);
                            if (next.has(loc.locationId)) {
                              next.delete(loc.locationId);
                            } else {
                              next.add(loc.locationId);
                            }
                            return next;
                          });
                        }}
                        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <MapPin className="h-4 w-4 text-gray-400 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium text-gray-900 truncate block">
                          {loc.displayName}
                        </span>
                        {loc.address && (
                          <span className="text-xs text-gray-500 truncate block">
                            {loc.address}
                          </span>
                        )}
                      </div>
                    </motion.label>
                  );
                })}
              </motion.div>

              {/* Trigger Button */}
              <div className="pt-2">
                <ActionButton
                  label={
                    triggering
                      ? "Starting Batch..."
                      : `Run Analysis (${locationForms.length}${
                          locationForms.length !== selectedAccountData.gbpLocations.length
                            ? ` of ${selectedAccountData.gbpLocations.length}`
                            : ""
                        } location${locationForms.length !== 1 ? "s" : ""})`
                  }
                  icon={
                    triggering ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Play className="w-4 h-4" />
                    )
                  }
                  onClick={triggerAnalysis}
                  variant="primary"
                  disabled={triggering || locationForms.length === 0}
                  loading={triggering}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {selectedAccount && selectedAccountData && selectedAccountData.gbpLocations.length === 0 && (
          <motion.div
            className="rounded-xl border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800 flex items-start gap-3"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <AlertCircle className="h-5 w-5 flex-shrink-0" />
            <span>
              This account has no GBP locations configured. Please set up GBP
              locations first.
            </span>
          </motion.div>
        )}
      </motion.div>

      {/* Jobs List - Grouped by Month */}
      <motion.div
        className="space-y-6"
        variants={fadeInUp}
        initial="hidden"
        animate="visible"
        transition={{ delay: 0.1 }}
      >
        {/* Header Bar */}
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-gray-900 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-alloro-orange" />
              Analysis History
            </h3>
            <p className="text-xs text-gray-500 mt-1">
              {groupedBatches.length} batch
              {groupedBatches.length !== 1 ? "es" : ""} • {jobs.length} total
              analyses
            </p>
          </div>
          <div className="flex items-center gap-4">
            {/* Organization Filter */}
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-gray-400" />
              <select
                value={organizationFilter}
                onChange={(e) => setOrganizationFilter(e.target.value)}
                className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white text-gray-700 focus:ring-2 focus:ring-alloro-orange/20 focus:border-alloro-orange"
              >
                <option value="">All Organizations</option>
                {organizations.map((org) => (
                  <option key={org.id} value={String(org.id)}>
                    {org.name}
                  </option>
                ))}
              </select>
            </div>
            {/* Legend */}
            <div className="flex items-center gap-4 text-xs text-gray-500">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-green-500" />
              <span>Completed</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-blue-500" />
              <span>Processing</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-red-500" />
              <span>Failed</span>
            </div>
            </div>
          </div>
        </div>

        {jobs.length === 0 ? (
          <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
            <EmptyState
              icon={<TrendingUp className="w-12 h-12" />}
              title="No analyses yet"
              description="Run your first practice ranking analysis above"
            />
          </div>
        ) : (
          <>
            {/* Month Cards */}
            {monthGroups.map((month) => (
              <motion.div
                key={month.sortKey}
                className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
              >
                {/* Month Header */}
                <div className="border-b border-gray-100 px-6 py-4 bg-gray-50/50">
                  <h4 className="text-sm font-semibold text-gray-900">
                    {month.label}
                  </h4>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {month.batches.length} batch{month.batches.length !== 1 ? "es" : ""} •{" "}
                    {month.batches.reduce((sum, b) => sum + b.totalLocations, 0)} analyses
                  </p>
                </div>

                <div className="divide-y divide-gray-100">
                  {month.batches.map((batch) => (
                    <div key={batch.batchId} className="bg-white">
                      {/* Batch Header */}
                      <motion.div
                        className="flex cursor-pointer items-center gap-4 px-6 py-4 hover:bg-gray-50 transition-colors"
                        onClick={() => toggleBatch(batch.batchId)}
                        whileHover={{ backgroundColor: "rgba(0,0,0,0.02)" }}
                      >
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-purple-100 text-purple-600">
                          <Layers className="h-5 w-5" />
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-gray-900">
                              {batch.organization_name || getOrgName(batch.organization_id)}
                            </span>
                          </div>
                          <div className="mt-0.5 flex items-center gap-2 text-xs text-gray-400">
                            <span>
                              {getWeekLabel(batch.createdAt)} •{" "}
                              {batch.createdAt.toLocaleDateString("en-US", {
                                month: "2-digit",
                                day: "2-digit",
                                year: "numeric",
                              })}
                            </span>
                            {batch.jobs[0]?.location_name && (
                              <>
                                <span>•</span>
                                <span className="flex items-center gap-1">
                                  <MapPin className="h-3 w-3" />
                                  {batch.jobs.map((j) => j.location_name || j.gbp_location_name).filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(", ")}
                                </span>
                              </>
                            )}
                          </div>
                          <div className="mt-1 flex items-center gap-3 text-sm text-gray-500">
                            <span>
                              {batch.totalLocations} location
                              {batch.totalLocations !== 1 ? "s" : ""}
                            </span>
                            {batch.status === "processing" && (
                              <span className="flex items-center gap-1 text-blue-600">
                                <RefreshCw className="h-3 w-3 animate-spin" />
                                {batch.completedLocations}/{batch.totalLocations}{" "}
                                completed
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          {getStatusBadge(batch.status)}
                          {(batch.status === "failed" || batch.status === "completed") && (
                            <motion.button
                              onClick={(e) => retryBatchFn(batch.batchId, e)}
                              disabled={retryingBatch === batch.batchId}
                              className="p-1.5 text-gray-400 hover:text-blue-600 transition-colors disabled:opacity-50 rounded-lg hover:bg-blue-50"
                              whileHover={{ scale: 1.1 }}
                              whileTap={{ scale: 0.9 }}
                              title="Retry batch"
                            >
                              {retryingBatch === batch.batchId ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <RefreshCw className="h-4 w-4" />
                              )}
                            </motion.button>
                          )}
                          <motion.button
                            onClick={(e) => deleteBatch(batch.batchId, e)}
                            disabled={deletingBatch === batch.batchId}
                            className="p-1.5 text-gray-400 hover:text-red-600 transition-colors disabled:opacity-50 rounded-lg hover:bg-red-50"
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.9 }}
                            title="Delete entire batch"
                          >
                            {deletingBatch === batch.batchId ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                          </motion.button>
                          <motion.div
                            variants={chevronVariants}
                            animate={expandedBatches.has(batch.batchId) ? "open" : "closed"}
                            className="text-gray-400"
                          >
                            <ChevronRight className="h-5 w-5" />
                          </motion.div>
                        </div>
                      </motion.div>

                      {/* Expanded Batch - Individual Locations */}
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
                              <JobRow
                                key={job.id}
                                job={job}
                                isExpanded={expandedJobId === job.id}
                                onToggle={() => toggleExpand(job.id)}
                                onDelete={(e) => deleteJob(job.id, e)}
                                onRetry={(e) => retryJob(job.id, e)}
                                deletingJob={deletingJob}
                                retryingJob={retryingJob}
                                loadingResults={loadingResults}
                                jobResults={jobResults}
                                rankingTasks={rankingTasks}
                                refreshingCompetitors={refreshingCompetitors}
                                onRefreshCompetitors={() =>
                                  refreshCompetitors(job.specialty, job.location || "")
                                }
                                getStatusBadge={getStatusBadge}
                                getScoreColor={getScoreColorLocal}
                                indentLevel={1}
                              />
                            ))}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  ))}
                </div>
              </motion.div>
            ))}

            {/* Standalone Jobs (no batch) */}
            {standaloneJobs.length > 0 && (
              <motion.div
                className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <div className="px-6 py-4 bg-gray-50/50 border-b border-gray-100">
                  <h4 className="text-sm font-semibold text-gray-600">
                    Individual Analyses (No Batch)
                  </h4>
                </div>
                {standaloneJobs.map((job) => (
                  <JobRow
                    key={job.id}
                    job={job}
                    isExpanded={expandedJobId === job.id}
                    onToggle={() => toggleExpand(job.id)}
                    onDelete={(e) => deleteJob(job.id, e)}
                    onRetry={(e) => retryJob(job.id, e)}
                    deletingJob={deletingJob}
                    retryingJob={retryingJob}
                    loadingResults={loadingResults}
                    jobResults={jobResults}
                    rankingTasks={rankingTasks}
                    refreshingCompetitors={refreshingCompetitors}
                    onRefreshCompetitors={() =>
                      refreshCompetitors(job.specialty, job.location || "")
                    }
                    getStatusBadge={getStatusBadge}
                    getScoreColor={getScoreColorLocal}
                    indentLevel={0}
                  />
                ))}
              </motion.div>
            )}
          </>
        )}
      </motion.div>
    </div>
  );
}

export default PracticeRanking;
