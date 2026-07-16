import { useCallback, useEffect, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Check,
  Loader2,
  Clock,
  AlertCircle,
  FileText,
  Bot,
  CheckCircle2,
  RefreshCw,
} from "lucide-react";
import {
  fetchAutomationStatus,
  retryPmsStep,
  restartPmsJob,
  getRetryableStep,
  type AutomationStatusDetail,
  type StepKey,
  type StepDetail,
  STEP_CONFIG,
  MONTHLY_AGENT_CONFIG,
} from "../../../api/pms";
import { logger } from "../../../lib/logger";

interface PMSAutomationProgressDropdownProps {
  jobId: number;
  initialStatus?: AutomationStatusDetail | null;
  onStatusChange?: (status: AutomationStatusDetail | null) => void;
  onRetryInitiated?: () => void;
}

const POLL_INTERVAL_MS = 3000;

// Step order for rendering
const STEP_ORDER: StepKey[] = [
  "file_upload",
  "pms_parser",
  "admin_approval",
  "client_approval",
  "monthly_agents",
  "complete",
];

// Icons for each step
const STEP_ICONS: Record<
  StepKey,
  React.ComponentType<{ className?: string }>
> = {
  file_upload: FileText,
  pms_parser: Bot,
  admin_approval: CheckCircle2,
  client_approval: CheckCircle2,
  monthly_agents: Bot,
  complete: Check,
};

function getStepStatusIcon(
  stepDetail: StepDetail | undefined,
  isCurrentStep: boolean
) {
  if (!stepDetail) {
    return <Clock className="h-4 w-4 text-gray-300" />;
  }

  switch (stepDetail.status) {
    case "completed":
      return <Check className="h-4 w-4 text-green-500" />;
    case "processing":
      return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
    case "failed":
      return <AlertCircle className="h-4 w-4 text-red-500" />;
    case "skipped":
      return <span className="text-gray-400 text-xs">—</span>;
    case "pending":
    default:
      if (isCurrentStep) {
        return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
      }
      return <Clock className="h-4 w-4 text-gray-300" />;
  }
}

function getStepStatusClass(
  stepDetail: StepDetail | undefined,
  isCurrentStep: boolean
): string {
  if (!stepDetail) {
    return "text-gray-400";
  }

  switch (stepDetail.status) {
    case "completed":
      return "text-green-700";
    case "processing":
      return "text-blue-600";
    case "failed":
      return "text-red-600";
    case "skipped":
      return "text-gray-400 line-through";
    case "pending":
    default:
      if (isCurrentStep) {
        return "text-blue-600";
      }
      return "text-gray-500";
  }
}

function getProgressBarColor(status: AutomationStatusDetail["status"]): string {
  switch (status) {
    case "completed":
      return "bg-green-500";
    case "failed":
      return "bg-red-500";
    case "processing":
    case "awaiting_approval":
      return "bg-blue-500";
    default:
      return "bg-gray-300";
  }
}

function getStatusBadge(status: AutomationStatusDetail["status"]) {
  switch (status) {
    case "completed":
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">
          <Check className="h-3 w-3" />
          Complete
        </span>
      );
    case "failed":
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
          <AlertCircle className="h-3 w-3" />
          Failed
        </span>
      );
    case "processing":
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700">
          <Loader2 className="h-3 w-3 animate-spin" />
          Processing
        </span>
      );
    case "awaiting_approval":
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-semibold text-yellow-700">
          <Clock className="h-3 w-3" />
          Awaiting Approval
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-700">
          <Clock className="h-3 w-3" />
          Pending
        </span>
      );
  }
}

export function PMSAutomationProgressDropdown({
  jobId,
  initialStatus,
  onStatusChange,
  onRetryInitiated,
}: PMSAutomationProgressDropdownProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [automationStatus, setAutomationStatus] =
    useState<AutomationStatusDetail | null>(initialStatus ?? null);
  const [isPolling, setIsPolling] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);
  const [isRestarting, setIsRestarting] = useState(false);
  const [restartError, setRestartError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const response = await fetchAutomationStatus(jobId);
      if (response.success && response.data?.automationStatus) {
        setAutomationStatus(response.data.automationStatus);
        onStatusChange?.(response.data.automationStatus);
      }
    } catch (error) {
      logger.error("Failed to fetch automation status:", error);
    }
  }, [jobId, onStatusChange]);

  // Poll when expanded and status is not terminal
  useEffect(() => {
    if (!isExpanded) {
      setIsPolling(false);
      return;
    }

    // Don't poll if status is terminal
    if (
      automationStatus?.status === "completed" ||
      automationStatus?.status === "failed"
    ) {
      setIsPolling(false);
      return;
    }

    setIsPolling(true);

    // Fetch immediately on expand
    fetchStatus();

    // Set up polling interval
    const interval = setInterval(fetchStatus, POLL_INTERVAL_MS);

    return () => {
      clearInterval(interval);
    };
  }, [isExpanded, automationStatus?.status, fetchStatus]);

  // Handle retry
  const handleRetry = useCallback(async () => {
    const retryableStep = getRetryableStep(automationStatus);
    if (!retryableStep) {
      setRetryError("No retryable step found");
      return;
    }

    setIsRetrying(true);
    setRetryError(null);

    try {
      const response = await retryPmsStep(jobId, retryableStep);

      if (response.success) {
        // Refresh status after successful retry initiation
        await fetchStatus();
        onRetryInitiated?.();
      } else {
        setRetryError(response.error || "Retry failed");
      }
    } catch (error) {
      logger.error("Retry error:", error);
      setRetryError("Failed to initiate retry");
    } finally {
      setIsRetrying(false);
    }
  }, [jobId, automationStatus, fetchStatus, onRetryInitiated]);

  // Handle restart of completed run
  const handleRestart = useCallback(async () => {
    if (!confirm("This will delete all results from this run and re-trigger the monthly agents. Continue?")) {
      return;
    }

    setIsRestarting(true);
    setRestartError(null);

    try {
      const response = await restartPmsJob(jobId);

      if (response.success) {
        await fetchStatus();
        onRetryInitiated?.();
      } else {
        setRestartError(response.error || "Restart failed");
      }
    } catch (error) {
      logger.error("Restart error:", error);
      setRestartError("Failed to restart run");
    } finally {
      setIsRestarting(false);
    }
  }, [jobId, fetchStatus, onRetryInitiated]);

  // Handle case where there's no automation status
  if (!automationStatus) {
    return (
      <div className="text-xs text-gray-400 italic">No automation tracking</div>
    );
  }

  const { status, currentStep, message, progress, steps, summary } =
    automationStatus;

  // Determine if retry is available and which step
  const retryableStep = getRetryableStep(automationStatus);
  const retryStepLabel = retryableStep
    ? STEP_CONFIG[retryableStep]?.label
    : null;

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 overflow-hidden">
      {/* Header / Toggle Button */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition hover:bg-gray-100"
      >
        <div className="flex items-center gap-3 min-w-0">
          {getStatusBadge(status)}
          <span className="text-sm text-gray-600 truncate">{message}</span>
          {isPolling && (
            <Loader2 className="h-3 w-3 animate-spin text-gray-400 flex-shrink-0" />
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-xs font-medium text-gray-500">{progress}%</span>
          {isExpanded ? (
            <ChevronUp className="h-4 w-4 text-gray-400" />
          ) : (
            <ChevronDown className="h-4 w-4 text-gray-400" />
          )}
        </div>
      </button>

      {/* Progress Bar */}
      <div className="h-1 bg-gray-200">
        <div
          className={`h-full transition-all duration-500 ${getProgressBarColor(
            status
          )}`}
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="px-3 py-3 space-y-3 border-t border-gray-200">
          {/* Steps List */}
          <div className="space-y-2">
            {STEP_ORDER.map((stepKey) => {
              const stepDetail = steps[stepKey];
              const config = STEP_CONFIG[stepKey];
              const Icon = STEP_ICONS[stepKey];
              const isCurrentStep = currentStep === stepKey;

              // Get sub-step message for monthly_agents
              let stepMessage = config.label;
              if (stepKey === "monthly_agents" && stepDetail?.currentAgent) {
                const agentConfig =
                  MONTHLY_AGENT_CONFIG[stepDetail.currentAgent];
                if (agentConfig) {
                  stepMessage = `${config.label}: ${agentConfig.label}`;
                }
              }

              return (
                <div
                  key={stepKey}
                  className={`flex items-center gap-3 py-1 ${
                    isCurrentStep ? "bg-blue-50 -mx-3 px-3 rounded" : ""
                  }`}
                >
                  <div className="flex-shrink-0 w-5">
                    {getStepStatusIcon(stepDetail, isCurrentStep)}
                  </div>
                  <Icon
                    className={`h-4 w-4 flex-shrink-0 ${getStepStatusClass(
                      stepDetail,
                      isCurrentStep
                    )}`}
                  />
                  <span
                    className={`text-sm flex-1 ${getStepStatusClass(
                      stepDetail,
                      isCurrentStep
                    )}`}
                  >
                    {stepMessage}
                  </span>
                  {stepDetail?.completedAt &&
                    stepDetail.status === "completed" && (
                      <span className="text-xs text-gray-400">
                        {new Date(stepDetail.completedAt).toLocaleTimeString()}
                      </span>
                    )}
                </div>
              );
            })}
          </div>

          {/* Monthly Agents Progress (when in monthly_agents step) */}
          {currentStep === "monthly_agents" &&
            steps.monthly_agents?.agentsCompleted && (
              <div className="bg-white rounded border border-gray-200 p-2">
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  Agent Progress
                </div>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(MONTHLY_AGENT_CONFIG).map(([key, config]) => {
                    const agentKey = key as keyof typeof MONTHLY_AGENT_CONFIG;
                    const isCompleted =
                      steps.monthly_agents?.agentsCompleted?.includes(agentKey);
                    const isCurrent =
                      steps.monthly_agents?.currentAgent === agentKey;

                    return (
                      <span
                        key={key}
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                          isCompleted
                            ? "bg-green-100 text-green-700"
                            : isCurrent
                            ? "bg-blue-100 text-blue-700"
                            : "bg-gray-100 text-gray-500"
                        }`}
                      >
                        {isCompleted ? (
                          <Check className="h-3 w-3" />
                        ) : isCurrent ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Clock className="h-3 w-3" />
                        )}
                        {config.label}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}

          {/* Summary (when completed) */}
          {status === "completed" && summary && (
            <div className="bg-green-50 rounded border border-green-200 p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs font-semibold text-green-700 uppercase tracking-wide">
                  ✓ Automation Complete
                </div>
                <button
                  type="button"
                  onClick={handleRestart}
                  disabled={isRestarting}
                  className="inline-flex items-center gap-1.5 rounded-md bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isRestarting ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5" />
                  )}
                  {isRestarting ? "Restarting..." : "Restart Run"}
                </button>
              </div>
              {restartError && (
                <p className="text-sm text-red-600 mb-2">
                  Restart error: {restartError}
                </p>
              )}
              <div className="text-sm">
                {summary.duration && (
                  <div>
                    <span className="text-gray-500">Duration:</span>
                    <span className="ml-2 font-semibold text-gray-900">
                      {summary.duration}
                    </span>
                  </div>
                )}
              </div>
              {summary.agentResults && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {Object.entries(summary.agentResults)
                    // Filter out disabled agents (Opportunity, CRO Optimizer)
                    // — they're never run today (`if (false)` blocks in
                    // service.agent-orchestrator.ts) but legacy automation
                    // status rows still list them with resultId 0.
                    .filter(
                      ([key]) => key !== "opportunity" && key !== "cro_optimizer"
                    )
                    .map(([key, result]) => (
                      <span
                        key={key}
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${
                          result?.success
                            ? "bg-green-100 text-green-700"
                            : "bg-red-100 text-red-700"
                        }`}
                      >
                        {result?.success ? (
                          <Check className="h-3 w-3" />
                        ) : (
                          <AlertCircle className="h-3 w-3" />
                        )}
                        {key.replace(/_/g, " ")}
                        {result?.resultId && (
                          <span className="text-xs opacity-70">
                            #{result.resultId}
                          </span>
                        )}
                      </span>
                    ))}
                </div>
              )}
            </div>
          )}

          {/* Error Display with Retry Button */}
          {status === "failed" && (
            <div className="bg-red-50 rounded border border-red-200 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="text-xs font-semibold text-red-700 uppercase tracking-wide mb-1">
                    Error
                  </div>
                  {automationStatus.error && (
                    <p className="text-sm text-red-600">
                      {automationStatus.error}
                    </p>
                  )}
                  {retryError && (
                    <p className="text-sm text-red-600 mt-1">
                      Retry error: {retryError}
                    </p>
                  )}
                </div>
                {retryableStep && (
                  <button
                    type="button"
                    onClick={handleRetry}
                    disabled={isRetrying}
                    className="inline-flex items-center gap-1.5 rounded-md bg-red-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
                  >
                    {isRetrying ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3.5 w-3.5" />
                    )}
                    {isRetrying ? "Retrying..." : `Re-run ${retryStepLabel}`}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Timestamps */}
          <div className="text-xs text-gray-400 flex justify-between">
            <span>
              Started: {new Date(automationStatus.startedAt).toLocaleString()}
            </span>
            {automationStatus.completedAt && (
              <span>
                Completed:{" "}
                {new Date(automationStatus.completedAt).toLocaleString()}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default PMSAutomationProgressDropdown;
