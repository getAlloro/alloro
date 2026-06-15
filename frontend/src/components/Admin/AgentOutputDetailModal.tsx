import { useState, useEffect } from "react";
import { X, Loader2, Copy, Check } from "lucide-react";
import type { AgentOutput } from "../../types/agentOutputs";
import { fetchAgentOutputDetail } from "../../api/agentOutputs";
import { logger } from "../../lib/logger";

interface AgentOutputDetailModalProps {
  output: AgentOutput | null;
  isOpen: boolean;
  onClose: () => void;
}

export function AgentOutputDetailModal({
  output,
  isOpen,
  onClose,
}: AgentOutputDetailModalProps) {
  const [fullOutput, setFullOutput] = useState<AgentOutput | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"output" | "input">("output");

  useEffect(() => {
    if (isOpen && output) {
      loadFullOutput();
    } else {
      setFullOutput(null);
      setActiveTab("output");
    }
  }, [isOpen, output?.id]);

  const loadFullOutput = async () => {
    if (!output) return;

    try {
      setLoading(true);
      setError(null);
      const response = await fetchAgentOutputDetail(output.id);
      setFullOutput(response.data);
    } catch (err) {
      logger.error("Failed to fetch output details:", err);
      setError(
        err instanceof Error ? err.message : "Failed to load output details"
      );
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen || !output) return null;

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatAgentType = (agentType: string): string => {
    return agentType
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      success: "border-green-200 bg-green-50 text-green-700",
      pending: "border-yellow-200 bg-yellow-50 text-yellow-700",
      error: "border-red-200 bg-red-50 text-red-700",
      archived: "border-gray-200 bg-gray-50 text-gray-600",
    };
    return styles[status] || styles.pending;
  };

  const copyToClipboard = async (text: string, field: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    } catch (err) {
      logger.error("Failed to copy:", err);
    }
  };

  const renderJsonData = (data: unknown, field: string) => {
    if (!data) {
      return (
        <div className="text-sm text-gray-500 italic">No data available</div>
      );
    }

    const jsonString =
      typeof data === "string" ? data : JSON.stringify(data, null, 2);

    return (
      <div className="relative">
        <button
          onClick={() => copyToClipboard(jsonString, field)}
          className="absolute right-2 top-2 rounded-lg border border-gray-200 bg-white p-2 text-gray-500 transition hover:bg-gray-50 hover:text-gray-700"
          title="Copy to clipboard"
        >
          {copiedField === field ? (
            <Check className="h-4 w-4 text-green-600" />
          ) : (
            <Copy className="h-4 w-4" />
          )}
        </button>
        <pre className="overflow-x-auto rounded-lg bg-gray-900 p-4 text-sm text-gray-100 max-h-[400px] overflow-y-auto">
          <code>{jsonString}</code>
        </pre>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="relative w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-xl bg-white shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-start justify-between border-b border-gray-200 bg-white px-6 py-4">
          <div className="flex-1 pr-4">
            <h2 className="text-2xl font-bold text-gray-900">
              {formatAgentType(output.agent_type)} Output
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              {output.organization_id ? `Organization #${output.organization_id}` : "System"}
            </p>
          </div>
          <button
            onClick={onClose}
            className="flex-shrink-0 rounded-lg p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
            aria-label="Close modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="space-y-6 px-6 py-6">
          {/* Info Badges */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Status:
              </span>
              <span
                className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium ${getStatusBadge(
                  output.status
                )}`}
              >
                {output.status}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Date Range:
              </span>
              <span className="text-sm text-gray-700">
                {output.date_start} → {output.date_end}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Created:
              </span>
              <span className="text-sm text-gray-700">
                {formatDate(output.created_at)}
              </span>
            </div>
          </div>

          {/* Error Message */}
          {output.error_message && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4">
              <h3 className="mb-2 text-sm font-semibold text-red-800">
                Error Message
              </h3>
              <p className="text-sm text-red-700">{output.error_message}</p>
            </div>
          )}

          {/* Loading State */}
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-gray-500">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>Loading full output data...</span>
            </div>
          ) : error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-center">
              <p className="text-sm text-red-700">{error}</p>
              <button
                onClick={loadFullOutput}
                className="mt-2 rounded-full border border-red-200 bg-white px-4 py-1 text-xs font-semibold uppercase text-red-600 transition hover:border-red-300"
              >
                Retry
              </button>
            </div>
          ) : fullOutput ? (
            <>
              {/* Tabs */}
              <div className="border-b border-gray-200">
                <nav className="flex space-x-4">
                  <button
                    onClick={() => setActiveTab("output")}
                    className={`border-b-2 pb-3 pt-1 px-1 text-sm font-medium transition ${
                      activeTab === "output"
                        ? "border-blue-500 text-blue-600"
                        : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700"
                    }`}
                  >
                    Agent Output
                  </button>
                  <button
                    onClick={() => setActiveTab("input")}
                    className={`border-b-2 pb-3 pt-1 px-1 text-sm font-medium transition ${
                      activeTab === "input"
                        ? "border-blue-500 text-blue-600"
                        : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700"
                    }`}
                  >
                    Agent Input
                  </button>
                </nav>
              </div>

              {/* Tab Content */}
              <div>
                {activeTab === "output" && (
                  <div>
                    <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
                      Agent Output Data
                    </h3>
                    {renderJsonData(fullOutput.agent_output, "output")}
                  </div>
                )}
                {activeTab === "input" && (
                  <div>
                    <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
                      Agent Input Data
                    </h3>
                    {renderJsonData(fullOutput.agent_input, "input")}
                  </div>
                )}
              </div>
            </>
          ) : null}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 border-t border-gray-200 bg-white px-6 py-4">
          <div className="flex justify-end">
            <button
              onClick={onClose}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
