import { endOfWeek, format, isSameWeek, startOfWeek } from "date-fns";

export type DoneWeekTask = {
  id: string;
  completed_at: string | null;
};

export type DoneWeekGroup<TTask extends DoneWeekTask> = {
  key: string;
  label: string;
  rangeLabel: string | null;
  isCurrentWeek: boolean;
  tasks: TTask[];
  sortTime: number;
};

const WEEK_OPTIONS = { weekStartsOn: 1 as const };
const MISSING_COMPLETION_KEY = "missing-completion-date";

function weekOfMonth(weekStart: Date): number {
  return Math.max(1, Math.ceil(Number(format(weekStart, "d")) / 7));
}

function parseCompletedAt(value: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function buildWeekGroup<TTask extends DoneWeekTask>(
  task: TTask,
  completedAt: Date,
  now: Date
): DoneWeekGroup<TTask> {
  const weekStart = startOfWeek(completedAt, WEEK_OPTIONS);
  const weekEnd = endOfWeek(completedAt, WEEK_OPTIONS);

  return {
    key: format(weekStart, "yyyy-MM-dd"),
    label: `Week ${weekOfMonth(weekStart)}, ${format(weekStart, "MMMM")}`,
    rangeLabel: `${format(weekStart, "MM-dd-yyyy")} - ${format(weekEnd, "MM-dd-yyyy")}`,
    isCurrentWeek: isSameWeek(completedAt, now, WEEK_OPTIONS),
    tasks: [task],
    sortTime: weekStart.getTime(),
  };
}

export function groupDoneTasksByWeek<TTask extends DoneWeekTask>(
  tasks: TTask[],
  now = new Date()
): DoneWeekGroup<TTask>[] {
  const groups = new Map<string, DoneWeekGroup<TTask>>();
  const missingDateTasks: TTask[] = [];

  for (const task of tasks) {
    const completedAt = parseCompletedAt(task.completed_at);
    if (!completedAt) {
      missingDateTasks.push(task);
      continue;
    }

    const weekStart = startOfWeek(completedAt, WEEK_OPTIONS);
    const key = format(weekStart, "yyyy-MM-dd");
    const existing = groups.get(key);

    if (existing) {
      existing.tasks.push(task);
      existing.isCurrentWeek =
        existing.isCurrentWeek || isSameWeek(completedAt, now, WEEK_OPTIONS);
    } else {
      groups.set(key, buildWeekGroup(task, completedAt, now));
    }
  }

  const sortedGroups = Array.from(groups.values()).sort(
    (a, b) => b.sortTime - a.sortTime
  );

  if (missingDateTasks.length > 0) {
    sortedGroups.push({
      key: MISSING_COMPLETION_KEY,
      label: "No completion date",
      rangeLabel: null,
      isCurrentWeek: false,
      tasks: missingDateTasks,
      sortTime: Number.NEGATIVE_INFINITY,
    });
  }

  return sortedGroups;
}
