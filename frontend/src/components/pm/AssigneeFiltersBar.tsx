import { Filter } from "lucide-react";
import { AnimatedSelect } from "./AnimatedSelect";

const PRIORITY_OPTIONS = [
  { value: "all", label: "All priorities" },
  { value: "P1", label: "P1" },
  { value: "P2", label: "P2" },
  { value: "P3", label: "P3" },
  { value: "P4", label: "P4" },
  { value: "P5", label: "P5" },
];

export type AssigneeFilters = {
  projectId: string;
  priority: string;
  overdueOnly: boolean;
};

export type AssigneeFilterProject = {
  id: string;
  name: string;
};

export type AssigneeFiltersBarProps = {
  filters: AssigneeFilters;
  projects: AssigneeFilterProject[];
  onChange: (filters: AssigneeFilters) => void;
};

export function AssigneeFiltersBar({ filters, projects, onChange }: AssigneeFiltersBarProps) {
  const projectOptions = [
    { value: "all", label: "All projects" },
    ...projects.map((project) => ({ value: project.id, label: project.name })),
  ];

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-[14px] border border-pm-border bg-pm-bg-secondary p-3">
      <Filter className="h-4 w-4 text-pm-text-muted" strokeWidth={1.5} aria-hidden="true" />
      <AnimatedSelect
        value={filters.projectId}
        options={projectOptions}
        onChange={(projectId) => onChange({ ...filters, projectId })}
        ariaLabel="Filter assignee tasks by project"
        className="w-full sm:w-48"
        size="sm"
      />
      <AnimatedSelect
        value={filters.priority}
        options={PRIORITY_OPTIONS}
        onChange={(priority) => onChange({ ...filters, priority })}
        ariaLabel="Filter assignee tasks by priority"
        className="w-full sm:w-40"
        size="sm"
      />
      <button
        type="button"
        aria-pressed={filters.overdueOnly}
        onClick={() => onChange({ ...filters, overdueOnly: !filters.overdueOnly })}
        className={`min-h-8 rounded-lg border border-pm-border px-2.5 py-1.5 text-[12px] font-medium transition-colors hover:border-pm-border-hover focus:outline-none focus:ring-2 focus:ring-pm-accent/40 ${
          filters.overdueOnly
            ? "bg-pm-accent-subtle text-pm-accent"
            : "bg-pm-bg-primary text-pm-text-muted"
        }`}
      >
        Overdue
      </button>
    </div>
  );
}
