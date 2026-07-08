import { Link, useParams } from "react-router-dom";
import { ArrowLeft, FileQuestion } from "lucide-react";
import { useAdminOsDocument } from "../../../hooks/queries/useAdminOsDocument";
import { OsDocRail } from "../../../components/Admin/os/read/OsDocRail";
import { OsHistoryRail } from "../../../components/Admin/os/read/OsHistoryRail";
import { OsReadingColumn } from "../../../components/Admin/os/read/OsReadingColumn";
import { OsEmptyState } from "../../../components/Admin/os/shared/OsEmptyState";
import { OsErrorState } from "../../../components/Admin/os/shared/OsErrorState";
import { OsRowSkeleton } from "../../../components/Admin/os/shared/OsRowSkeleton";

/**
 * DocumentRead (plans/07042026-alloro-os-admin-port P3 T3): 3-pane workspace
 * — left doc rail · center 70ch Spectral reading column · right rail with
 * History (T5) and Related/Comments placeholders. Below xl the rails
 * collapse: the doc rail hides and the right rail stacks under the content.
 */
export default function OsDocumentRead() {
  const { id } = useParams<{ id: string }>();
  const documentId = id ?? null;
  const detailQuery = useAdminOsDocument(documentId);

  if (!documentId) {
    return (
      <OsEmptyState
        icon={FileQuestion}
        title="Document not found"
        body="This link is missing a document id."
      />
    );
  }

  return (
    <div className="grid grid-cols-1 items-start gap-8 pt-6 xl:grid-cols-[220px_minmax(0,1fr)_320px]">
      <OsDocRail activeDocumentId={documentId} />

      <div className="min-w-0">
        <Link
          to="/admin/os"
          className="mb-4 inline-flex items-center gap-1.5 font-mono text-[11px] text-gray-400 transition-colors duration-150 hover:text-gray-700 xl:hidden"
        >
          <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.5} />
          Library
        </Link>

        {detailQuery.isLoading && (
          <div>
            <div className="h-8 w-1/2 rounded bg-gray-200/80 motion-safe:animate-pulse" />
            <div className="mt-8">
              <OsRowSkeleton rows={5} />
            </div>
          </div>
        )}

        {detailQuery.isError && (
          <OsErrorState
            message="Couldn't load this document"
            onRetry={() => void detailQuery.refetch()}
          />
        )}

        {detailQuery.data && (
          <OsReadingColumn
            document={detailQuery.data.document}
            version={detailQuery.data.version}
          />
        )}
      </div>

      <aside className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm xl:sticky xl:top-24 xl:max-h-[calc(100vh-8rem)] xl:overflow-y-auto sm:p-5">
        {detailQuery.data && (
          <OsHistoryRail
            documentId={documentId}
            currentVersionNo={detailQuery.data.version?.version_no ?? null}
          />
        )}
      </aside>
    </div>
  );
}
