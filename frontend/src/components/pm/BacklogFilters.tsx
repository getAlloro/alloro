import { Filter } from "lucide-react";
import type { PmBacklogProjectGroup } from "../../types/pm";
import { AnimatedSelect, type AnimatedSelectOption } from "./AnimatedSelect";

export type BacklogFiltersValue = {
  projectId: string;
  priority: string;
  overdueOnly: boolean;
  unassignedOnly: boolean;
};

export type BacklogFiltersProps = {
  filters: BacklogFiltersValue;
  groups: PmBacklogProjectGroup[];
  onChange: (filters: BacklogFiltersValue) => void;
};

const PRIORITY_OPTIONS: AnimatedSelectOption<string>[] = [
  { value: "all", label: "All priorities" },
  ...["P1", "P2", "P3", "P4", "P5"].map((priority) => ({
    value: priority,
    label: priority,
  })),
];

export function BacklogFilters({ filters, groups, onChange }: BacklogFiltersProps) {
  const projectOptions: AnimatedSelectOption<string>[] = [
    { value: "all", label: "All projects" },
    ...groups.map((group) => ({
      value: group.project_id,
      label: group.project_name,
    })),
  ];

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-[14px] border border-pm-border bg-pm-bg-secondary p-3">
      <Filter className="h-4 w-4 text-pm-text-muted" strokeWidth={1.5} aria-hidden="true" />
      <AnimatedSelect
        value={filters.projectId}
        options={projectOptions}
        onChange={(projectId) => onChange({ ...filters, projectId })}
        ariaLabel="Filter backlog by project"
        size="sm"
        className="min-w-[180px] max-w-full sm:max-w-[280px]"
      />
      <AnimatedSelect
        value={filters.priority}
        options={PRIORITY_OPTIONS}
        onChange={(priority) => onChange({ ...filters, priority })}
        ariaLabel="Filter backlog by priority"
        size="sm"
        className="min-w-[140px]"
      />
      <FilterButton
        active={filters.overdueOnly}
        onClick={() => onChange({ ...filters, overdueOnly: !filters.overdueOnly })}
      >
        Overdue
      </FilterButton>
      <FilterButton
        active={filters.unassignedOnly}
        onClick={() => onChange({ ...filters, unassignedOnly: !filters.unassignedOnly })}
      >
        Unassigned
      </FilterButton>
    </div>
  );
}

type FilterButtonProps = {
  active: boolean;
  onClick: () => void;
  children: string;
};

function FilterButton({ active, onClick, children }: FilterButtonProps) {
  const stateClass = active
    ? "bg-pm-accent-subtle2 text-pm-accent"
    : "bg-pm-bg-primary text-pm-text-muted";

  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`rounded-lg border border-pm-border px-2.5 py-1.5 text-[12px] font-medium transition-colors ${stateClass}`}
    >
      {children}
    </button>
  );
}
