import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Loader2,
  AlertCircle,
  ChevronRight,
  Database,
  Bot,
  CheckCircle2,
  ListChecks,
  FileText,
} from "lucide-react";
import {
  fetchPmsPipeline,
  type PipelineAgentNode,
  type PipelinePmsJob,
} from "../../api/pms";

interface PMSPipelineModalProps {
  jobId: number | null;
  isOpen: boolean;
  onClose: () => void;
}

interface PipelineNode {
  key: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
  /** Source agent_results row, when this node corresponds to a persisted agent. */
  agent?: PipelineAgentNode;
  /** Special: when true, render the PMS source data instead of agent input/output. */
  pmsSource?: PipelinePmsJob;
  /** Special: terminal node showing tasks created. */
  taskSummary?: { total: number; user: number; alloro: number };
}

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  success: {
    label: "success",
    className: "bg-green-100 text-green-700 border-green-200",
  },
  pending: {
    label: "pending",
    className: "bg-yellow-100 text-yellow-700 border-yellow-200",
  },
  error: {
    label: "error",
    className: "bg-red-100 text-red-700 border-red-200",
  },
  archived: {
    label: "archived",
    className: "bg-gray-200 text-gray-700 border-gray-300",
  },
  missing: {
    label: "no run",
    className: "bg-gray-100 text-gray-500 border-gray-200",
  },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_BADGE[status] || STATUS_BADGE.missing;
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 text-xs font-medium border rounded ${cfg.className}`}
    >
      {cfg.label}
    </span>
  );
}

function JsonBlock({ value }: { value: unknown }) {
  if (value === null || value === undefined) {
    return (
      <div className="text-xs text-gray-500 italic px-3 py-2">
        Not captured (legacy run or pre-truncation-fix).
      </div>
    );
  }
  let formatted: string;
  try {
    formatted = JSON.stringify(value, null, 2);
  } catch {
    formatted = String(value);
  }
  return (
    <pre className="text-xs bg-gray-900 text-gray-100 rounded-lg p-3 overflow-auto max-h-[420px] whitespace-pre-wrap break-words">
      {formatted}
    </pre>
  );
}

export const PMSPipelineModal: React.FC<PMSPipelineModalProps> = ({
  jobId,
  isOpen,
  onClose,
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pmsJob, setPmsJob] = useState<PipelinePmsJob | null>(null);
  const [agents, setAgents] = useState<PipelineAgentNode[]>([]);
  const [activeKey, setActiveKey] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !jobId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setActiveKey(null);
    fetchPmsPipeline(jobId)
      .then((res) => {
        if (cancelled) return;
        if (!res.success || !res.pms_job) {
          setError(res.message || res.error || "Failed to load pipeline");
          setPmsJob(null);
          setAgents([]);
          return;
        }
        setPmsJob(res.pms_job);
        setAgents(res.agents || []);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message =
          err instanceof Error ? err.message : "Failed to load pipeline";
        setError(message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, jobId]);

  const re = agents.find((a) => a.agent_type === "referral_engine");
  const summary = agents.find((a) => a.agent_type === "summary");

  const taskSummary = (() => {
    const stored = pmsJob?.automation_status_detail?.summary?.tasksCreated;
    if (!stored) return undefined;
    return {
      total: stored.total ?? 0,
      user: stored.user ?? 0,
      alloro: stored.alloro ?? 0,
    };
  })();

  const nodes: PipelineNode[] = [
    {
      key: "pms",
      label: "PMS Data",
      icon: FileText,
      description: "Monthly rollup from upload",
      pmsSource: pmsJob ?? undefined,
    },
    {
      key: "referral_engine",
      label: "Referral Engine",
      icon: Bot,
      description: "Specialist analysis of referrals",
      agent: re,
    },
    {
      key: "dashboard_metrics",
      label: "Dashboard Metrics",
      icon: Database,
      description: "Embedded in Summary input",
      agent: summary,
    },
    {
      key: "summary",
      label: "Summary v2",
      icon: CheckCircle2,
      description: "Chief-of-Staff: picks top actions",
      agent: summary,
    },
    {
      key: "tasks",
      label: "Tasks Created",
      icon: ListChecks,
      description: "USER + ALLORO tasks from Summary + RE",
      taskSummary,
    },
  ];

  const activeNode = activeKey
    ? nodes.find((n) => n.key === activeKey) ?? null
    : null;

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-alloro-navy/60 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 16 }}
            transition={{ type: "spring", duration: 0.3 }}
            className="relative bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col overflow-hidden"
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  Pipeline {jobId ? `· Job #${jobId}` : ""}
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Inputs and outputs for the monthly agent run triggered by this PMS upload.
                </p>
              </div>
              <button
                onClick={onClose}
                className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-auto px-6 py-5 space-y-6">
              {loading && (
                <div className="flex items-center gap-2 text-gray-500 text-sm py-12 justify-center">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading pipeline…
                </div>
              )}

              {error && !loading && (
                <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                  <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-red-700">{error}</div>
                </div>
              )}

              {!loading && !error && pmsJob && (
                <>
                  <div className="flex items-center gap-2 overflow-x-auto pb-2">
                    {nodes.map((node, idx) => {
                      const Icon = node.icon;
                      const isActive = activeKey === node.key;
                      const status = node.agent?.status;
                      return (
                        <React.Fragment key={node.key}>
                          <button
                            onClick={() =>
                              setActiveKey(isActive ? null : node.key)
                            }
                            className={`flex flex-col items-start text-left px-3 py-2.5 rounded-lg border transition-colors min-w-[170px] ${
                              isActive
                                ? "border-alloro-navy bg-alloro-navy/5"
                                : "border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50"
                            }`}
                          >
                            <div className="flex items-center gap-2 w-full">
                              <Icon className="h-4 w-4 text-alloro-navy" />
                              <span className="text-sm font-medium text-gray-900">
                                {node.label}
                              </span>
                              {status && (
                                <span className="ml-auto">
                                  <StatusBadge status={status} />
                                </span>
                              )}
                            </div>
                            <span className="text-[11px] text-gray-500 mt-1">
                              {node.description}
                            </span>
                          </button>
                          {idx < nodes.length - 1 && (
                            <ChevronRight className="h-5 w-5 text-gray-300 flex-shrink-0" />
                          )}
                        </React.Fragment>
                      );
                    })}
                  </div>

                  <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                    {!activeNode && (
                      <div className="text-sm text-gray-500 text-center py-8">
                        Click a node above to inspect its input and output.
                      </div>
                    )}

                    {activeNode?.key === "pms" && activeNode.pmsSource && (
                      <div className="space-y-3">
                        <h3 className="text-sm font-semibold text-gray-900">
                          PMS Job · monthly_rollup
                        </h3>
                        <p className="text-xs text-gray-500">
                          Persisted at upload time in pms_jobs.response_log.
                        </p>
                        <JsonBlock value={activeNode.pmsSource.response_log} />
                      </div>
                    )}

                    {activeNode?.key === "referral_engine" && (
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <h3 className="text-sm font-semibold text-gray-900">
                            Referral Engine
                          </h3>
                          {activeNode.agent && (
                            <StatusBadge status={activeNode.agent.status} />
                          )}
                        </div>
                        {activeNode.agent ? (
                          <>
                            <div>
                              <h4 className="text-xs font-medium text-gray-700 mb-1">
                                agent_input (sent to Claude)
                              </h4>
                              <JsonBlock value={activeNode.agent.agent_input} />
                            </div>
                            <div>
                              <h4 className="text-xs font-medium text-gray-700 mb-1">
                                agent_output (parsed JSON)
                              </h4>
                              <JsonBlock value={activeNode.agent.agent_output} />
                            </div>
                          </>
                        ) : (
                          <div className="text-xs text-gray-500 italic">
                            No referral_engine agent_results row found for this job.
                          </div>
                        )}
                      </div>
                    )}

                    {activeNode?.key === "dashboard_metrics" && (
                      <div className="space-y-3">
                        <h3 className="text-sm font-semibold text-gray-900">
                          Dashboard Metrics (deterministic)
                        </h3>
                        <p className="text-xs text-gray-500">
                          Computed pre-Summary, embedded in
                          additional_data.dashboard_metrics inside Summary's
                          agent_input. Not stored in its own row.
                        </p>
                        {summary?.agent_input ? (
                          <JsonBlock
                            value={
                              (
                                summary.agent_input as {
                                  additional_data?: {
                                    dashboard_metrics?: unknown;
                                  };
                                }
                              )?.additional_data?.dashboard_metrics ?? null
                            }
                          />
                        ) : (
                          <div className="text-xs text-gray-500 italic">
                            Not available — Summary agent_input is missing.
                          </div>
                        )}
                      </div>
                    )}

                    {activeNode?.key === "summary" && (
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <h3 className="text-sm font-semibold text-gray-900">
                            Summary v2 · Chief-of-Staff
                          </h3>
                          {activeNode.agent && (
                            <StatusBadge status={activeNode.agent.status} />
                          )}
                        </div>
                        {activeNode.agent ? (
                          <>
                            <div>
                              <h4 className="text-xs font-medium text-gray-700 mb-1">
                                agent_input (full additional_data)
                              </h4>
                              <JsonBlock value={activeNode.agent.agent_input} />
                            </div>
                            <div>
                              <h4 className="text-xs font-medium text-gray-700 mb-1">
                                agent_output · top_actions[]
                              </h4>
                              <JsonBlock value={activeNode.agent.agent_output} />
                            </div>
                          </>
                        ) : (
                          <div className="text-xs text-gray-500 italic">
                            No summary agent_results row found for this job.
                          </div>
                        )}
                      </div>
                    )}

                    {activeNode?.key === "tasks" && (
                      <div className="space-y-3">
                        <h3 className="text-sm font-semibold text-gray-900">
                          Tasks Created
                        </h3>
                        {activeNode.taskSummary ? (
                          <div className="grid grid-cols-3 gap-3">
                            <div className="bg-white border border-gray-200 rounded-lg p-3 text-center">
                              <div className="text-2xl font-semibold text-gray-900">
                                {activeNode.taskSummary.total}
                              </div>
                              <div className="text-xs text-gray-500">total</div>
                            </div>
                            <div className="bg-white border border-gray-200 rounded-lg p-3 text-center">
                              <div className="text-2xl font-semibold text-gray-900">
                                {activeNode.taskSummary.user}
                              </div>
                              <div className="text-xs text-gray-500">USER</div>
                            </div>
                            <div className="bg-white border border-gray-200 rounded-lg p-3 text-center">
                              <div className="text-2xl font-semibold text-gray-900">
                                {activeNode.taskSummary.alloro}
                              </div>
                              <div className="text-xs text-gray-500">ALLORO</div>
                            </div>
                          </div>
                        ) : (
                          <div className="text-xs text-gray-500 italic">
                            Task counts not recorded for this run.
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
