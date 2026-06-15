import { useState } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  CheckCircle2,
  Trash2,
  Shield,
  Eye,
  Loader2,
  AlertCircle,
  ClipboardCheck,
  Circle,
  CheckCircle,
  Lightbulb,
  FileText,
  BarChart3,
} from "lucide-react";
import RecommendationCard from "../../components/Admin/RecommendationCard";
import {
  AdminPageHeader,
  ActionButton,
  BulkActionBar,
  EmptyState,
  ExpandableSection,
} from "../../components/ui/DesignSystem";
import { staggerContainer, cardVariants, fadeInUp } from "../../lib/animations";
import { ConfirmModal } from "../../components/settings/ConfirmModal";
import { AlertModal } from "../../components/ui/AlertModal";
import { getAgentIcon } from "../../lib/adminIcons";
import { adminFetch } from "../../api";
// AgentRecommendation type used indirectly via TQ hook data

import {
  useAdminInsightsRecommendations,
  useInvalidateAdminInsights,
} from "../../hooks/queries/useAdminStandaloneQueries";

/**
 * AI Data Insights Detail Page
 * Shows recommendations for a specific agent, grouped by source
 * (Guardian vs Governance Sentinel)
 */
export default function AIDataInsightsDetail() {
  const { agentType } = useParams<{ agentType: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Get month from URL params
  const month = searchParams.get("month");
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkOperationLoading, setBulkOperationLoading] = useState(false);

  // Modal state
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    type?: "danger" | "warning" | "info";
  }>({ isOpen: false, title: "", message: "", onConfirm: () => {} });
  const [alertModal, setAlertModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type?: "error" | "success" | "info";
  }>({ isOpen: false, title: "", message: "" });

  // TanStack Query — replaces useEffect + useState
  const {
    data: queryData,
    isLoading: loading,
    error: queryError,
  } = useAdminInsightsRecommendations(agentType, currentPage, month);
  const { invalidateRecommendations } = useInvalidateAdminInsights();

  const recommendations = queryData?.data ?? [];
  const totalPages = queryData?.totalPages ?? 1;
  const error = queryError?.message ?? null;

  const fetchRecommendations = () =>
    invalidateRecommendations(agentType || "");

  const handleFixAll = () => {
    setConfirmModal({
      isOpen: true,
      title: "Fix All Recommendations",
      message: "Are you sure you want to mark all pending recommendations as completed?",
      type: "warning",
      onConfirm: async () => {
        setConfirmModal((prev) => ({ ...prev, isOpen: false }));
        try {
          const response = await adminFetch(
            `/api/admin/agent-insights/${agentType}/recommendations/mark-all-completed`,
            { method: "PATCH" }
          );
          const data = await response.json();
          if (data.success) {
            setAlertModal({
              isOpen: true,
              title: "Success",
              message: `Marked ${data.data.updated} recommendation(s) as completed`,
              type: "success",
            });
            fetchRecommendations();
          } else {
            setAlertModal({
              isOpen: true,
              title: "Operation Failed",
              message: "Failed to mark all as completed: " + (data.message || ""),
              type: "error",
            });
          }
        } catch (error) {
          console.error("Failed to mark all as completed:", error);
          setAlertModal({
            isOpen: true,
            title: "Operation Failed",
            message: "Failed to mark all as completed. Please try again.",
            type: "error",
          });
        }
      },
    });
  };

  const handleBulkDelete = () => {
    if (selectedIds.size === 0) return;

    setConfirmModal({
      isOpen: true,
      title: "Delete Recommendations",
      message: `Are you sure you want to delete ${selectedIds.size} recommendation(s)?`,
      type: "danger",
      onConfirm: async () => {
        setConfirmModal((prev) => ({ ...prev, isOpen: false }));
        setBulkOperationLoading(true);
        try {
          const response = await adminFetch(
            "/api/admin/agent-insights/recommendations/bulk-delete",
            {
              method: "DELETE",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ids: Array.from(selectedIds) }),
            }
          );
          const data = await response.json();
          if (data.success) {
            setAlertModal({
              isOpen: true,
              title: "Success",
              message: `Deleted ${data.data.deleted} recommendation(s)`,
              type: "success",
            });
            setSelectedIds(new Set());
            fetchRecommendations();
          } else {
            setAlertModal({
              isOpen: true,
              title: "Delete Failed",
              message: "Failed to delete recommendations: " + (data.message || ""),
              type: "error",
            });
          }
        } catch (error) {
          console.error("Failed to bulk delete recommendations:", error);
          setAlertModal({
            isOpen: true,
            title: "Delete Failed",
            message: "Failed to delete recommendations. Please try again.",
            type: "error",
          });
        } finally {
          setBulkOperationLoading(false);
        }
      },
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === recommendations.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(recommendations.map((r) => r.id)));
    }
  };

  const toggleSelect = (id: number) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  // Group recommendations by source
  const governanceRecs = recommendations.filter(
    (r) => r.source_agent_type === "governance_sentinel"
  );
  const guardianRecs = recommendations.filter(
    (r) => r.source_agent_type === "guardian"
  );

  // Format agent name
  const formatAgentName = (agentType: string): string => {
    return agentType
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  };

  // Build back URL with month param preserved
  const backUrl = month
    ? `/admin/ai-data-insights?month=${month}`
    : "/admin/ai-data-insights";

  const AgentIcon = getAgentIcon(agentType || "");

  // Loading state
  if (loading) {
    return (
      <div className="space-y-6">
        <AdminPageHeader
          icon={<AgentIcon className="w-6 h-6" />}
          title={`${agentType ? formatAgentName(agentType) : "Agent"} Insights`}
          description="Review and manage AI-generated recommendations"
          actionButtons={
            <ActionButton
              label="Back to Agents"
              icon={<ArrowLeft className="w-4 h-4" />}
              onClick={() => navigate(backUrl)}
              variant="secondary"
            />
          }
        />
        <div className="flex items-center justify-center h-64">
          <motion.div
            className="flex items-center gap-3 text-gray-500"
            animate={{ opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 1.5, repeat: Infinity }}
          >
            <Loader2 className="w-5 h-5 animate-spin" />
            Loading recommendations...
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
          icon={<AgentIcon className="w-6 h-6" />}
          title={`${agentType ? formatAgentName(agentType) : "Agent"} Insights`}
          description="Review and manage AI-generated recommendations"
          actionButtons={
            <ActionButton
              label="Back to Agents"
              icon={<ArrowLeft className="w-4 h-4" />}
              onClick={() => navigate(backUrl)}
              variant="secondary"
            />
          }
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
  if (recommendations.length === 0) {
    return (
      <div className="space-y-6">
        <AdminPageHeader
          icon={<AgentIcon className="w-6 h-6" />}
          title={`${agentType ? formatAgentName(agentType) : "Agent"} Insights`}
          description="Review and manage AI-generated recommendations"
          actionButtons={
            <ActionButton
              label="Back to Agents"
              icon={<ArrowLeft className="w-4 h-4" />}
              onClick={() => navigate(backUrl)}
              variant="secondary"
            />
          }
        />
        <EmptyState
          icon={<Lightbulb className="w-12 h-12" />}
          title="No recommendations"
          description={`No Guardian or Governance recommendations for ${agentType ? formatAgentName(agentType) : "this agent"}`}
        />
      </div>
    );
  }

  // Summary stats
  const passedCount = recommendations.filter((r) => r.status === "PASS").length;
  const rejectedCount = recommendations.filter((r) => r.status === "REJECT").length;
  const pendingCount = recommendations.filter((r) => !r.status).length;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <AdminPageHeader
        icon={<AgentIcon className="w-6 h-6" />}
        title={`${agentType ? formatAgentName(agentType) : "Agent"} Insights`}
        description="Review and manage AI-generated recommendations"
        actionButtons={
          <div className="flex items-center gap-3">
            <ActionButton
              label="Back to Agents"
              icon={<ArrowLeft className="w-4 h-4" />}
              onClick={() => navigate(backUrl)}
              variant="secondary"
            />
            <ActionButton
              label={
                selectedIds.size === recommendations.length
                  ? "Deselect All"
                  : "Select All"
              }
              icon={<ClipboardCheck className="w-4 h-4" />}
              onClick={toggleSelectAll}
              variant="secondary"
            />
            <ActionButton
              label="Fix All"
              icon={<CheckCircle2 className="w-4 h-4" />}
              onClick={handleFixAll}
              variant="primary"
            />
          </div>
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
            <FileText className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-900">{recommendations.length}</p>
            <p className="text-xs text-gray-500">Total</p>
          </div>
        </div>
        <div className="flex items-center gap-3 bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100">
            <CheckCircle className="w-5 h-5 text-green-600" />
          </div>
          <div>
            <p className="text-2xl font-bold text-green-600">{passedCount}</p>
            <p className="text-xs text-gray-500">Passed</p>
          </div>
        </div>
        <div className="flex items-center gap-3 bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-100">
            <AlertCircle className="w-5 h-5 text-red-600" />
          </div>
          <div>
            <p className="text-2xl font-bold text-red-600">{rejectedCount}</p>
            <p className="text-xs text-gray-500">Rejected</p>
          </div>
        </div>
        <div className="flex items-center gap-3 bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100">
            <BarChart3 className="w-5 h-5 text-gray-600" />
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-600">{pendingCount}</p>
            <p className="text-xs text-gray-500">Pending</p>
          </div>
        </div>
      </motion.div>

      {/* Bulk Actions Bar */}
      <AnimatePresence>
        {selectedIds.size > 0 && (
          <BulkActionBar
            selectedCount={selectedIds.size}
            onClear={() => setSelectedIds(new Set())}
            actions={[
              {
                label: bulkOperationLoading ? "Deleting..." : "Delete Selected",
                icon: bulkOperationLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4" />
                ),
                onClick: handleBulkDelete,
                variant: "danger",
                disabled: bulkOperationLoading,
              },
            ]}
          />
        )}
      </AnimatePresence>

      {/* Governance Agent Recommendations */}
      {governanceRecs.length > 0 && (
        <motion.div
          variants={fadeInUp}
          initial="hidden"
          animate="visible"
        >
          <ExpandableSection
            title="Governance Agent"
            icon={<Shield className="w-5 h-5" />}
            badge={`${governanceRecs.length} recommendation${governanceRecs.length !== 1 ? "s" : ""}`}
            defaultExpanded={true}
          >
            <motion.div
              className="space-y-3"
              variants={staggerContainer}
              initial="hidden"
              animate="visible"
            >
              {governanceRecs.map((rec) => (
                <motion.div
                  key={rec.id}
                  className="flex items-start gap-3"
                  variants={cardVariants}
                >
                  <motion.button
                    onClick={() => toggleSelect(rec.id)}
                    className="mt-4 flex-shrink-0"
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                  >
                    {selectedIds.has(rec.id) ? (
                      <CheckCircle className="h-5 w-5 text-blue-600" />
                    ) : (
                      <Circle className="h-5 w-5 text-gray-400 hover:text-gray-600" />
                    )}
                  </motion.button>
                  <div className="flex-1">
                    <RecommendationCard
                      recommendation={rec}
                      onUpdate={() => fetchRecommendations()}
                    />
                  </div>
                </motion.div>
              ))}
            </motion.div>
          </ExpandableSection>
        </motion.div>
      )}

      {/* Guardian Agent Recommendations */}
      {guardianRecs.length > 0 && (
        <motion.div
          variants={fadeInUp}
          initial="hidden"
          animate="visible"
          transition={{ delay: 0.1 }}
        >
          <ExpandableSection
            title="Guardian Agent"
            icon={<Eye className="w-5 h-5" />}
            badge={`${guardianRecs.length} recommendation${guardianRecs.length !== 1 ? "s" : ""}`}
            defaultExpanded={true}
          >
            <motion.div
              className="space-y-3"
              variants={staggerContainer}
              initial="hidden"
              animate="visible"
            >
              {guardianRecs.map((rec) => (
                <motion.div
                  key={rec.id}
                  className="flex items-start gap-3"
                  variants={cardVariants}
                >
                  <motion.button
                    onClick={() => toggleSelect(rec.id)}
                    className="mt-4 flex-shrink-0"
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                  >
                    {selectedIds.has(rec.id) ? (
                      <CheckCircle className="h-5 w-5 text-blue-600" />
                    ) : (
                      <Circle className="h-5 w-5 text-gray-400 hover:text-gray-600" />
                    )}
                  </motion.button>
                  <div className="flex-1">
                    <RecommendationCard
                      recommendation={rec}
                      onUpdate={() => fetchRecommendations()}
                    />
                  </div>
                </motion.div>
              ))}
            </motion.div>
          </ExpandableSection>
        </motion.div>
      )}

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
            onClick={() =>
              setCurrentPage((prev) => Math.min(totalPages, prev + 1))
            }
            variant="secondary"
            disabled={currentPage === totalPages}
          />
        </motion.div>
      )}

      {/* Modals */}
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal((prev) => ({ ...prev, isOpen: false }))}
        onConfirm={confirmModal.onConfirm}
        title={confirmModal.title}
        message={confirmModal.message}
        type={confirmModal.type}
      />
      <AlertModal
        isOpen={alertModal.isOpen}
        onClose={() => setAlertModal((prev) => ({ ...prev, isOpen: false }))}
        title={alertModal.title}
        message={alertModal.message}
        type={alertModal.type}
      />
    </div>
  );
}
