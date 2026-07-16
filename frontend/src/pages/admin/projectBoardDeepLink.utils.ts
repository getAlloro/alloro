import type { TaskDetailTab } from "../../components/pm/TaskDetailPanel";

export function resolvePmTaskTab(
  value: string | null,
): TaskDetailTab | undefined {
  return value === "details" || value === "attachments" || value === "comments"
    ? value
    : undefined;
}
