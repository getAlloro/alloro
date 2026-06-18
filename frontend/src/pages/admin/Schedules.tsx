import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  Clock,
  Play,
  Pause,
  Trash2,
  Plus,
  XCircle,
  Loader2,
  Timer,
  History,
  AlertCircle,
} from "lucide-react";
import {
  AdminPageHeader,
  ActionButton,
  EmptyState,
  Badge,
} from "../../components/ui/DesignSystem";
import { useConfirm } from "../../components/ui/ConfirmModal";
import {
  staggerContainer,
  cardVariants,
  expandCollapse,
  chevronVariants,
  modalVariants,
  backdropVariants,
} from "../../lib/animations";
import { QUERY_KEYS } from "../../lib/queryClient";
import { getErrorMessage } from "../../lib/errorMessage";
import {
  fetchSchedules,
  fetchRegistry,
  fetchServerTime,
  fetchScheduleRuns,
  createSchedule,
  updateSchedule,
  deleteSchedule,
  triggerScheduleRun,
  type Schedule,
  type ScheduleRun,
  type RegistryAgent,
} from "../../api/schedules";

// ── Helpers ─────────────────────────────────────────────────────────

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  return `${mins}m ${secs}s`;
}

function formatScheduleLabel(s: Schedule): string {
  if (s.schedule_type === "cron" && s.cron_expression) return cronToHuman(s.cron_expression);
  if (s.schedule_type === "interval_days" && s.interval_days) {
    return s.interval_days === 1 ? "Every day" : `Every ${s.interval_days} days`;
  }
  return "Unknown schedule";
}

function cronToHuman(cron: string): string {
  const parts = cron.split(" ");
  if (parts.length !== 5) return cron;
  const [min, hour, dom, , dow] = parts;
  if (dom === "*" && dow === "*") return `Daily at ${hour.padStart(2, "0")}:${min.padStart(2, "0")} UTC`;
  if (dow === "0" && dom === "*") return `Sundays at ${hour.padStart(2, "0")}:${min.padStart(2, "0")} UTC`;
  if (dom !== "*") return `Days ${dom} at ${hour.padStart(2, "0")}:${min.padStart(2, "0")} UTC`;
  if (min.startsWith("*/")) return `Every ${min.slice(2)} min`;
  return cron;
}

function getStatusBadgeProps(status: string): { color: "blue" | "green" | "red" | "gray"; label: string } {
  switch (status) {
    case "running": return { color: "blue", label: "Running" };
    case "completed": return { color: "green", label: "Completed" };
    case "failed": return { color: "red", label: "Failed" };
    default: return { color: "gray", label: status };
  }
}

// ── Countdown Hook ──────────────────────────────────────────────────

function useCountdown(targetIso: string | null, serverOffsetMs: number) {
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    if (!targetIso) { setRemaining(null); return; }
    const target = new Date(targetIso).getTime();
    const tick = () => {
      const diff = target - (Date.now() + serverOffsetMs);
      setRemaining(diff > 0 ? diff : 0);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [targetIso, serverOffsetMs]);

  if (remaining === null) return null;
  if (remaining <= 0) return "Due now";
  const totalSecs = Math.floor(remaining / 1000);
  const d = Math.floor(totalSecs / 86400);
  const h = Math.floor((totalSecs % 86400) / 3600);
  const m = Math.floor((totalSecs % 3600) / 60);
  const s = totalSecs % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  return `${m}m ${s}s`;
}

// ── Countdown Cell ──────────────────────────────────────────────────

function CountdownCell({ nextRunAt, serverOffset }: { nextRunAt: string | null; serverOffset: number }) {
  const text = useCountdown(nextRunAt, serverOffset);
  if (!text) return <span className="text-gray-400 text-sm">-</span>;
  const isDue = text === "Due now";
  return (
    <span className={`inline-flex items-center gap-1.5 font-mono text-sm ${isDue ? "text-alloro-orange font-semibold" : "text-gray-600"}`}>
      {isDue
        ? <><AlertCircle className="h-3.5 w-3.5" /> {text}</>
        : <><Timer className="h-3.5 w-3.5 text-gray-400" /> {text}</>
      }
    </span>
  );
}

// ── Run History Panel ───────────────────────────────────────────────

function RunHistory({ scheduleId }: { scheduleId: number }) {
  const { data, isLoading } = useQuery({
    queryKey: QUERY_KEYS.adminScheduleRuns(scheduleId),
    queryFn: () => fetchScheduleRuns(scheduleId),
    staleTime: 10_000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-6 px-6 text-gray-400 text-sm">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading history...
      </div>
    );
  }

  const runs = data?.runs || [];
  if (runs.length === 0) {
    return <p className="py-6 px-6 text-gray-400 text-sm">No runs recorded yet.</p>;
  }

  return (
    <div className="max-h-72 overflow-y-auto">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-gray-50/95 backdrop-blur-sm">
          <tr className="text-left text-gray-500 text-xs uppercase tracking-wider border-b border-gray-100">
            <th className="px-6 py-2.5 font-medium">Status</th>
            <th className="px-6 py-2.5 font-medium">Started</th>
            <th className="px-6 py-2.5 font-medium">Duration</th>
            <th className="px-6 py-2.5 font-medium">Details</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {runs.map((run: ScheduleRun) => {
            const badge = getStatusBadgeProps(run.status);
            return (
              <tr key={run.id} className="hover:bg-gray-50/50 transition-colors">
                <td className="px-6 py-3">
                  <Badge color={badge.color}>{badge.label}</Badge>
                </td>
                <td className="px-6 py-3 text-gray-600 tabular-nums">
                  {new Date(run.started_at).toLocaleString()}
                </td>
                <td className="px-6 py-3 text-gray-600 tabular-nums">
                  {run.duration_ms != null ? formatDuration(run.duration_ms) : "-"}
                </td>
                <td className="px-6 py-3 text-gray-500 max-w-xs truncate text-xs">
                  {run.error || (run.summary ? JSON.stringify(run.summary) : "-")}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Create Schedule Modal ───────────────────────────────────────────

function CreateScheduleModal({
  registry,
  existingKeys,
  onClose,
  onCreated,
}: {
  registry: RegistryAgent[];
  existingKeys: string[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const available = registry.filter((a) => !existingKeys.includes(a.key));
  const [agentKey, setAgentKey] = useState(available[0]?.key || "");
  const [scheduleType, setScheduleType] = useState<"cron" | "interval_days">("cron");
  const [cronExpression, setCronExpression] = useState("0 6 * * *");
  const [intervalDays, setIntervalDays] = useState(15);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selected = registry.find((a) => a.key === agentKey);

  const handleSubmit = async () => {
    setSaving(true);
    setError(null);
    try {
      await createSchedule({
        agent_key: agentKey,
        display_name: selected?.displayName || agentKey,
        description: selected?.description,
        schedule_type: scheduleType,
        cron_expression: scheduleType === "cron" ? cronExpression : undefined,
        interval_days: scheduleType === "interval_days" ? intervalDays : undefined,
        enabled: true,
      });
      onCreated();
      onClose();
    } catch (err: unknown) {
      setError(getErrorMessage(err) || "Failed to create schedule");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
        variants={backdropVariants}
        initial="hidden"
        animate="visible"
        exit="exit"
        onClick={onClose}
      >
        <motion.div
          variants={modalVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
          className="bg-white rounded-2xl shadow-2xl border border-gray-200 p-6 max-w-md w-full mx-4"
          onClick={(e) => e.stopPropagation()}
        >
          <h3 className="text-lg font-semibold text-gray-900 mb-5">Add Schedule</h3>

          {available.length === 0 ? (
            <>
              <p className="text-gray-500 text-sm">All registered agents already have schedules.</p>
              <div className="flex justify-end mt-5">
                <ActionButton label="Close" onClick={onClose} variant="secondary" size="sm" />
              </div>
            </>
          ) : (
            <div className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Agent</label>
                <select
                  value={agentKey}
                  onChange={(e) => setAgentKey(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 bg-white focus:outline-none focus:border-alloro-orange focus:ring-2 focus:ring-alloro-orange/20 transition-all"
                >
                  {available.map((a) => (
                    <option key={a.key} value={a.key}>{a.displayName}</option>
                  ))}
                </select>
                {selected && <p className="mt-1.5 text-xs text-gray-500">{selected.description}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Schedule Type</label>
                <div className="flex gap-2">
                  {(["cron", "interval_days"] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setScheduleType(t)}
                      className={`flex-1 px-3 py-2.5 rounded-xl text-sm font-medium border transition-all ${
                        scheduleType === t
                          ? "bg-alloro-orange/10 text-alloro-orange border-alloro-orange/30"
                          : "bg-white text-gray-600 border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                      }`}
                    >
                      {t === "cron" ? "Cron" : "Interval (Days)"}
                    </button>
                  ))}
                </div>
              </div>

              {scheduleType === "cron" ? (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Cron Expression</label>
                  <input
                    value={cronExpression}
                    onChange={(e) => setCronExpression(e.target.value)}
                    placeholder="0 6 * * *"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-mono text-gray-900 focus:outline-none focus:border-alloro-orange focus:ring-2 focus:ring-alloro-orange/20 transition-all"
                  />
                  <p className="mt-1.5 text-xs text-gray-500">{cronToHuman(cronExpression)}</p>
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Run every N days</label>
                  <input
                    type="number"
                    min={1}
                    value={intervalDays}
                    onChange={(e) => setIntervalDays(Number(e.target.value))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:border-alloro-orange focus:ring-2 focus:ring-alloro-orange/20 transition-all"
                  />
                </div>
              )}

              {error && (
                <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5 text-sm text-red-700">
                  <XCircle className="h-4 w-4 flex-shrink-0" /> {error}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-1">
                <ActionButton label="Cancel" onClick={onClose} variant="secondary" size="md" />
                <ActionButton
                  label="Create"
                  icon={<Plus className="h-4 w-4" />}
                  onClick={handleSubmit}
                  variant="primary"
                  size="md"
                  disabled={saving}
                  loading={saving}
                />
              </div>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// ── Schedule Card ───────────────────────────────────────────────────

function ScheduleCard({
  schedule,
  serverOffset,
  onRefresh,
  index,
}: {
  schedule: Schedule;
  serverOffset: number;
  onRefresh: () => void;
  index: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [triggering, setTriggering] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const queryClient = useQueryClient();
  const confirm = useConfirm();

  const handleToggle = async () => {
    setToggling(true);
    try {
      await updateSchedule(schedule.id, { enabled: !schedule.enabled });
      onRefresh();
    } finally {
      setToggling(false);
    }
  };

  const handleTrigger = async () => {
    setTriggering(true);
    try {
      await triggerScheduleRun(schedule.id);
      setTimeout(() => {
        onRefresh();
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.adminScheduleRuns(schedule.id) });
      }, 1000);
    } finally {
      setTriggering(false);
    }
  };

  const handleDelete = async () => {
    const ok = await confirm({
      title: "Delete Schedule",
      message: `Remove "${schedule.display_name}" and all its run history?`,
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (!ok) return;
    setDeleting(true);
    try {
      await deleteSchedule(schedule.id);
      onRefresh();
    } finally {
      setDeleting(false);
    }
  };

  const latestRun = schedule.latest_run;
  const isRunning = latestRun?.status === "running";

  return (
    <motion.div
      variants={cardVariants}
      custom={index}
      className="rounded-2xl border border-gray-200 bg-white shadow-sm hover:shadow-md transition-shadow overflow-hidden"
    >
      {/* Main Row */}
      <div className="flex items-center gap-4 px-6 py-5">
        {/* Expand chevron */}
        <motion.button
          onClick={() => setExpanded(!expanded)}
          className="text-gray-400 hover:text-gray-600 transition-colors p-1"
          animate={expanded ? "expanded" : "collapsed"}
          variants={chevronVariants}
          aria-label={expanded ? "Collapse run history" : "Expand run history"}
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </motion.button>

        {/* Agent icon + info */}
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-alloro-orange/10 flex items-center justify-center flex-shrink-0">
            <Clock className="h-5 w-5 text-alloro-orange" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-gray-900 truncate">{schedule.display_name}</h3>
              {!schedule.enabled && <Badge color="gray">Paused</Badge>}
            </div>
            <p className="text-xs text-gray-500 mt-0.5">{formatScheduleLabel(schedule)}</p>
          </div>
        </div>

        {/* Last run */}
        <div className="hidden sm:flex flex-col items-end w-28">
          <span className="text-xs text-gray-400 mb-1">Last run</span>
          {latestRun ? (
            <Badge {...getStatusBadgeProps(latestRun.status)} label={getStatusBadgeProps(latestRun.status).label} />
          ) : (
            <span className="text-xs text-gray-400">Never</span>
          )}
        </div>

        {/* Countdown */}
        <div className="hidden md:flex flex-col items-end w-36">
          <span className="text-xs text-gray-400 mb-1">Next run</span>
          {schedule.enabled ? (
            <CountdownCell nextRunAt={schedule.next_run_at} serverOffset={serverOffset} />
          ) : (
            <span className="text-xs text-gray-400">-</span>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1.5">
          <motion.button
            onClick={handleTrigger}
            disabled={triggering || isRunning}
            title="Run Now"
            className="p-2 rounded-xl border border-gray-200 bg-white hover:bg-emerald-50 hover:border-emerald-200 text-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            aria-label="Run now"
          >
            {triggering ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          </motion.button>

          <motion.button
            onClick={handleToggle}
            disabled={toggling}
            title={schedule.enabled ? "Pause schedule" : "Enable schedule"}
            className={`p-2 rounded-xl border transition-all ${
              schedule.enabled
                ? "border-gray-200 bg-white hover:bg-amber-50 hover:border-amber-200 text-amber-500"
                : "border-gray-200 bg-white hover:bg-emerald-50 hover:border-emerald-200 text-gray-400 hover:text-emerald-600"
            }`}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            aria-label={schedule.enabled ? "Pause" : "Enable"}
          >
            {toggling ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pause className="h-4 w-4" />}
          </motion.button>

          <motion.button
            onClick={handleDelete}
            disabled={deleting}
            title="Delete schedule"
            className="p-2 rounded-xl border border-gray-200 bg-white hover:bg-red-50 hover:border-red-200 text-gray-400 hover:text-red-500 transition-all"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            aria-label="Delete"
          >
            {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
          </motion.button>
        </div>
      </div>

      {/* Expanded: Run History */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            variants={expandCollapse}
            initial="collapsed"
            animate="expanded"
            exit="collapsed"
            className="border-t border-gray-100 bg-gray-50/50 overflow-hidden"
          >
            <div className="flex items-center gap-2 px-6 pt-4 pb-1">
              <History className="h-3.5 w-3.5 text-gray-400" />
              <span className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Run History</span>
            </div>
            <RunHistory scheduleId={schedule.id} />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ── Main Page ───────────────────────────────────────────────────────

export default function Schedules() {
  const [showCreate, setShowCreate] = useState(false);
  const serverOffsetRef = useRef(0);

  useEffect(() => {
    fetchServerTime().then((serverIso) => {
      serverOffsetRef.current = new Date(serverIso).getTime() - Date.now();
    }).catch(() => {});
  }, []);

  const { data: schedules = [], isLoading, refetch } = useQuery({
    queryKey: QUERY_KEYS.adminSchedules,
    queryFn: fetchSchedules,
    refetchInterval: 30_000,
  });

  const { data: registry = [] } = useQuery({
    queryKey: ["admin", "schedules", "registry"],
    queryFn: fetchRegistry,
    staleTime: 60_000,
  });

  const handleRefresh = useCallback(() => { refetch(); }, [refetch]);

  return (
    <div>
      <AdminPageHeader
        icon={<Clock className="h-6 w-6" />}
        title="Schedules"
        description="Manage scheduled agent runs, view history, and monitor upcoming executions."
        actionButtons={
          <ActionButton
            label="Add Schedule"
            icon={<Plus className="h-4 w-4" />}
            onClick={() => setShowCreate(true)}
            variant="primary"
            size="md"
          />
        }
      />

      {isLoading ? (
        <div className="flex items-center justify-center py-20 text-gray-400">
          <Loader2 className="h-6 w-6 animate-spin mr-3" />
          <span className="text-sm font-medium">Loading schedules...</span>
        </div>
      ) : schedules.length === 0 ? (
        <EmptyState
          icon={<Clock className="w-8 h-8" />}
          title="No schedules yet"
          description="Create a schedule to automate agent runs on a recurring basis."
          action={{ label: "Add Schedule", onClick: () => setShowCreate(true) }}
        />
      ) : (
        <motion.div
          className="space-y-3"
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
        >
          {schedules.map((s: Schedule, i: number) => (
            <ScheduleCard
              key={s.id}
              schedule={s}
              serverOffset={serverOffsetRef.current}
              onRefresh={handleRefresh}
              index={i}
            />
          ))}
        </motion.div>
      )}

      {showCreate && (
        <CreateScheduleModal
          registry={registry}
          existingKeys={schedules.map((s: Schedule) => s.agent_key)}
          onClose={() => setShowCreate(false)}
          onCreated={handleRefresh}
        />
      )}
    </div>
  );
}
