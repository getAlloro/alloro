import type { ReactNode } from "react";
import { FolderTree, Rows3, Tag, X } from "lucide-react";
import type { AdminOsUser, OsDocumentStatus } from "../../../../api/admin-os";
import { OsFilterSelect, type OsFilterOption } from "./OsFilterSelect";
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

  const categoryOpts: OsFilterOption[] = [
    { value: "", label: "All categories" },
    ...categoryOptions.map((category) => ({ value: category, label: category })),
  ];
  const tagOpts: OsFilterOption[] = [
    { value: "", label: "All tags" },
    ...tagOptions.map((tag) => ({ value: tag, label: tag })),
  ];
  const ownerOpts: OsFilterOption[] = [
    { value: "", label: "All owners" },
    ...owners.map((owner) => ({
      value: String(owner.id),
      label: owner.name || owner.email,
    })),
  ];
  const statusOpts: OsFilterOption[] = [
    { value: "", label: "All statuses" },
    ...STATUS_OPTIONS.map(({ value, label }) => ({ value, label })),
  ];
  const sortOpts: OsFilterOption[] = [
    { value: "updated", label: "Recently updated" },
    { value: "title", label: "Title A–Z" },
  ];

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 border-b border-line-soft pb-4">
      <OsFilterSelect
        ariaLabel="Filter by category"
        value={filters.category ?? ""}
        options={categoryOpts}
        onChange={(value) =>
          onFiltersChange({ ...filters, category: value || null })
        }
      />
      <OsFilterSelect
        ariaLabel="Filter by tag"
        value={filters.tag ?? ""}
        options={tagOpts}
        onChange={(value) => onFiltersChange({ ...filters, tag: value || null })}
      />
      <OsFilterSelect
        ariaLabel="Filter by owner"
        value={filters.ownerId === null ? "" : String(filters.ownerId)}
        options={ownerOpts}
        onChange={(value) =>
          onFiltersChange({
            ...filters,
            ownerId: value === "" ? null : Number(value),
          })
        }
      />
      <OsFilterSelect
        ariaLabel="Filter by status"
        value={filters.status ?? ""}
        options={statusOpts}
        onChange={(value) =>
          onFiltersChange({
            ...filters,
            status: (value || null) as OsDocumentStatus | null,
          })
        }
      />

      <span className="mx-1 hidden h-4 w-px bg-line-medium sm:inline-block" />

      <OsFilterSelect
        ariaLabel="Sort documents"
        value={sort}
        options={sortOpts}
        onChange={(value) => onSortChange(value as OsLibrarySort)}
      />

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
    <div>
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
