// Shared dropdown option type used by AnimatedDropdown (category/status selectors).
export interface DropdownOption {
  value: string;
  label: string;
  color?: string;
}

// Filter option type used by FilterDropdown (filter-bar selectors).
export interface FilterDropdownOption {
  value: string;
  label: string;
}

// Category and Status options
export const CATEGORY_OPTIONS: DropdownOption[] = [
  { value: "ALLORO", label: "ALLORO" },
  { value: "USER", label: "USER" },
];

export const STATUS_OPTIONS: DropdownOption[] = [
  { value: "pending", label: "Pending" },
  { value: "in_progress", label: "In Progress" },
  { value: "complete", label: "Complete" },
  { value: "archived", label: "Archived" },
];

export const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};
