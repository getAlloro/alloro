import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import {
  LineChart,
  Trash2,
  ArrowRight,
  FileText,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Bot,
} from "lucide-react";
// AgentInsightSummary type used indirectly via TQ hook data

import { MonthSelector } from "../../components/Admin";
import {
  AdminPageHeader,
  ActionButton,
  CardGrid,
  HorizontalProgressBar,
  EmptyState,
  Badge,
} from "../../components/ui/DesignSystem";
import { staggerContainer, cardVariants, fadeInUp, getScoreColor } from "../../lib/animations";
import { getAgentIcon } from "../../lib/adminIcons";
import { useConfirm } from "../../components/ui/ConfirmModal";
import {
  useAdminInsightsSummary,
  useInvalidateAdminInsights,
} from "../../hooks/queries/useAdminStandaloneQueries";
import { adminFetch } from "../../api";
import { logger } from "../../lib/logger";

/**
 * AI Data Insights List Page
 * Shows card grid of all agents with summary metrics
 * Clicking a card navigates to detail page
 */
export default function AIDataInsightsList() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const confirm = useConfirm();
  const [currentPage, setCurrentPage] = useState(1);
  // setIsRunning dropped — handleRunAgents disabled 2026-04-12
  const [isRunning] = useState(false);
  const [isClearing, setIsClearing] = useState(false);

  // Month selector state - read from URL params, default to current month
  const getDefaultMonth = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(
      2,
      "0"
    )}`;
  };

  const selectedMonth = searchParams.get("month") || getDefaultMonth();

  const setSelectedMonth = (month: string) => {
    setSearchParams({ month });
  };

  // TanStack Query — replaces useEffect + useState
  const {
    data: queryData,
    isLoading: loading,
    error: queryError,
  } = useAdminInsightsSummary(currentPage, selectedMonth);
  const { invalidateAll: invalidateInsights } = useInvalidateAdminInsights();

  const summaryData = queryData?.data ?? [];
  const totalPages = queryData?.totalPages ?? 1;
  const error = queryError?.message ?? null;

  const fetchSummary = () => invalidateInsights();

  const formatAgentName = (agentType: string): string => {
    return agentType
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  };

  const handleCardClick = (agentType: string) => {
    navigate(`/admin/ai-data-insights/${agentType}?month=${selectedMonth}`);
  };

  /* DISABLED 2026-04-12 — see plans/04122026-no-ticket-disable-n8n-agents-migrate-identifier/spec.md
  const handleRunAgents = async () => {
    if (isRunning) return;

    // Format month for display in confirmation
    const [year, monthNum] = selectedMonth.split("-");
    const monthName = new Date(
      parseInt(year),
      parseInt(monthNum) - 1
    ).toLocaleDateString("en-US", {
      month: "long",
      year: "numeric",
    });

    const ok = await confirm({ title: "Run Guardian & Governance Agents?", message: `This will run agents for ${monthName}. This may take several minutes.`, confirmLabel: "Run", variant: "default" });
    if (!ok) return;

    setIsRunning(true);
    try {
      const response = await adminFetch(
        "/api/agents/guardian-governance-agents-run",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ month: selectedMonth }),
        }
      );

      const data = await response.json();

      if (data.success) {
        alert(
          `Guardian and Governance agents completed successfully for ${monthName}! Refreshing data...`
        );
        fetchSummary();
      } else {
        alert("Failed to run agents: " + (data.message || "Unknown error"));
      }
    } catch (err) {
      logger.error("Failed to run Guardian/Governance agents:", err);
      alert("Failed to run agents. Please try again.");
    } finally {
      setIsRunning(false);
    }
  };
  */

  const handleClearData = async () => {
    if (isClearing) return;

    // Format month for display
    const [year, month] = selectedMonth.split("-");
    const monthName = new Date(
      parseInt(year),
      parseInt(month) - 1
    ).toLocaleDateString("en-US", {
      month: "long",
      year: "numeric",
    });

    const ok = await confirm({ title: `Delete all data for ${monthName}?`, message: "This will delete ALL Guardian and Governance data. This action cannot be undone.", confirmLabel: "Delete", variant: "danger" });
    if (!ok) return;

    setIsClearing(true);
    try {
      const response = await adminFetch(
        `/api/admin/agent-insights/clear-month-data?month=${selectedMonth}`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
        }
      );

      const data = await response.json();

      if (data.success) {
        alert(
          `Successfully cleared ${data.deleted.recommendations} recommendations and ${data.deleted.agent_results} agent results.`
        );
        fetchSummary();
      } else {
        alert("Failed to clear data: " + (data.message || "Unknown error"));
      }
    } catch (err) {
      logger.error("Failed to clear Guardian/Governance data:", err);
      alert("Failed to clear data. Please try again.");
    } finally {
      setIsClearing(false);
    }
  };

  const handleGenerateLogRef = async (
    agentType: string,
    e: React.MouseEvent
  ) => {
    e.stopPropagation();

    try {
      const response = await adminFetch(
        `/api/admin/agent-insights/${agentType}/governance-ids`,
      );
      const data = await response.json();

      if (data.success) {
        const totalCount = data.counts.passed + data.counts.rejected;

        if (totalCount === 0) {
          alert(
            `No PASS or REJECT recommendations found for ${formatAgentName(
              agentType
            )}`
          );
        } else {
          const message = `Governance Log Reference for ${formatAgentName(
            agentType
          )}:\n\nPASSED (${data.counts.passed}):\n${
            data.passed.length > 0 ? data.passed.join(", ") : "None"
          }\n\nREJECTED (${data.counts.rejected}):\n${
            data.rejected.length > 0 ? data.rejected.join(", ") : "None"
          }\n\nTotal: ${totalCount} recommendations`;
          alert(message);
          logger.log("Governance IDs for", agentType, ":", data);
        }
      } else {
        alert(
          "Failed to generate log ref: " + (data.message || "Unknown error")
        );
      }
    } catch (err) {
      logger.error("Failed to generate governance log ref:", err);
      alert("Failed to generate governance log reference. Please try again.");
    }
  };

  // DISABLED 2026-04-12 — see plans/04122026-no-ticket-disable-n8n-agents-migrate-identifier/spec.md
  // Render progress bar when running
  // const renderProgressBar = () => {
  //   if (!isRunning) return null;
  //
  //   return (
  //     <motion.div
  //       className="rounded-xl border border-blue-200 bg-blue-50 p-4 shadow-sm"
  //       initial={{ opacity: 0, y: -10 }}
  //       animate={{ opacity: 1, y: 0 }}
  //       exit={{ opacity: 0, y: -10 }}
  //     >
  //       <div className="flex items-center gap-3 mb-3">
  //         <motion.div
  //           animate={{ rotate: 360 }}
  //           transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
  //         >
  //           <Loader2 className="h-5 w-5 text-blue-600" />
  //         </motion.div>
  //         <div>
  //           <p className="font-medium text-blue-900">
  //             Running Guardian & Governance Agents
  //           </p>
  //           <p className="text-sm text-blue-700">
  //             This may take several minutes. Please wait...
  //           </p>
  //         </div>
  //       </div>
  //       {/* Indeterminate progress bar */}
  //       <div className="h-2 bg-blue-200 rounded-full overflow-hidden">
  //         <motion.div
  //           className="h-full bg-blue-600 rounded-full"
  //           initial={{ x: "-100%" }}
  //           animate={{ x: "200%" }}
  //           transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
  //           style={{ width: "40%" }}
  //         />
  //       </div>
  //     </motion.div>
  //   );
  // };

  // Render action buttons
  const renderActionButtons = () => (
    <div className="flex items-center gap-3">
      <MonthSelector
        value={selectedMonth}
        onChange={(month) => {
          setSelectedMonth(month);
          setCurrentPage(1);
        }}
      />
      {/* DISABLED 2026-04-12 — see plans/04122026-no-ticket-disable-n8n-agents-migrate-identifier/spec.md
      <ActionButton
        label={isRunning ? "Running..." : "Run Guardian & Governance"}
        icon={isRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
        onClick={handleRunAgents}
        variant="primary"
        disabled={isRunning || isClearing}
        loading={isRunning}
      />
      */}
      <ActionButton
        label={isClearing ? "Clearing..." : "Clear Month Data"}
        icon={<Trash2 className="w-4 h-4" />}
        onClick={handleClearData}
        variant="danger"
        disabled={isRunning || isClearing}
        loading={isClearing}
      />
    </div>
  );

  // Loading state
  if (loading) {
    return (
      <div className="space-y-6">
        <AdminPageHeader
          icon={<LineChart className="w-6 h-6" />}
          title="AI Data Insights"
          description="Monitor agent performance and review recommendations"
          actionButtons={renderActionButtons()}
        />
        <div className="flex items-center justify-center h-64">
          <motion.div
            className="flex items-center gap-3 text-gray-500"
            animate={{ opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 1.5, repeat: Infinity }}
          >
            <Loader2 className="w-5 h-5 animate-spin" />
            Loading agent insights...
          </motion.div>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="space-y-6">
        <AdminPageHeader
          icon={<LineChart className="w-6 h-6" />}
          title="AI Data Insights"
          description="Monitor agent performance and review recommendations"
          actionButtons={renderActionButtons()}
        />
        <motion.div
          className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-red-900">Error loading data</p>
            <p className="text-sm text-red-700 mt-1">{error}</p>
          </div>
        </motion.div>
      </div>
    );
  }

  // Empty state
  if (summaryData.length === 0) {
    return (
      <div className="space-y-6">
        <AdminPageHeader
          icon={<LineChart className="w-6 h-6" />}
          title="AI Data Insights"
          description="Monitor agent performance and review recommendations"
          actionButtons={renderActionButtons()}
        />

        {/* DISABLED 2026-04-12 — see plans/04122026-no-ticket-disable-n8n-agents-migrate-identifier/spec.md
        <AnimatePresence>{renderProgressBar()}</AnimatePresence>
        */}

        <EmptyState
          icon={<Bot className="w-12 h-12" />}
          title="No agent data available"
          description="No agent insights available for this month yet."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <AdminPageHeader
        icon={<LineChart className="w-6 h-6" />}
        title="AI Data Insights"
        description="Monitor agent performance and review recommendations"
        actionButtons={renderActionButtons()}
      />

      {/* Progress bar */}
      {/* DISABLED 2026-04-12 — see plans/04122026-no-ticket-disable-n8n-agents-migrate-identifier/spec.md */}
      {/* <AnimatePresence>{renderProgressBar()}</AnimatePresence> */}

      {/* Agent Cards Grid */}
      <motion.div
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
      >
        <CardGrid columns={2}>
          {summaryData.map((agent) => {
            const AgentIcon = getAgentIcon(agent.agent_type);
            const passRatePercent = agent.pass_rate * 100;

            return (
              <motion.div
                key={agent.agent_type}
                variants={cardVariants}
                className="group relative rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition-all hover:shadow-md hover:border-gray-300 cursor-pointer"
                onClick={() => handleCardClick(agent.agent_type)}
                whileHover={{ y: -2 }}
              >
                {/* Card Header */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-alloro-navy/10 text-alloro-navy">
                      <AgentIcon className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900">
                        {formatAgentName(agent.agent_type)}
                      </h3>
                      <p className="text-xs text-gray-500">AI Agent</p>
                    </div>
                  </div>
                  <motion.div
                    className="text-gray-400 group-hover:text-alloro-orange transition-colors"
                    whileHover={{ x: 4 }}
                  >
                    <ArrowRight className="w-5 h-5" />
                  </motion.div>
                </div>

                {/* Metrics Row */}
                <div className="grid grid-cols-2 gap-4 mb-4">
                  {/* Confidence Rate */}
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs text-gray-500 mb-1">AI Confidence</p>
                    <p className="text-lg font-bold text-gray-900">
                      {agent.confidence_rate.toFixed(1)}<span className="text-sm font-normal text-gray-500">/10</span>
                    </p>
                  </div>

                  {/* Pass Rate - Horizontal Bar */}
                  <div className="bg-gray-50 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-xs text-gray-500">Pass Rate</p>
                      <p className={`text-sm font-semibold ${getScoreColor(passRatePercent)}`}>
                        {passRatePercent.toFixed(0)}%
                      </p>
                    </div>
                    <HorizontalProgressBar
                      value={passRatePercent}
                      height={6}
                    />
                  </div>
                </div>

                {/* Stats Pills */}
                <div className="flex items-center gap-2 pt-3 border-t border-gray-100">
                  <Badge variant="default">
                    <FileText className="w-3 h-3 mr-1" />
                    {agent.total_recommendations} recommendations
                  </Badge>
                  <Badge variant="success">
                    <CheckCircle2 className="w-3 h-3 mr-1" />
                    {agent.fixed_count} fixed
                  </Badge>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100">
                  <motion.button
                    className="text-xs font-medium text-purple-600 hover:text-purple-700 px-2 py-1 rounded-lg hover:bg-purple-50 transition-colors"
                    onClick={(e) => handleGenerateLogRef(agent.agent_type, e)}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    Governance Log IDs
                  </motion.button>
                  <motion.button
                    className="text-xs font-medium text-blue-600 hover:text-blue-700 px-2 py-1 rounded-lg hover:bg-blue-50 transition-colors"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCardClick(agent.agent_type);
                    }}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    View Details
                  </motion.button>
                </div>
              </motion.div>
            );
          })}
        </CardGrid>
      </motion.div>

      {/* Pagination */}
      {totalPages > 1 && (
        <motion.div
          className="flex items-center justify-between pt-4"
          variants={fadeInUp}
          initial="hidden"
          animate="visible"
        >
          <ActionButton
            label="Previous"
            onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
            variant="secondary"
            disabled={currentPage === 1}
          />
          <span className="text-sm text-gray-600">
            Page {currentPage} of {totalPages}
          </span>
          <ActionButton
            label="Next"
            onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
            variant="secondary"
            disabled={currentPage === totalPages}
          />
        </motion.div>
      )}

      {/* Legend */}
      <motion.div
        className="flex flex-wrap items-center gap-4 pt-4 border-t border-gray-100 text-xs text-gray-500"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
      >
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-green-500" />
          <span>High (&gt;70%)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-yellow-500" />
          <span>Medium (40-70%)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-red-500" />
          <span>Low (&lt;40%)</span>
        </div>
      </motion.div>
    </div>
  );
}
