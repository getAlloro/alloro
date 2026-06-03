import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import {
  groupDoneTasksByWeek,
  type DoneWeekTask,
} from "../../utils/pmDoneWeekGroups";

export type DoneWeekGroupsProps<TTask extends DoneWeekTask> = {
  tasks: TTask[];
  emptyState?: ReactNode;
  renderTask: (task: TTask) => ReactNode;
};

export function DoneWeekGroups<TTask extends DoneWeekTask>({
  tasks,
  emptyState = null,
  renderTask,
}: DoneWeekGroupsProps<TTask>) {
  const groups = useMemo(() => groupDoneTasksByWeek(tasks), [tasks]);
  const [openKeys, setOpenKeys] = useState<Set<string>>(new Set());

  useEffect(() => {
    setOpenKeys((current) => {
      let changed = false;
      const next = new Set(current);

      for (const group of groups) {
        if (group.isCurrentWeek && !next.has(group.key)) {
          next.add(group.key);
          changed = true;
        }
      }

      return changed ? next : current;
    });
  }, [groups]);

  if (groups.length === 0) return <>{emptyState}</>;

  return (
    <div className="space-y-2">
      {groups.map((group) => {
        const isOpen = openKeys.has(group.key);

        return (
          <section key={group.key} className="overflow-hidden rounded-lg">
            <button
              type="button"
              aria-expanded={isOpen}
              onClick={() =>
                setOpenKeys((current) => {
                  const next = new Set(current);
                  if (next.has(group.key)) next.delete(group.key);
                  else next.add(group.key);
                  return next;
                })
              }
              className="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left transition-colors duration-150"
              style={{
                backgroundColor: "var(--color-pm-bg-primary)",
                border: "1px solid var(--color-pm-border)",
                color: "var(--color-pm-text-secondary)",
              }}
            >
              <span className="flex min-w-0 items-center gap-1.5">
                {isOpen ? (
                  <ChevronDown className="h-3.5 w-3.5 flex-shrink-0" strokeWidth={1.6} />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5 flex-shrink-0" strokeWidth={1.6} />
                )}
                <span className="min-w-0">
                  <span className="block truncate text-[11px] font-semibold uppercase tracking-[0.04em]">
                    {group.label}
                  </span>
                  {group.rangeLabel && (
                    <span
                      className="block truncate text-[10px]"
                      style={{ color: "var(--color-pm-text-muted)" }}
                    >
                      ({group.rangeLabel})
                    </span>
                  )}
                </span>
              </span>
              <span
                className="flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[10px] font-semibold"
                style={{
                  backgroundColor: "var(--color-pm-accent-subtle)",
                  color: "#D66853",
                }}
              >
                {group.tasks.length}
              </span>
            </button>

            {isOpen && <div className="space-y-2 pt-2">{group.tasks.map(renderTask)}</div>}
          </section>
        );
      })}
    </div>
  );
}
