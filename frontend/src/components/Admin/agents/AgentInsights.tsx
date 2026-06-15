import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Loader2,
  RefreshCw,
  XCircle,
} from "lucide-react";
import {
  fetchAgentResults,
  approveAgentResult,
  updateAgentResult,
  type AgentResult,
} from "../../../api/agents";
import type {
  ProoflineAgentData,
  SummaryAgentData,
  OpportunityAgentData,
  WebhookResult,
} from "../../../types/agents";
import { ProoflineAgentEditor } from "./ProoflineAgentEditor";
import { SummaryAgentEditor } from "./SummaryAgentEditor";
import { OpportunityAgentEditor } from "./OpportunityAgentEditor";
import { ConfirmModal } from "@/components/settings/ConfirmModal";
import { logger } from "../../../lib/logger";

type StatusFilter = "all" | "pending" | "approved" | "rejected";

const STATUS_LABELS: Record<StatusFilter, string> = {
  all: "All Insights",
  pending: "Pending Review",
  approved: "Approved",
  rejected: "Rejected",
};

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-700 border-yellow-200",
  approved: "bg-green-100 text-green-700 border-green-200",
  rejected: "bg-red-100 text-red-700 border-red-200",
};

const STATUS_OPTIONS: StatusFilter[] = [
  "all",
  "pending",
  "approved",
  "rejected",
];

const POLL_INTERVAL_MS = 3000;

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

const getAgentType = (webhookUrl: string): string => {
  if (webhookUrl.includes("proofline-agent")) return "proofline";
  if (webhookUrl.includes("summary-agent")) return "summary";
  if (webhookUrl.includes("opportunity-agent")) return "opportunity";
  return "unknown";
};

const getAgentDisplayName = (webhookUrl: string): string => {
  const type = getAgentType(webhookUrl);
  switch (type) {
    case "proofline":
      return "Proofline Agent";
    case "summary":
      return "Summary Agent";
    case "opportunity":
      return "Opportunity Agent";
    default:
      return "Unknown Agent";
  }
};

export function AgentInsights() {
  const [results, setResults] = useState<AgentResult[]>([]);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("pending");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [processingResultId, setProcessingResultId] = useState<number | null>(
    null
  );
  const [expandedResults, setExpandedResults] = useState<Set<number>>(
    new Set()
  );
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    type?: "danger" | "warning" | "info";
  }>({ isOpen: false, title: "", message: "", onConfirm: () => {} });

  const loadResults = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!options?.silent) {
        setIsLoading(true);
      }

      try {
        const response = await fetchAgentResults({
          status: statusFilter === "all" ? undefined : statusFilter,
        });

        if (response?.success && response.data) {
          setResults(response.data);
          setError(null);
          setLastUpdated(new Date());
        } else {
          const fallbackError =
            response?.error ||
            response?.message ||
            "Unable to fetch agent insights right now.";

          if (!options?.silent) {
            setResults([]);
          }

          setError(fallbackError);
        }
      } catch (err) {
        logger.error("Failed to load agent results", err);
        if (!options?.silent) {
          setResults([]);
        }
        setError("An unexpected error occurred while loading agent insights.");
      } finally {
        if (!options?.silent) {
          setIsLoading(false);
        }
      }
    },
    [statusFilter]
  );

  useEffect(() => {
    loadResults();
  }, [loadResults]);

  useEffect(() => {
    const interval = setInterval(() => {
      loadResults({ silent: true });
    }, POLL_INTERVAL_MS);

    return () => {
      clearInterval(interval);
    };
  }, [loadResults]);

  const handleStatusFilterChange = (value: StatusFilter) => {
    setStatusFilter(value);
  };

  const toggleExpanded = (resultId: number) => {
    setExpandedResults((prev) => {
      const next = new Set(prev);
      if (next.has(resultId)) {
        next.delete(resultId);
      } else {
        next.add(resultId);
      }
      return next;
    });
  };

  const handleApprove = async (result: AgentResult) => {
    if (processingResultId) {
      return;
    }

    setProcessingResultId(result.id);

    try {
      const response = await approveAgentResult({
        resultId: result.id,
        status: "approved",
        approvedBy: "admin", // TODO: Get from auth context
      });

      if (response?.success && response.data) {
        setResults((prev) =>
          prev.map((item) => (item.id === result.id ? response.data! : item))
        );
        setError(null);
        setLastUpdated(new Date());
        setToast({
          message: "Insight approved successfully!",
          type: "success",
        });
        setTimeout(() => setToast(null), 3000);
      } else {
        const fallbackError =
          response?.error ||
          response?.message ||
          "Unable to approve the insight.";
        setError(fallbackError);
      }
    } catch (err) {
      logger.error("Failed to approve agent result", err);
      setError("Failed to approve the insight. Please try again.");
    } finally {
      setProcessingResultId(null);
    }
  };

  const handleReject = (result: AgentResult) => {
    if (processingResultId) {
      return;
    }

    setConfirmModal({
      isOpen: true,
      title: "Reject Insight",
      message: "Are you sure you want to reject this insight? This action cannot be undone.",
      type: "danger",
      onConfirm: async () => {
        setConfirmModal(prev => ({ ...prev, isOpen: false }));

        setProcessingResultId(result.id);

        try {
          const response = await approveAgentResult({
            resultId: result.id,
            status: "rejected",
            approvedBy: "admin", // TODO: Get from auth context
          });

          if (response?.success && response.data) {
            setResults((prev) =>
              prev.map((item) => (item.id === result.id ? response.data! : item))
            );
            setError(null);
            setLastUpdated(new Date());
            setToast({
              message: "Insight rejected successfully!",
              type: "success",
            });
            setTimeout(() => setToast(null), 3000);
          } else {
            const fallbackError =
              response?.error ||
              response?.message ||
              "Unable to reject the insight.";
            setError(fallbackError);
          }
        } catch (err) {
          logger.error("Failed to reject agent result", err);
          setError("Failed to reject the insight. Please try again.");
        } finally {
          setProcessingResultId(null);
        }
      },
    });
  };

  const handleSaveAgentData = async (
    result: AgentResult,
    webhookIndex: number,
    updatedData: ProoflineAgentData | SummaryAgentData | OpportunityAgentData
  ) => {
    try {
      // Clone the agent response and ensure webhooks is always an array
      const currentWebhooks = result.agent_response?.webhooks || [];
      const webhooks = [...currentWebhooks];

      // Update the specific webhook's data
      if (webhooks[webhookIndex]) {
        webhooks[webhookIndex] = {
          ...webhooks[webhookIndex],
          data: [updatedData],
        };
      }

      const updatedResponse = {
        webhooks,
        successCount: result.agent_response?.successCount,
        totalCount: result.agent_response?.totalCount,
      };

      // Call the API to update
      const response = await updateAgentResult({
        resultId: result.id,
        agentResponse: updatedResponse,
      });

      if (response?.success && response.data) {
        setResults((prev) =>
          prev.map((item) => (item.id === result.id ? response.data! : item))
        );
        setToast({
          message: "Agent data updated successfully!",
          type: "success",
        });
        setTimeout(() => setToast(null), 3000);
      } else {
        const errorMsg =
          response?.error || response?.message || "Failed to update agent data";
        setToast({
          message: errorMsg,
          type: "error",
        });
        setTimeout(() => setToast(null), 5000);
      }
    } catch (err) {
      logger.error("Failed to save agent data", err);
      setToast({
        message: "Failed to save changes. Please try again.",
        type: "error",
      });
      setTimeout(() => setToast(null), 5000);
    }
  };

  const extractWeekDates = (result: AgentResult): string => {
    // Try to extract from webhooks data first
    const webhook = result.agent_response?.webhooks?.[0];
    if (webhook?.data?.[0]) {
      const data = webhook.data[0] as Record<string, unknown>;
      if (data.weekStart && data.weekEnd) {
        return `${data.weekStart} to ${data.weekEnd}`;
      }
    }
    // Fallback to result dates if available
    return "Week dates unavailable";
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Status
            <select
              className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-sm font-medium text-gray-700 focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-200"
              value={statusFilter}
              onChange={(event) =>
                handleStatusFilterChange(event.target.value as StatusFilter)
              }
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {STATUS_LABELS[option]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="flex items-center gap-3 text-xs text-gray-500">
          {lastUpdated && (
            <span className="hidden sm:inline">
              Last updated {lastUpdated.toLocaleTimeString()}
            </span>
          )}
          <button
            type="button"
            onClick={() => loadResults()}
            disabled={isLoading}
            className="inline-flex items-center gap-2 rounded-full border border-gray-200 px-3 py-1 text-xs font-semibold uppercase text-gray-600 transition hover:border-blue-200 hover:text-blue-600 disabled:cursor-not-allowed disabled:border-gray-100 disabled:text-gray-300"
          >
            {isLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            {isLoading ? "Refreshing" : "Refresh"}
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        {isLoading && results.length === 0 ? (
          <div className="flex items-center justify-center gap-2 px-4 py-12 text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Loading insights…</span>
          </div>
        ) : results.length === 0 ? (
          <div className="px-4 py-12 text-center text-sm text-gray-500">
            {error || "No agent insights found for the selected filters."}
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {results.map((result) => {
              const statusClass =
                STATUS_STYLES[result.status] ||
                "bg-gray-100 text-gray-700 border-gray-200";
              const isProcessing = processingResultId === result.id;
              const isPending = result.status === "pending";
              const isExpanded = expandedResults.has(result.id);
              const webhooks = result.agent_response?.webhooks || [];

              return (
                <div key={result.id} className="bg-white">
                  {/* Main Row */}
                  <div className="grid grid-cols-[auto_2fr_1fr_1.5fr_1.5fr] items-center gap-4 px-4 py-4">
                    {/* Expand/Collapse Button */}
                    <button
                      type="button"
                      onClick={() => toggleExpanded(result.id)}
                      className="text-gray-400 transition hover:text-gray-600"
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-5 w-5" />
                      ) : (
                        <ChevronRight className="h-5 w-5" />
                      )}
                    </button>

                    {/* Status */}
                    <div>
                      <span
                        className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold uppercase ${statusClass}`}
                      >
                        {STATUS_LABELS[result.status as StatusFilter] ||
                          result.status}
                      </span>
                    </div>

                    {/* Week Dates */}
                    <div className="text-sm font-medium text-gray-800">
                      {extractWeekDates(result)}
                    </div>

                    {/* Organization */}
                    <div className="text-sm text-gray-700">Org #{result.organization_id}</div>

                    {/* Actions */}
                    <div className="flex items-center justify-end gap-2">
                      {isPending && (
                        <>
                          <button
                            type="button"
                            onClick={() => handleApprove(result)}
                            disabled={isProcessing}
                            className="inline-flex items-center gap-1 rounded-full border border-green-200 px-3 py-1 text-xs font-semibold uppercase text-green-600 transition hover:border-green-300 hover:text-green-700 disabled:cursor-not-allowed disabled:border-green-100 disabled:text-green-300"
                          >
                            {isProcessing ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <CheckCircle className="h-3.5 w-3.5" />
                            )}
                            Approve
                          </button>
                          <button
                            type="button"
                            onClick={() => handleReject(result)}
                            disabled={isProcessing}
                            className="inline-flex items-center gap-1 rounded-full border border-red-200 px-3 py-1 text-xs font-semibold uppercase text-red-600 transition hover:border-red-300 hover:text-red-700 disabled:cursor-not-allowed disabled:border-red-100 disabled:text-red-300"
                          >
                            {isProcessing ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <XCircle className="h-3.5 w-3.5" />
                            )}
                            Reject
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Expanded Content - Agent Sub-items */}
                  {isExpanded && (
                    <div className="border-t border-gray-100 bg-gray-50 px-4 py-4">
                      <div className="space-y-4">
                        {webhooks.map(
                          (webhook: WebhookResult, index: number) => {
                            const agentType = getAgentType(webhook.webhookUrl);
                            const agentName = getAgentDisplayName(
                              webhook.webhookUrl
                            );
                            const agentData = webhook.data?.[0];

                            if (!agentData) {
                              return (
                                <div
                                  key={index}
                                  className="rounded-lg border border-gray-200 bg-white p-4"
                                >
                                  <p className="text-sm text-gray-500">
                                    {agentName}: No data available
                                  </p>
                                </div>
                              );
                            }

                            const isReadOnly = result.status !== "pending";

                            return (
                              <div key={index}>
                                {agentType === "proofline" && (
                                  <ProoflineAgentEditor
                                    data={agentData as ProoflineAgentData}
                                    onSave={(updatedData) =>
                                      handleSaveAgentData(
                                        result,
                                        index,
                                        updatedData
                                      )
                                    }
                                    isReadOnly={isReadOnly}
                                  />
                                )}
                                {agentType === "summary" && (
                                  <SummaryAgentEditor
                                    data={agentData as SummaryAgentData}
                                    onSave={(updatedData) =>
                                      handleSaveAgentData(
                                        result,
                                        index,
                                        updatedData
                                      )
                                    }
                                    isReadOnly={isReadOnly}
                                  />
                                )}
                                {agentType === "opportunity" && (
                                  <OpportunityAgentEditor
                                    data={agentData as OpportunityAgentData}
                                    onSave={(updatedData) =>
                                      handleSaveAgentData(
                                        result,
                                        index,
                                        updatedData
                                      )
                                    }
                                    isReadOnly={isReadOnly}
                                  />
                                )}
                              </div>
                            );
                          }
                        )}

                        {/* Metadata Section */}
                        <div className="mt-4 rounded-lg border border-gray-200 bg-white p-4">
                          <h4 className="mb-2 text-sm font-semibold text-gray-700">
                            Metadata
                          </h4>
                          <div className="space-y-1 text-sm text-gray-600">
                            <p>
                              <span className="font-medium">Created:</span>{" "}
                              {formatTimestamp(result.created_at)}
                            </p>
                            {result.approved_by && (
                              <>
                                <p>
                                  <span className="font-medium">
                                    Approved By:
                                  </span>{" "}
                                  {result.approved_by}
                                </p>
                                <p>
                                  <span className="font-medium">
                                    Approved At:
                                  </span>{" "}
                                  {formatTimestamp(result.approved_at || "")}
                                </p>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between text-sm text-gray-600">
        <div>
          {results.length > 0 ? (
            <span>Showing {results.length} insights</span>
          ) : (
            <span>0 insights</span>
          )}
          {lastUpdated && (
            <span className="ml-2 text-xs text-gray-400">
              Updated {lastUpdated.toLocaleTimeString()}
            </span>
          )}
        </div>
      </div>

      {error && results.length > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {toast && (
        <div
          className={`fixed bottom-4 right-4 z-50 rounded-lg border px-4 py-3 shadow-lg ${
            toast.type === "success"
              ? "border-green-200 bg-green-50 text-green-800"
              : "border-red-200 bg-red-50 text-red-800"
          }`}
        >
          <div className="flex items-center gap-2">
            {toast.type === "success" ? (
              <CheckCircle className="h-5 w-5" />
            ) : (
              <XCircle className="h-5 w-5" />
            )}
            <span className="text-sm font-medium">{toast.message}</span>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
        onConfirm={confirmModal.onConfirm}
        title={confirmModal.title}
        message={confirmModal.message}
        type={confirmModal.type}
      />
    </div>
  );
}
