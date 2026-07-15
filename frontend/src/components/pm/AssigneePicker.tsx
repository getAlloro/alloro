import { UserRound } from "lucide-react";
import type { PmUser } from "../../types/pm";
import { AnimatedSelect } from "./AnimatedSelect";

export type AssigneePickerProps = {
  users: PmUser[];
  userId: number | null;
  onUserChange?: (userId: number) => void;
};

export function AssigneePicker({ users, userId, onUserChange }: AssigneePickerProps) {
  const options = users.map((user) => ({
    value: user.id,
    label: user.display_name,
  }));

  return (
    <div className="rounded-[14px] border border-pm-border bg-pm-bg-secondary p-5 shadow-[var(--pm-shadow-card)]">
      <div className="mb-3 flex items-center gap-2">
        <UserRound className="h-4 w-4 text-pm-accent" strokeWidth={1.5} aria-hidden="true" />
        <span className="text-[13px] font-semibold text-pm-text-primary">Assignee View</span>
      </div>
      <AnimatedSelect<number | null>
        value={userId}
        options={options}
        onChange={(nextUserId) => {
          if (nextUserId !== null) onUserChange?.(nextUserId);
        }}
        ariaLabel="Select assignee"
        isDisabled={options.length === 0}
        placeholder={options.length === 0 ? "No assignees" : "Select assignee"}
      />
      <p className="mt-2 text-[11px] text-pm-text-muted">Review workload without changing project boards.</p>
    </div>
  );
}
