import { useMemo, useState } from "react";
import { BookOpen, ChevronLeft, ChevronRight } from "lucide-react";
import type {
  OsDocumentListItem,
  OsPagination,
  OsUpdateMetaPatch,
} from "../../../api/admin-os";
import {
  useAdminOsCategories,
  useAdminOsDocuments,
} from "../../../hooks/queries/useAdminOsDocuments";
import { useAdminOsFolders } from "../../../hooks/queries/useAdminOsFolders";
import { useAdminOsUsers } from "../../../hooks/queries/useAdminOsUsers";
import { useUpdateOsDocumentMeta } from "../../../hooks/queries/useAdminOsDocumentMutations";
import { OsLibraryControls } from "../../../components/Admin/os/library/OsLibraryControls";
import {
  OS_EMPTY_LIBRARY_FILTERS,
  type OsLibraryFilters,
  type OsLibrarySort,
  type OsLibraryView,
} from "../../../components/Admin/os/library/osLibraryFilters";
import { OsLibraryToolbar } from "../../../components/Admin/os/library/OsLibraryToolbar";
import { OsDocumentRow } from "../../../components/Admin/os/library/OsDocumentRow";
import { OsGroupedView } from "../../../components/Admin/os/library/OsGroupedView";
import { OsFolderTree } from "../../../components/Admin/os/library/OsFolderTree";
import { OsEmptyState } from "../../../components/Admin/os/shared/OsEmptyState";
import { OsErrorState } from "../../../components/Admin/os/shared/OsErrorState";
import { OsRowSkeleton } from "../../../components/Admin/os/shared/OsRowSkeleton";

/**
 * Library (plans/07042026-alloro-os-admin-port P3 T2): list / grouped-by-
 * category / folder-tree views over the P2 documents API, with server-side
 * filters, client-side sort, and @dnd-kit drag-moves that PATCH meta.
 */

const OS_LIBRARY_PAGE_SIZE = 100;

function sortDocuments(
  documents: OsDocumentListItem[],
  sort: OsLibrarySort,
): OsDocumentListItem[] {
  if (sort === "title") {
    return [...documents].sort((a, b) =>
      (a.title || "").localeCompare(b.title || ""),
    );
  }
  // Server order is already updated-desc; keep it stable.
  return documents;
}

function OsLibraryFooter({
  pagination,
  page,
  onPageChange,
}: {
  pagination: OsPagination | undefined;
  page: number;
  onPageChange: (page: number) => void;
}) {
  const total = pagination?.total ?? 0;
  return (
    <footer className="mt-8 flex items-center justify-between border-t border-line-soft pt-4">
      <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-gray-400">
        {total} document{total === 1 ? "" : "s"}
      </p>
      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => onPageChange(Math.max(1, page - 1))}
            aria-label="Previous page"
            className="flex h-7 w-7 items-center justify-center rounded-[7px] border border-line-medium text-gray-500 transition-colors duration-150 hover:bg-gray-50 disabled:opacity-40"
          >
            <ChevronLeft className="h-3.5 w-3.5" strokeWidth={1.5} />
          </button>
          <span className="font-mono text-[11px] tabular-nums text-gray-400">
            {pagination.page}/{pagination.totalPages}
          </span>
          <button
            type="button"
            disabled={page >= pagination.totalPages}
            onClick={() => onPageChange(page + 1)}
            aria-label="Next page"
            className="flex h-7 w-7 items-center justify-center rounded-[7px] border border-line-medium text-gray-500 transition-colors duration-150 hover:bg-gray-50 disabled:opacity-40"
          >
            <ChevronRight className="h-3.5 w-3.5" strokeWidth={1.5} />
          </button>
        </div>
      )}
    </footer>
  );
}

function OsLibraryNoMatches({ onClear }: { onClear: () => void }) {
  return (
    <div className="border-t border-line-soft py-16 text-center">
      <p className="text-sm text-gray-500">No documents match these filters.</p>
      <button
        type="button"
        onClick={onClear}
        className="mt-3 rounded-[9px] border border-line-medium bg-alloro-surface px-3 py-1.5 text-[12px] font-medium text-gray-600 transition-colors duration-150 hover:bg-gray-50"
      >
        Clear filters
      </button>
    </div>
  );
}

export default function OsLibrary() {
  const [view, setView] = useState<OsLibraryView>("list");
  const [filters, setFilters] = useState<OsLibraryFilters>(
    OS_EMPTY_LIBRARY_FILTERS,
  );
  const [sort, setSort] = useState<OsLibrarySort>("updated");
  const [page, setPage] = useState(1);

  const documentsQuery = useAdminOsDocuments({
    category: filters.category ?? undefined,
    tag: filters.tag ?? undefined,
    ownerId: filters.ownerId ?? undefined,
    status: filters.status ?? undefined,
    page,
    limit: OS_LIBRARY_PAGE_SIZE,
  });
  const foldersQuery = useAdminOsFolders();
  const categoriesQuery = useAdminOsCategories();
  const usersQuery = useAdminOsUsers();
  const updateMeta = useUpdateOsDocumentMeta();

  const documents = useMemo(
    () => sortDocuments(documentsQuery.data?.documents ?? [], sort),
    [documentsQuery.data, sort],
  );
  const categoryOptions = useMemo(
    () => (categoriesQuery.data ?? []).map((category) => category.name),
    [categoriesQuery.data],
  );
  const tagOptions = useMemo(() => {
    const tags = new Set<string>();
    (documentsQuery.data?.documents ?? []).forEach((doc) =>
      doc.tags.forEach((tag) => tags.add(tag)),
    );
    return [...tags].sort((a, b) => a.localeCompare(b));
  }, [documentsQuery.data]);

  const hasActiveFilters = Object.values(filters).some(
    (value) => value !== null,
  );
  const isLoading = documentsQuery.isLoading;
  const isEmpty =
    !isLoading && !documentsQuery.isError && documents.length === 0;

  const handleFiltersChange = (next: OsLibraryFilters) => {
    setFilters(next);
    setPage(1);
  };

  const handleMoveDocument = (documentId: string, patch: OsUpdateMetaPatch) => {
    updateMeta.mutate({ documentId, patch });
  };

  return (
    <section>
      <OsLibraryControls
        view={view}
        onViewChange={setView}
        filters={filters}
        onFiltersChange={handleFiltersChange}
        sort={sort}
        onSortChange={setSort}
        categoryOptions={categoryOptions}
        tagOptions={tagOptions}
        owners={usersQuery.data ?? []}
        toolbar={<OsLibraryToolbar />}
      />

      {isLoading && (
        <div className="pt-6">
          <OsRowSkeleton rows={6} />
        </div>
      )}

      {documentsQuery.isError && (
        <OsErrorState
          message="Couldn't load the library"
          onRetry={() => void documentsQuery.refetch()}
        />
      )}

      {isEmpty && !hasActiveFilters && (
        <OsEmptyState
          icon={BookOpen}
          title="The library is empty"
          body="Create your first document — internal docs, playbooks, and SOPs live here."
          footer="0 documents · indexing idle"
        />
      )}

      {isEmpty && hasActiveFilters && (
        <OsLibraryNoMatches
          onClear={() => handleFiltersChange(OS_EMPTY_LIBRARY_FILTERS)}
        />
      )}

      {!isLoading && !documentsQuery.isError && documents.length > 0 && (
        <>
          {view === "list" && (
            <div className="pt-2">
              {documents.map((doc) => (
                <OsDocumentRow key={doc.id} doc={doc} />
              ))}
            </div>
          )}
          {view === "grouped" && (
            <OsGroupedView
              documents={documents}
              categoryOptions={categoryOptions}
              onMoveDocument={handleMoveDocument}
            />
          )}
          {view === "folders" && (
            <OsFolderTree
              documents={documents}
              folderTree={foldersQuery.data?.tree ?? []}
              onMoveDocument={handleMoveDocument}
            />
          )}
          <OsLibraryFooter
            pagination={documentsQuery.data?.pagination}
            page={page}
            onPageChange={setPage}
          />
        </>
      )}
    </section>
  );
}
