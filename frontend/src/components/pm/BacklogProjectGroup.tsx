import { useState } from "react";
import { ChevronDown, ChevronRight, Loader2, UserRound } from "lucide-react";
import type { PmBacklogProjectGroup, PmMyTask, PmProjectColumnSummary, PmUser } from "../../types/pm";
import { assignTask, moveTask } from "../../api/pm";
import { showErrorToast, showWarningToast } from "../../lib/toast";
import { formatDeadline } from "../../utils/pmDateFormat";

export type BacklogProjectGroupProps = {
  group: PmBacklogProjectGroup;
  users: PmUser[];
  onRefresh: () => Promise<void>;
  onOpenTask: (task: PmMyTask) => void;
};

function targetPosition(column: PmProjectColumnSummary): number {
  return Math.max(0, column.task_count);
}

export function BacklogProjectGroup({
  group,
  users,
  onRefresh,
  onOpenTask,
}: BacklogProjectGroupProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null);

  const handleAssign = async (task: PmMyTask, userId: number | null) => {
    setBusyTaskId(task.id);
    try {
      await assignTask(task.id, userId);
      await onRefresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Try again";
      showErrorToast("Assignment failed", message);
    } finally {
      setBusyTaskId(null);
    }
  };

  const handleMove = async (task: PmMyTask, columnId: string) => {
    const target = group.column_ids.columns.find((column) => column.id === columnId);
    if (!target || task.column_id === columnId) return;
    if (!target.is_backlog && !task.assigned_to) {
      showWarningToast("Assign someone first", "Backlog tasks need an assignee before they move into active work.");
      return;
    }

    setBusyTaskId(task.id);
    try {
      await moveTask(task.id, columnId, targetPosition(target));
      await onRefresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Try again";
      showErrorToast("Move failed", message);
    } finally {
      setBusyTaskId(null);
    }
  };

  return (
    <section className="rounded-[14px]" style={{ backgroundColor: "var(--color-pm-bg-secondary)", border: "1px solid var(--color-pm-border)", boxShadow: "var(--pm-shadow-card)" }}>
      <button
        type="button"
        onClick={() => setIsOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <span className="flex min-w-0 items-center gap-2">
          {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          <span className="truncate text-[14px] font-semibold" style={{ color: "var(--color-pm-text-primary)" }}>{group.project_name}</span>
        </span>
        <span className="rounded-full px-2 py-0.5 text-[11px]" style={{ backgroundColor: "var(--color-pm-bg-hover)", color: "var(--color-pm-text-muted)" }}>
          {group.tasks.length} backlog
        </span>
      </button>

      {isOpen && (
        <div className="space-y-2 px-3 pb-3">
          {group.tasks.map((task) => (
            <BacklogTaskRow
              key={task.id}
              task={task}
              users={users}
              columns={group.column_ids.columns}
              isBusy={busyTaskId === task.id}
              onOpen={() => onOpenTask(task)}
              onAssign={(userId) => handleAssign(task, userId)}
              onMove={(columnId) => handleMove(task, columnId)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function BacklogTaskRow({
  task,
  users,
  columns,
  isBusy,
  onOpen,
  onAssign,
  onMove,
}: {
  task: PmMyTask;
  users: PmUser[];
  columns: PmProjectColumnSummary[];
  isBusy: boolean;
  onOpen: () => void;
  onAssign: (userId: number | null) => void;
  onMove: (columnId: string) => void;
}) {
  const deadline = task.completed_at ? null : formatDeadline(task.deadline);

  return (
    <article className="rounded-xl p-3" style={{ backgroundColor: "var(--color-pm-bg-tertiary)", border: "1px solid var(--color-pm-border)" }}>
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
        <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
          <p className="truncate text-[13px] font-semibold" style={{ color: "var(--color-pm-text-primary)" }} title={task.title}>{task.title}</p>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px]" style={{ color: "var(--color-pm-text-muted)" }}>
            <span>{task.assignee_name ? `Assigned to ${task.assignee_name}` : "Unassigned"}</span>
            {deadline && <span className={deadline.colorClass}>{deadline.text}</span>}
          </div>
        </button>

        <div className="flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor={`assign-${task.id}`}>Assign task</label>
          <div className="relative">
            <UserRound className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2" style={{ color: "var(--color-pm-text-muted)" }} />
            <select
              id={`assign-${task.id}`}
              value={task.assigned_to ?? ""}
              disabled={isBusy}
              onChange={(event) => onAssign(event.target.value ? Number(event.target.value) : null)}
              className="min-w-[150px] rounded-lg py-1.5 pl-7 pr-2 text-[12px] outline-none"
              style={{ backgroundColor: "var(--color-pm-bg-primary)", color: "var(--color-pm-text-primary)", border: "1px solid var(--color-pm-border)" }}
            >
              <option value="">Unassigned</option>
              {users.map((user) => <option key={user.id} value={user.id}>{user.display_name}</option>)}
            </select>
          </div>

          <label className="sr-only" htmlFor={`move-${task.id}`}>Move task</label>
          <select
            id={`move-${task.id}`}
            value={task.column_id}
            disabled={isBusy}
            onChange={(event) => onMove(event.target.value)}
            className="min-w-[150px] rounded-lg px-2 py-1.5 text-[12px] outline-none"
            style={{ backgroundColor: "var(--color-pm-bg-primary)", color: "var(--color-pm-text-primary)", border: "1px solid var(--color-pm-border)" }}
          >
            {columns.map((column) => <option key={column.id} value={column.id}>{column.name}</option>)}
          </select>

          {isBusy && <Loader2 className="h-4 w-4 animate-spin" style={{ color: "#D66853" }} />}
        </div>
      </div>
    </article>
  );
}
