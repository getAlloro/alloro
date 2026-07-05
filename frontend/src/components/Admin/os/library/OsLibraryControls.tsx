import type { ReactNode } from "react";
import { FolderTree, Rows3, Tag, X } from "lucide-react";
import type { AdminOsUser, OsDocumentStatus } from "../../../../api/admin-os";
import {
  OS_EMPTY_LIBRARY_FILTERS,
  type OsLibraryFilters,
  type OsLibrarySort,
  type OsLibraryView,
} from "./osLibraryFilters";

/**
 * Library control bar (P3 T2): view toggle (list · grouped · folders),
 * category/tag/owner/status filters, updated/title sort, clear-all, and the
 * page toolbar slot. Pure controls — state lives in OsLibrary (§13.3),
 * filter shapes in osLibraryFilters.ts.
 */

const VIEW_OPTIONS: { view: OsLibraryView; label: string; icon: typeof Rows3 }[] =
  [
    { view: "list", label: "List", icon: Rows3 },
    { view: "grouped", label: "Categories", icon: Tag },
    { view: "folders", label: "Folders", icon: FolderTree },
  ];

const STATUS_OPTIONS: { value: OsDocumentStatus; label: string }[] = [
  { value: "indexed", label: "Indexed" },
  { value: "processing", label: "Processing" },
  { value: "processing_failed", label: "Failed" },
];

function FilterSelect({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-8 rounded-lg border border-line-medium bg-alloro-surface px-2 text-[12px] text-gray-700 outline-none transition-colors duration-150 focus:border-alloro-orange"
    >
      {children}
    </select>
  );
}

function OsViewToggle({
  view,
  onViewChange,
}: {
  view: OsLibraryView;
  onViewChange: (view: OsLibraryView) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Library view"
      className="inline-flex items-center rounded-[9px] border border-line-medium bg-alloro-surface p-0.5"
    >
      {VIEW_OPTIONS.map(({ view: option, label, icon: Icon }) => {
        const isActive = view === option;
        return (
          <button
            key={option}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onViewChange(option)}
            className={`inline-flex items-center gap-1.5 rounded-[7px] px-2.5 py-1.5 text-[12px] font-medium transition-colors duration-150 ${
              isActive
                ? "bg-accent-soft text-alloro-orange"
                : "text-gray-500 hover:text-gray-800"
            }`}
          >
            <Icon className="h-3.5 w-3.5" strokeWidth={1.5} />
            {label}
          </button>
        );
      })}
    </div>
  );
}

function OsFilterRow({
  filters,
  onFiltersChange,
  sort,
  onSortChange,
  categoryOptions,
  tagOptions,
  owners,
}: {
  filters: OsLibraryFilters;
  onFiltersChange: (filters: OsLibraryFilters) => void;
  sort: OsLibrarySort;
  onSortChange: (sort: OsLibrarySort) => void;
  categoryOptions: string[];
  tagOptions: string[];
  owners: AdminOsUser[];
}) {
  const activeFilterCount = Object.values(filters).filter(
    (value) => value !== null,
  ).length;

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 border-b border-line-soft pb-4">
      <FilterSelect
        label="Filter by category"
        value={filters.category ?? ""}
        onChange={(value) =>
          onFiltersChange({ ...filters, category: value || null })
        }
      >
        <option value="">All categories</option>
        {categoryOptions.map((category) => (
          <option key={category} value={category}>
            {category}
          </option>
        ))}
      </FilterSelect>

      <FilterSelect
        label="Filter by tag"
        value={filters.tag ?? ""}
        onChange={(value) => onFiltersChange({ ...filters, tag: value || null })}
      >
        <option value="">All tags</option>
        {tagOptions.map((tag) => (
          <option key={tag} value={tag}>
            {tag}
          </option>
        ))}
      </FilterSelect>

      <FilterSelect
        label="Filter by owner"
        value={filters.ownerId === null ? "" : String(filters.ownerId)}
        onChange={(value) =>
          onFiltersChange({
            ...filters,
            ownerId: value === "" ? null : Number(value),
          })
        }
      >
        <option value="">All owners</option>
        {owners.map((owner) => (
          <option key={owner.id} value={owner.id}>
            {owner.name || owner.email}
          </option>
        ))}
      </FilterSelect>

      <FilterSelect
        label="Filter by status"
        value={filters.status ?? ""}
        onChange={(value) =>
          onFiltersChange({
            ...filters,
            status: (value || null) as OsDocumentStatus | null,
          })
        }
      >
        <option value="">All statuses</option>
        {STATUS_OPTIONS.map(({ value, label }) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </FilterSelect>

      <span className="mx-1 hidden h-4 w-px bg-line-medium sm:inline-block" />

      <FilterSelect
        label="Sort documents"
        value={sort}
        onChange={(value) => onSortChange(value as OsLibrarySort)}
      >
        <option value="updated">Recently updated</option>
        <option value="title">Title A–Z</option>
      </FilterSelect>

      {activeFilterCount > 0 && (
        <button
          type="button"
          onClick={() => onFiltersChange(OS_EMPTY_LIBRARY_FILTERS)}
          className="inline-flex items-center gap-1 rounded-[9px] px-2 py-1.5 font-mono text-[11px] text-gray-400 transition-colors duration-150 hover:text-gray-700"
        >
          <X className="h-3 w-3" strokeWidth={1.5} />
          Clear ({activeFilterCount})
        </button>
      )}
    </div>
  );
}

export function OsLibraryControls({
  view,
  onViewChange,
  filters,
  onFiltersChange,
  sort,
  onSortChange,
  categoryOptions,
  tagOptions,
  owners,
  toolbar,
}: {
  view: OsLibraryView;
  onViewChange: (view: OsLibraryView) => void;
  filters: OsLibraryFilters;
  onFiltersChange: (filters: OsLibraryFilters) => void;
  sort: OsLibrarySort;
  onSortChange: (sort: OsLibrarySort) => void;
  categoryOptions: string[];
  tagOptions: string[];
  owners: AdminOsUser[];
  toolbar: ReactNode;
}) {
  return (
    <div className="pt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <OsViewToggle view={view} onViewChange={onViewChange} />
        {toolbar}
      </div>
      <OsFilterRow
        filters={filters}
        onFiltersChange={onFiltersChange}
        sort={sort}
        onSortChange={onSortChange}
        categoryOptions={categoryOptions}
        tagOptions={tagOptions}
        owners={owners}
      />
    </div>
  );
}
