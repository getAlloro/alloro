import { useCallback, useEffect, useMemo, useState } from "react";
import { Filter, Inbox, Loader2 } from "lucide-react";
import { fetchBacklogTasks, fetchPmUsers } from "../../api/pm";
import type { PmBacklogProjectGroup, PmMyTask, PmUser } from "../../types/pm";
import { showErrorToast } from "../../lib/toast";
import { TaskDetailPanel } from "./TaskDetailPanel";
import { BacklogProjectGroup } from "./BacklogProjectGroup";

type BacklogFilters = {
  projectId: string;
  priority: string;
  overdueOnly: boolean;
  unassignedOnly: boolean;
};

const DEFAULT_FILTERS: BacklogFilters = {
  projectId: "all",
  priority: "all",
  overdueOnly: false,
  unassignedOnly: false,
};

function isOverdue(task: PmMyTask): boolean {
  return !!task.deadline && !task.completed_at && new Date(task.deadline) < new Date();
}

function filteredTaskList(tasks: PmMyTask[], filters: BacklogFilters): PmMyTask[] {
  return tasks.filter((task) => {
    if (filters.priority !== "all" && task.priority !== filters.priority) return false;
    if (filters.overdueOnly && !isOverdue(task)) return false;
    if (filters.unassignedOnly && task.assigned_to !== null) return false;
    return true;
  });
}

export function BacklogTabView() {
  const [groups, setGroups] = useState<PmBacklogProjectGroup[]>([]);
  const [users, setUsers] = useState<PmUser[]>([]);
  const [filters, setFilters] = useState<BacklogFilters>(DEFAULT_FILTERS);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<PmMyTask | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [nextGroups, nextUsers] = await Promise.all([
        fetchBacklogTasks(),
        fetchPmUsers(),
      ]);
      setGroups(nextGroups);
      setUsers(nextUsers);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Try again";
      showErrorToast("Backlog failed to load", message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filteredGroups = useMemo(() => {
    return groups
      .filter((group) => filters.projectId === "all" || group.project_id === filters.projectId)
      .map((group) => ({ ...group, tasks: filteredTaskList(group.tasks, filters) }))
      .filter((group) => group.tasks.length > 0);
  }, [filters, groups]);

  useEffect(() => {
    if (filteredGroups.length === 0) {
      setSelectedProjectId(null);
      return;
    }
    if (!selectedProjectId || !filteredGroups.some((group) => group.project_id === selectedProjectId)) {
      setSelectedProjectId(filteredGroups[0].project_id);
    }
  }, [filteredGroups, selectedProjectId]);

  const selectedGroup = filteredGroups.find((group) => group.project_id === selectedProjectId) ?? filteredGroups[0] ?? null;
  const totalBacklog = filteredGroups.reduce((sum, group) => sum + group.tasks.length, 0);

  return (
    <div className="mx-auto max-w-[1400px] space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Inbox className="h-5 w-5" strokeWidth={1.5} style={{ color: "#D66853" }} />
            <h2 className="text-[18px] font-semibold" style={{ color: "var(--color-pm-text-primary)" }}>Global Backlog</h2>
          </div>
          <p className="mt-1 text-[12px]" style={{ color: "var(--color-pm-text-muted)" }}>
            {totalBacklog} incomplete backlog task{totalBacklog !== 1 ? "s" : ""} across active projects
          </p>
        </div>
        <button
          type="button"
          onClick={loadData}
          className="rounded-lg px-3 py-2 text-[12px] font-medium"
          style={{ backgroundColor: "var(--color-pm-bg-secondary)", color: "var(--color-pm-text-secondary)", border: "1px solid var(--color-pm-border)" }}
        >
          Refresh
        </button>
      </div>

      <BacklogFilters filters={filters} groups={groups} onChange={setFilters} />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[280px_1fr]">
        <aside className="rounded-[14px] p-3" style={{ backgroundColor: "var(--color-pm-bg-secondary)", border: "1px solid var(--color-pm-border)", boxShadow: "var(--pm-shadow-card)" }}>
          <p className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-[0.05em]" style={{ color: "var(--color-pm-text-muted)" }}>Projects</p>
          <div className="space-y-1">
            {filteredGroups.map((group) => {
              const isActive = group.project_id === selectedGroup?.project_id;
              return (
                <button
                  key={group.project_id}
                  type="button"
                  onClick={() => setSelectedProjectId(group.project_id)}
                  className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left"
                  style={{ backgroundColor: isActive ? "var(--color-pm-bg-hover)" : "transparent", color: isActive ? "var(--color-pm-text-primary)" : "var(--color-pm-text-secondary)" }}
                >
                  <span className="truncate text-[12px] font-medium">{group.project_name}</span>
                  <span className="text-[11px]" style={{ color: "var(--color-pm-text-muted)" }}>{group.tasks.length}</span>
                </button>
              );
            })}
            {!isLoading && filteredGroups.length === 0 && (
              <p className="px-3 py-8 text-center text-[12px]" style={{ color: "var(--color-pm-text-muted)" }}>No backlog matches.</p>
            )}
          </div>
        </aside>

        <main>
          {isLoading ? (
            <div className="flex min-h-[300px] items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin" style={{ color: "#D66853" }} />
            </div>
          ) : selectedGroup ? (
            <BacklogProjectGroup
              group={selectedGroup}
              users={users}
              onRefresh={loadData}
              onOpenTask={setSelectedTask}
            />
          ) : (
            <div className="rounded-[14px] p-10 text-center" style={{ backgroundColor: "var(--color-pm-bg-secondary)", border: "1px solid var(--color-pm-border)" }}>
              <Inbox className="mx-auto h-8 w-8" strokeWidth={1.5} style={{ color: "var(--color-pm-text-muted)" }} />
              <p className="mt-3 text-[14px] font-semibold" style={{ color: "var(--color-pm-text-primary)" }}>Backlog is clear</p>
              <p className="mt-1 text-[12px]" style={{ color: "var(--color-pm-text-muted)" }}>Nothing needs triage under the current filters.</p>
            </div>
          )}
        </main>
      </div>

      <TaskDetailPanel task={selectedTask} onClose={() => { setSelectedTask(null); loadData(); }} isBacklog />
    </div>
  );
}

function BacklogFilters({ filters, groups, onChange }: {
  filters: BacklogFilters;
  groups: PmBacklogProjectGroup[];
  onChange: (filters: BacklogFilters) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-[14px] p-3" style={{ backgroundColor: "var(--color-pm-bg-secondary)", border: "1px solid var(--color-pm-border)" }}>
      <Filter className="h-4 w-4" strokeWidth={1.5} style={{ color: "var(--color-pm-text-muted)" }} />
      <select value={filters.projectId} onChange={(event) => onChange({ ...filters, projectId: event.target.value })} className="rounded-lg px-2.5 py-1.5 text-[12px] outline-none" style={{ backgroundColor: "var(--color-pm-bg-primary)", color: "var(--color-pm-text-primary)", border: "1px solid var(--color-pm-border)" }}>
        <option value="all">All projects</option>
        {groups.map((group) => <option key={group.project_id} value={group.project_id}>{group.project_name}</option>)}
      </select>
      <select value={filters.priority} onChange={(event) => onChange({ ...filters, priority: event.target.value })} className="rounded-lg px-2.5 py-1.5 text-[12px] outline-none" style={{ backgroundColor: "var(--color-pm-bg-primary)", color: "var(--color-pm-text-primary)", border: "1px solid var(--color-pm-border)" }}>
        <option value="all">All priorities</option>
        {["P1", "P2", "P3", "P4", "P5"].map((priority) => <option key={priority} value={priority}>{priority}</option>)}
      </select>
      <FilterButton active={filters.overdueOnly} onClick={() => onChange({ ...filters, overdueOnly: !filters.overdueOnly })}>Overdue</FilterButton>
      <FilterButton active={filters.unassignedOnly} onClick={() => onChange({ ...filters, unassignedOnly: !filters.unassignedOnly })}>Unassigned</FilterButton>
    </div>
  );
}

function FilterButton({ active, onClick, children }: {
  active: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button type="button" onClick={onClick} className="rounded-lg px-2.5 py-1.5 text-[12px] font-medium" style={{ backgroundColor: active ? "var(--color-pm-accent-subtle2)" : "var(--color-pm-bg-primary)", color: active ? "#D66853" : "var(--color-pm-text-muted)", border: "1px solid var(--color-pm-border)" }}>
      {children}
    </button>
  );
}
