import { useState, useEffect, useCallback, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CheckCircle2,
  AlertTriangle,
  ShieldOff,
  RefreshCw,
  Trash2,
  Loader2,
  Activity,
  Inbox,
  ChevronDown,
  RotateCcw,
} from "lucide-react";
import { toast } from "react-hot-toast";
import {
  deleteIntegration,
  validateHarvestIntegration,
  fetchHarvestLogs,
  rerunHarvest,
  type Integration,
  type HarvestLog,
  type SuccessRate,
} from "../../../api/integrations";
import { useConfirm } from "../../ui/ConfirmModal";

interface Props {
  integration: Integration;
  projectId: string;
  onRefresh: () => void;
  children?: ReactNode;
}

const PAGE_SIZE = 10;

function formatTimestamp(iso: string | null): string {
  if (!iso) return "Never";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function formatReportDate(value: string | null): string {
  if (!value) return "--";
  const datePart = String(value).split("T")[0];
  const date = new Date(`${datePart}T00:00:00`);
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getLocalDateString(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const STATUS_VISUALS: Record<
  string,
  { label: string; icon: ReactNode; className: string }
> = {
  active: {
    label: "Connected",
    icon: <CheckCircle2 className="w-4 h-4 text-green-600" />,
    className: "bg-green-50 text-green-700 border-green-200",
  },
  revoked: {
    label: "Revoked",
    icon: <ShieldOff className="w-4 h-4 text-red-600" />,
    className: "bg-red-50 text-red-700 border-red-200",
  },
  broken: {
    label: "Broken",
    icon: <AlertTriangle className="w-4 h-4 text-amber-600" />,
    className: "bg-amber-50 text-amber-700 border-amber-200",
  },
};

const OUTCOME_BADGE: Record<
  string,
  { label: string; className: string }
> = {
  success: { label: "Success", className: "bg-green-100 text-green-700" },
  failed: { label: "Failed", className: "bg-red-100 text-red-700" },
};

export default function IntegrationPanel({
  integration,
  projectId,
  onRefresh,
  children,
}: Props) {
  const confirm = useConfirm();
  const [testing, setTesting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [logs, setLogs] = useState<HarvestLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(true);
  const [logsError, setLogsError] = useState<string | null>(null);
  const [successRate, setSuccessRate] = useState<SuccessRate | null>(null);
  const [logsTotal, setLogsTotal] = useState(0);
  const [logsOffset, setLogsOffset] = useState(0);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [rerunningId, setRerunningId] = useState<string | null>(null);
  const [runningToday, setRunningToday] = useState(false);

  const sv = STATUS_VISUALS[integration.status] ?? {
    label: integration.status,
    icon: null,
    className: "bg-gray-100 text-gray-700 border-gray-200",
  };

  const loadLogs = useCallback(
    async (offset: number) => {
      setLogsLoading(true);
      setLogsError(null);
      try {
        const res = await fetchHarvestLogs(projectId, integration.id, {
          limit: PAGE_SIZE,
          offset,
        });
        const envelope = res.data as unknown as {
          data: HarvestLog[];
          total: number;
          successRate: SuccessRate;
        };
        setLogs(envelope.data || []);
        setLogsTotal(envelope.total || 0);
        setSuccessRate(envelope.successRate || null);
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "Failed to load harvest logs";
        setLogsError(msg);
      } finally {
        setLogsLoading(false);
      }
    },
    [projectId, integration.id],
  );

  useEffect(() => {
    loadLogs(0);
    setLogsOffset(0);
  }, [loadLogs]);

  const handleTest = async () => {
    setTesting(true);
    try {
      const res = await validateHarvestIntegration(projectId, integration.id);
      if (res.data.valid) {
        toast.success(res.data.message || "Connection valid");
      } else {
        toast.error(res.data.error || "Validation failed");
      }
      onRefresh();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Connection test failed",
      );
    } finally {
      setTesting(false);
    }
  };

  const handleDisconnect = async () => {
    const ok = await confirm({
      title: `Disconnect ${integration.platform}?`,
      message:
        "This removes the connection. Past harvest history is preserved.",
      confirmLabel: "Disconnect",
      variant: "danger",
    });
    if (!ok) return;

    setDeleting(true);
    try {
      await deleteIntegration(projectId, integration.id);
      toast.success(`${integration.platform} disconnected`);
      onRefresh();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to disconnect",
      );
    } finally {
      setDeleting(false);
    }
  };

  const handleRerun = async (log: HarvestLog) => {
    setRerunningId(log.id);
    try {
      await rerunHarvest(projectId, integration.id, log.harvest_date);
      toast.success("Harvest rerun queued");
      loadLogs(logsOffset);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to queue rerun",
      );
    } finally {
      setRerunningId(null);
    }
  };

  const handleRunToday = async () => {
    const today = getLocalDateString();
    setRunningToday(true);
    try {
      await rerunHarvest(projectId, integration.id, today);
      toast.success(`Harvest queued for ${today}`);
      setLogsOffset(0);
      loadLogs(0);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to queue today's run",
      );
    } finally {
      setRunningToday(false);
    }
  };

  const handlePageChange = (newOffset: number) => {
    setLogsOffset(newOffset);
    loadLogs(newOffset);
  };

  const totalPages = Math.ceil(logsTotal / PAGE_SIZE);
  const currentPage = Math.floor(logsOffset / PAGE_SIZE) + 1;

  return (
    <div className="space-y-4">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
      >
        {/* Top row */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h4 className="text-base font-semibold text-gray-900 capitalize">
                {integration.label || integration.platform}
              </h4>
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${sv.className}`}
              >
                {sv.icon}
                {sv.label}
              </span>
            </div>
            {integration.connected_by && (
              <p className="text-xs text-gray-400 mt-0.5">
                Connected by {integration.connected_by}
              </p>
            )}
          </div>
        </div>

        {/* Health bar */}
        {successRate && (
          <div className="mb-4 rounded-lg bg-gray-50 border border-gray-100 px-3 py-2 text-xs text-gray-600 flex items-center gap-2">
            <Activity className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
            <span>
              {successRate.successful}/{successRate.total} runs successful
              {successRate.failed > 0 && (
                <span className="text-red-600 ml-1">
                  &middot; {successRate.failed} failed
                </span>
              )}
            </span>
          </div>
        )}

        {/* Error banner */}
        {integration.last_error && (
          <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700 flex items-start gap-2">
            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold">Last error: </span>
              {integration.last_error}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleRunToday}
            disabled={runningToday}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition disabled:opacity-50"
          >
            {runningToday ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <RotateCcw className="w-3.5 h-3.5" />
            )}
            Run Today
          </button>
          <button
            type="button"
            onClick={handleTest}
            disabled={testing}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 transition disabled:opacity-50"
          >
            {testing ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5" />
            )}
            Test Connection
          </button>
          <button
            type="button"
            onClick={handleDisconnect}
            disabled={deleting}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-red-200 bg-white text-red-600 hover:bg-red-50 transition disabled:opacity-50 ml-auto"
          >
            {deleting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Trash2 className="w-3.5 h-3.5" />
            )}
            Disconnect
          </button>
        </div>
      </motion.div>

      {/* Platform-specific content */}
      {children}

      {/* Activity log */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, delay: 0.15 }}
        className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden"
      >
        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-gray-500" />
            <h4 className="text-sm font-semibold text-gray-900">
              Harvest Activity
            </h4>
            {logsTotal > 0 && (
              <span className="text-xs text-gray-400">
                {logsTotal} total runs
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => loadLogs(logsOffset)}
            disabled={logsLoading}
            className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition disabled:opacity-50"
          >
            {logsLoading ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <RefreshCw className="w-3 h-3" />
            )}
            Refresh
          </button>
        </div>

        {logsLoading && logs.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm">
            <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
            Loading harvest history...
          </div>
        ) : logsError ? (
          <div className="p-6 text-center text-red-600 text-sm">
            {logsError}
          </div>
        ) : logs.length === 0 ? (
          <div className="p-8 text-center">
            <Inbox className="mx-auto mb-3 text-gray-300" size={28} />
            <p className="text-gray-400 text-sm">No harvest activity yet</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="text-left px-5 py-2 text-[11px] font-bold uppercase tracking-wider text-gray-500">
                      Report Date
                    </th>
                    <th className="text-left px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-gray-500">
                      Outcome
                    </th>
                    <th className="text-left px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-gray-500">
                      Rows
                    </th>
                    <th className="text-left px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-gray-500">
                      Error
                    </th>
                    <th className="text-right px-5 py-2 text-[11px] font-bold uppercase tracking-wider text-gray-500">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {logs.map((log) => {
                    const badge = OUTCOME_BADGE[log.outcome] ?? {
                      label: log.outcome,
                      className: "bg-gray-100 text-gray-500",
                    };
                    const isExpanded = expandedLogId === log.id;
                    const hasError = !!log.error || !!log.error_details;
                    const canRerun =
                      log.outcome === "failed" && log.retry_count < 3;

                    return (
                      <tr key={log.id} className="hover:bg-gray-50/50 group">
                        <td className="px-5 py-2 text-xs text-gray-500 whitespace-nowrap">
                          <div className="font-medium text-gray-700">
                            {formatReportDate(log.harvest_date)}
                          </div>
                          <div className="text-[11px] text-gray-400">
                            Ran {formatTimestamp(log.attempted_at)}
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${badge.className}`}
                          >
                            {badge.label}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-xs text-gray-600 font-mono">
                          {log.rows_fetched ?? "--"}
                        </td>
                        <td className="px-3 py-2 text-xs max-w-[280px]">
                          {hasError ? (
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedLogId(isExpanded ? null : log.id)
                              }
                              className="inline-flex items-center gap-1 text-red-600 hover:text-red-700 text-left"
                            >
                              <span className="truncate max-w-[220px] inline-block align-middle">
                                {log.error || "Error"}
                              </span>
                              <ChevronDown
                                className={`w-3 h-3 flex-shrink-0 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                              />
                            </button>
                          ) : (
                            <span className="text-gray-400">--</span>
                          )}
                        </td>
                        <td className="px-5 py-2 text-right">
                          {log.outcome === "failed" && (
                            <button
                              type="button"
                              onClick={() => handleRerun(log)}
                              disabled={!canRerun || rerunningId === log.id}
                              title={
                                !canRerun
                                  ? "Max retries reached"
                                  : "Rerun harvest"
                              }
                              className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded-md border border-gray-200 text-gray-600 hover:bg-gray-50 transition disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              {rerunningId === log.id ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <RotateCcw className="w-3 h-3" />
                              )}
                              Rerun
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Expanded error details */}
            <AnimatePresence>
              {expandedLogId && (
                <motion.div
                  key={`error-${expandedLogId}`}
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  {(() => {
                    const log = logs.find((l) => l.id === expandedLogId);
                    if (!log) return null;
                    return (
                      <div className="px-5 py-3 bg-red-50 border-t border-red-100 text-xs text-red-700">
                        {log.error && (
                          <div className="mb-1">
                            <span className="font-semibold">Error: </span>
                            {log.error}
                          </div>
                        )}
                        {log.error_details && (
                          <div>
                            <span className="font-semibold">Details: </span>
                            <pre className="mt-1 whitespace-pre-wrap font-mono text-[11px] bg-red-100/50 rounded p-2">
                              {log.error_details}
                            </pre>
                          </div>
                        )}
                        <div className="mt-1 text-red-500">
                          Retry count: {log.retry_count}/3
                        </div>
                      </div>
                    );
                  })()}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
                <span>
                  Page {currentPage} of {totalPages}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() =>
                      handlePageChange(logsOffset - PAGE_SIZE)
                    }
                    disabled={logsOffset === 0}
                    className="px-2 py-1 rounded hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Prev
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      handlePageChange(logsOffset + PAGE_SIZE)
                    }
                    disabled={currentPage >= totalPages}
                    className="px-2 py-1 rounded hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </motion.div>
    </div>
  );
}
