import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { AnimatePresence, motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { CalendarRange, Filter, Target, Trash2, TrendingUp, UserRound } from "lucide-react";
import { Area, Line, LineChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import {
  fetchAssignedStats,
  fetchAssignedTasks,
  fetchAssignedVelocity,
  fetchMyStats,
  fetchMyTasks,
  fetchMyVelocity,
  fetchPmUsers,
} from "../../api/pm";
import type { PmMyStats, PmMyTask, PmMyTasksResponse, PmUser, PmVelocityData } from "../../types/pm";
import { showErrorToast } from "../../lib/toast";
import { usePmStore } from "../../stores/pmStore";
import { getCurrentUserId } from "../../utils/currentUser";
import { BulkActionBar } from "../ui/DesignSystem";
import { CreateTaskModal } from "./CreateTaskModal";
import { MeKanbanBoard, type MeKanbanAddColumn } from "./MeKanbanBoard";
import { NotificationCard } from "./NotificationCard";
import { TaskDetailPanel } from "./TaskDetailPanel";
import type { TaskContextAction } from "./TaskCard";

const RANGES = ["7d", "4w", "3m"] as const;
const CREATE_COLUMN_LABELS: Record<MeKanbanAddColumn, "To Do" | "In Progress"> = {
  todo: "To Do",
  in_progress: "In Progress",
};
const SEVERITY_COLORS: Record<string, string> = {
  green: "#3D8B40",
  amber: "#D4920A",
  red: "#C43333",
};

type Range = typeof RANGES[number];
type AssigneeFilters = {
  projectId: string;
  priority: string;
  overdueOnly: boolean;
};

type VelocityTooltipPayload = {
  dataKey?: string;
  value?: number | string;
};

export type AssigneeTabViewProps = {
  userId?: number | null;
  showUserPicker?: boolean;
  onUserChange?: (userId: number) => void;
};

function AnimatedNum({ value }: { value: number }) {
  const mv = useMotionValue(0);
  const spring = useSpring(mv, { stiffness: 50, damping: 15 });
  const display = useTransform(spring, (v) => Math.round(v));
  const [current, setCurrent] = useState(0);
  useEffect(() => { mv.set(value); }, [value, mv]);
  useEffect(() => display.on("change", setCurrent), [display]);
  return <span>{current}</span>;
}

function isOverdue(task: PmMyTask): boolean {
  return !!task.deadline && !task.completed_at && new Date(task.deadline) < new Date();
}

function applyFilters(tasks: PmMyTasksResponse | null, filters: AssigneeFilters): PmMyTasksResponse | null {
  if (!tasks) return null;
  const apply = (items: PmMyTask[]) =>
    items.filter((task) => {
      if (filters.projectId !== "all" && task.project_id !== filters.projectId) return false;
      if (filters.priority !== "all" && task.priority !== filters.priority) return false;
      if (filters.overdueOnly && !isOverdue(task)) return false;
      return true;
    });
  return {
    todo: apply(tasks.todo),
    in_progress: apply(tasks.in_progress),
    done: apply(tasks.done),
  };
}

function VelocityTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: VelocityTooltipPayload[];
  label?: ReactNode;
}) {
  if (!active || !payload?.length) return null;
  const completed = Number(payload.find((p) => p.dataKey === "completed")?.value ?? 0);
  const overdue = Number(payload.find((p) => p.dataKey === "overdue")?.value ?? 0);
  return (
    <div className="rounded-lg px-3 py-2" style={{ backgroundColor: "var(--color-pm-bg-tertiary)", border: "1px solid var(--color-pm-border)", boxShadow: "var(--pm-shadow-elevated)" }}>
      <p className="mb-1 text-[12px] font-semibold" style={{ color: "var(--color-pm-text-primary)" }}>{label}</p>
      <p className="text-[11px]" style={{ color: "#3D8B40" }}>{completed} completed</p>
      {overdue > 0 && <p className="text-[11px]" style={{ color: "#C43333" }}>{overdue} overdue</p>}
    </div>
  );
}

export function AssigneeTabView({
  userId = null,
  showUserPicker = false,
  onUserChange,
}: AssigneeTabViewProps) {
  const [stats, setStats] = useState<PmMyStats | null>(null);
  const [velocity, setVelocity] = useState<PmVelocityData | null>(null);
  const [tasks, setTasks] = useState<PmMyTasksResponse | null>(null);
  const [users, setUsers] = useState<PmUser[]>([]);
  const [velocityRange, setVelocityRange] = useState<Range>("7d");
  const [highlightedTaskId, setHighlightedTaskId] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<PmMyTask | null>(null);
  const [bulkDeleteCount, setBulkDeleteCount] = useState<number | null>(null);
  const [createColumn, setCreateColumn] = useState<MeKanbanAddColumn | null>(null);
  const [filters, setFilters] = useState<AssigneeFilters>({
    projectId: "all",
    priority: "all",
    overdueOnly: false,
  });
  const meSelectedTaskIds = usePmStore((s) => s.meSelectedTaskIds);
  const toggleMeTaskSelection = usePmStore((s) => s.toggleMeTaskSelection);
  const clearMeTaskSelection = usePmStore((s) => s.clearMeTaskSelection);
  const bulkDeleteMeSelectedTasks = usePmStore((s) => s.bulkDeleteMeSelectedTasks);

  const selectedUser = users.find((user) => user.id === userId) ?? null;
  const isMe = !showUserPicker;
  const label = isMe ? "Mine" : selectedUser?.display_name ?? "Assignee";
  const createAssigneeId = isMe ? getCurrentUserId() : userId;
  const createColumnName = createColumn ? CREATE_COLUMN_LABELS[createColumn] : undefined;

  useEffect(() => {
    clearMeTaskSelection();
  }, [clearMeTaskSelection, userId]);

  useEffect(() => {
    if (!showUserPicker) return;
    fetchPmUsers().then(setUsers).catch(() => setUsers([]));
  }, [showUserPicker]);

  useEffect(() => {
    if (showUserPicker && !userId && users.length > 0) {
      onUserChange?.(users[0].id);
    }
  }, [onUserChange, showUserPicker, userId, users]);

  const loadData = useCallback(async () => {
    if (showUserPicker && !userId) return;
    const [s, v, t] = await Promise.allSettled([
      userId ? fetchAssignedStats(userId) : fetchMyStats(),
      userId ? fetchAssignedVelocity(userId, velocityRange) : fetchMyVelocity(velocityRange),
      userId ? fetchAssignedTasks(userId) : fetchMyTasks(),
    ]);
    if (s.status === "fulfilled") setStats(s.value);
    if (v.status === "fulfilled") setVelocity(v.value);
    if (t.status === "fulfilled") setTasks(t.value);
  }, [showUserPicker, userId, velocityRange]);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 60_000);
    return () => clearInterval(interval);
  }, [loadData]);

  const filteredTasks = useMemo(() => applyFilters(tasks, filters), [tasks, filters]);
  const allTasks = useMemo<PmMyTask[]>(() => {
    if (!filteredTasks) return [];
    return [...filteredTasks.todo, ...filteredTasks.in_progress, ...filteredTasks.done];
  }, [filteredTasks]);
  const projects = useMemo(() => {
    const map = new Map<string, string>();
    for (const task of [...(tasks?.todo ?? []), ...(tasks?.in_progress ?? []), ...(tasks?.done ?? [])]) {
      map.set(task.project_id, task.project_name);
    }
    return Array.from(map, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [tasks]);

  const handleTaskClick = useCallback((taskId: string) => {
    setHighlightedTaskId(taskId);
    setTimeout(() => setHighlightedTaskId(null), 2000);
    document.getElementById(`me-task-${taskId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);

  const handleContextAction = useCallback(
    async (action: TaskContextAction, taskId: string) => {
      const ids = meSelectedTaskIds.has(taskId) ? [...meSelectedTaskIds] : [taskId];
      if (action.type === "delete") {
        setBulkDeleteCount(ids.length);
        return;
      }
      if (action.type === "open" || action.type === "assign") {
        const task = allTasks.find((item) => item.id === taskId);
        if (task) setSelectedTask(task);
      }
    },
    [allTasks, meSelectedTaskIds]
  );

  const handleBulkDelete = useCallback(async () => {
    try {
      await bulkDeleteMeSelectedTasks();
      await loadData();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Try again";
      showErrorToast("Delete failed", message);
    } finally {
      setBulkDeleteCount(null);
    }
  }, [bulkDeleteMeSelectedTasks, loadData]);

  const selectionCount = meSelectedTaskIds.size;
  const focusSeverity = stats?.focus_today.severity ?? "green";

  return (
    <div className="mx-auto max-w-[1400px] space-y-6">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <SummaryCard icon={<Target className="h-5 w-5" strokeWidth={1.5} />} label="Focus Today" badge={label} value={stats?.focus_today.count ?? 0} subtitle={stats?.focus_today.subtitle ?? "--"} color={SEVERITY_COLORS[focusSeverity]} />
        <SummaryCard icon={<CalendarRange className="h-5 w-5" strokeWidth={1.5} />} label="This Week" badge={label} value={stats?.this_week.count ?? 0} subtitle={stats?.this_week.subtitle ?? "--"} color="var(--color-pm-text-primary)" />
        {isMe ? <NotificationCard onTaskClick={handleTaskClick} /> : <AssigneePicker users={users} userId={userId} onUserChange={onUserChange} />}
      </div>

      <div className="rounded-[14px] p-5" style={{ backgroundColor: "var(--color-pm-bg-secondary)", boxShadow: "var(--pm-shadow-card)", border: "1px solid var(--color-pm-border)" }}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4" strokeWidth={1.5} style={{ color: "#D66853" }} />
            <span className="text-[13px] font-semibold" style={{ color: "var(--color-pm-text-primary)" }}>{label} Velocity</span>
            {velocity && <span className="text-[11px]" style={{ color: "var(--color-pm-text-muted)" }}>{velocity.completed_total} completed - {velocity.overdue_total} overdue</span>}
          </div>
          <RangePicker value={velocityRange} onChange={setVelocityRange} />
        </div>
        <ResponsiveContainer width="100%" height={140}>
          <LineChart data={velocity?.data ?? []} margin={{ top: 4, right: 4, bottom: 0, left: -24 }}>
            <defs>
              <linearGradient id="assigneeVelocityGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#D66853" stopOpacity={0.15} />
                <stop offset="95%" stopColor="#D66853" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: "var(--color-pm-text-muted)" }} axisLine={false} tickLine={false} />
            <Tooltip content={<VelocityTooltip />} />
            <Area type="monotone" dataKey="completed" stroke="none" fill="url(#assigneeVelocityGrad)" />
            <Line type="monotone" dataKey="completed" stroke="#D66853" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
            <Line type="monotone" dataKey="overdue" stroke="#C43333" strokeWidth={1.5} strokeDasharray="3 3" dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <AssigneeFiltersBar filters={filters} projects={projects} onChange={setFilters} />

      {filteredTasks && (
        <MeKanbanBoard
          tasks={filteredTasks}
          onRefresh={loadData}
          onAddTask={setCreateColumn}
          highlightedTaskId={highlightedTaskId}
          onCardClick={(task) => setSelectedTask(task)}
          selectedTaskIds={meSelectedTaskIds}
          selectionActive={selectionCount > 0}
          onToggleSelect={toggleMeTaskSelection}
          onContextAction={handleContextAction}
        />
      )}

      <TaskDetailPanel task={selectedTask} onClose={() => { setSelectedTask(null); loadData(); }} />
      <CreateTaskModal
        isOpen={createColumn !== null}
        onClose={() => setCreateColumn(null)}
        lockedColumnName={createColumnName}
        requireProjectSelection
        requiredAssigneeId={createAssigneeId}
        onCreated={loadData}
      />
      <AssigneeBulkDeleteConfirm count={bulkDeleteCount} onCancel={() => setBulkDeleteCount(null)} onConfirm={handleBulkDelete} />

      {selectionCount > 0 && (
        <BulkActionBar
          selectedCount={selectionCount}
          onClear={clearMeTaskSelection}
          actions={[{ label: "Delete", icon: <Trash2 className="h-4 w-4" />, variant: "danger" as const, onClick: () => setBulkDeleteCount(selectionCount) }]}
        />
      )}
    </div>
  );
}

function SummaryCard({ icon, label, badge, value, subtitle, color }: {
  icon: ReactNode;
  label: string;
  badge: string;
  value: number;
  subtitle: string;
  color: string;
}) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="rounded-[14px] p-5" style={{ backgroundColor: "var(--color-pm-bg-secondary)", boxShadow: "var(--pm-shadow-card)", border: "1px solid var(--color-pm-border)" }}>
      <div className="flex items-start justify-between">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ backgroundColor: "rgba(214,104,83,0.08)", color: "#D66853" }}>{icon}</div>
        <span className="rounded-full px-2 py-0.5 text-[11px] font-medium" style={{ backgroundColor: "var(--color-pm-bg-hover)", color: "var(--color-pm-text-muted)" }}>{badge}</span>
      </div>
      <div className="mt-4">
        <div className="text-[28px] font-bold leading-none" style={{ color }}><AnimatedNum value={value} /></div>
        <p className="mt-1 text-[13px] font-medium" style={{ color: "var(--color-pm-text-primary)" }}>{label}</p>
        <p className="mt-0.5 text-[12px]" style={{ color: "var(--color-pm-text-secondary)" }}>{subtitle}</p>
      </div>
    </motion.div>
  );
}

function AssigneePicker({ users, userId, onUserChange }: {
  users: PmUser[];
  userId: number | null;
  onUserChange?: (userId: number) => void;
}) {
  return (
    <div className="rounded-[14px] p-5" style={{ backgroundColor: "var(--color-pm-bg-secondary)", boxShadow: "var(--pm-shadow-card)", border: "1px solid var(--color-pm-border)" }}>
      <div className="mb-3 flex items-center gap-2">
        <UserRound className="h-4 w-4" strokeWidth={1.5} style={{ color: "#D66853" }} />
        <span className="text-[13px] font-semibold" style={{ color: "var(--color-pm-text-primary)" }}>Assignee View</span>
      </div>
      <select value={userId ?? ""} onChange={(e) => onUserChange?.(Number(e.target.value))} className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={{ backgroundColor: "var(--color-pm-bg-primary)", border: "1px solid var(--color-pm-border)", color: "var(--color-pm-text-primary)" }}>
        {users.map((user) => <option key={user.id} value={user.id}>{user.display_name}</option>)}
      </select>
      <p className="mt-2 text-[11px]" style={{ color: "var(--color-pm-text-muted)" }}>Review workload without changing project boards.</p>
    </div>
  );
}

function RangePicker({ value, onChange }: { value: Range; onChange: (value: Range) => void }) {
  return (
    <div className="flex gap-1">
      {RANGES.map((range) => (
        <button key={range} onClick={() => onChange(range)} className="rounded-lg px-2.5 py-1 text-[11px] font-medium transition-colors duration-150" style={{ backgroundColor: value === range ? "var(--color-pm-bg-hover)" : "transparent", color: value === range ? "var(--color-pm-text-primary)" : "var(--color-pm-text-muted)" }}>
          {range}
        </button>
      ))}
    </div>
  );
}

function AssigneeFiltersBar({ filters, projects, onChange }: {
  filters: AssigneeFilters;
  projects: Array<{ id: string; name: string }>;
  onChange: (filters: AssigneeFilters) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-[14px] p-3" style={{ backgroundColor: "var(--color-pm-bg-secondary)", border: "1px solid var(--color-pm-border)" }}>
      <Filter className="h-4 w-4" strokeWidth={1.5} style={{ color: "var(--color-pm-text-muted)" }} />
      <select value={filters.projectId} onChange={(e) => onChange({ ...filters, projectId: e.target.value })} className="rounded-lg px-2.5 py-1.5 text-[12px] outline-none" style={{ backgroundColor: "var(--color-pm-bg-primary)", color: "var(--color-pm-text-primary)", border: "1px solid var(--color-pm-border)" }}>
        <option value="all">All projects</option>
        {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
      </select>
      <select value={filters.priority} onChange={(e) => onChange({ ...filters, priority: e.target.value })} className="rounded-lg px-2.5 py-1.5 text-[12px] outline-none" style={{ backgroundColor: "var(--color-pm-bg-primary)", color: "var(--color-pm-text-primary)", border: "1px solid var(--color-pm-border)" }}>
        <option value="all">All priorities</option>
        {["P1", "P2", "P3", "P4", "P5"].map((priority) => <option key={priority} value={priority}>{priority}</option>)}
      </select>
      <button onClick={() => onChange({ ...filters, overdueOnly: !filters.overdueOnly })} className="rounded-lg px-2.5 py-1.5 text-[12px] font-medium" style={{ backgroundColor: filters.overdueOnly ? "var(--color-pm-accent-subtle2)" : "var(--color-pm-bg-primary)", color: filters.overdueOnly ? "#D66853" : "var(--color-pm-text-muted)", border: "1px solid var(--color-pm-border)" }}>
        Overdue
      </button>
    </div>
  );
}

function AssigneeBulkDeleteConfirm({ count, onCancel, onConfirm }: {
  count: number | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <AnimatePresence>
      {count !== null && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onCancel} className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" />
          <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }} className="fixed left-1/2 top-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-xl p-6" style={{ backgroundColor: "var(--color-pm-bg-secondary)", boxShadow: "0 16px 48px rgba(0,0,0,0.3)", border: "1px solid var(--color-pm-border)" }}>
            <h3 className="mb-1 text-center text-[16px] font-semibold" style={{ color: "var(--color-pm-text-primary)" }}>Delete {count} task{count !== 1 ? "s" : ""}?</h3>
            <p className="mb-5 text-center text-[13px]" style={{ color: "var(--color-pm-text-secondary)" }}>This cannot be undone.</p>
            <div className="flex gap-3">
              <button onClick={onCancel} className="flex-1 rounded-lg py-2.5 text-[13px] font-semibold" style={{ border: "1px solid var(--color-pm-border)", color: "var(--color-pm-text-secondary)" }}>Cancel</button>
              <button onClick={onConfirm} className="flex-1 rounded-lg py-2.5 text-[13px] font-semibold text-white" style={{ backgroundColor: "#C43333" }}>Delete</button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
