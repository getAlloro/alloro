import type { OsDocumentStatus } from "../../../../api/admin-os";

/**
 * Library view/filter/sort state shapes (P3 T2) — value + types live outside
 * the component files so fast refresh keeps working
 * (react-refresh/only-export-components).
 */

export type OsLibraryView = "list" | "grouped" | "folders";
export type OsLibrarySort = "updated" | "title";

export type OsLibraryFilters = {
  category: string | null;
  tag: string | null;
  ownerId: number | null;
  status: OsDocumentStatus | null;
};

export const OS_EMPTY_LIBRARY_FILTERS: OsLibraryFilters = {
  category: null,
  tag: null,
  ownerId: null,
  status: null,
};
