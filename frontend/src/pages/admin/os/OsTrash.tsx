import { Link } from "react-router-dom";
import { ArrowLeft, RotateCcw, Trash2 } from "lucide-react";
import type { OsDocumentListItem } from "../../../api/admin-os";
import {
  useAdminOsTrash,
  usePurgeOsDocument,
  useRestoreOsFromTrash,
} from "../../../hooks/queries/useAdminOsTrash";
import { useConfirm } from "../../../components/ui/ConfirmModal";
import { OsEmptyState } from "../../../components/Admin/os/shared/OsEmptyState";
import { OsErrorState } from "../../../components/Admin/os/shared/OsErrorState";
import { OsRowSkeleton } from "../../../components/Admin/os/shared/OsRowSkeleton";
import { OsStatusDot } from "../../../components/Admin/os/shared/OsStatusDot";
import {
  formatOsRelativeTime,
  osOwnerLabel,
} from "../../../components/Admin/os/shared/osFormat";

/**
 * Trash (plans/07042026-alloro-os-admin-port P3 T6): archived rows — muted
 * Spectral titles with the neutral dot — with Restore and a confirmed
 * permanent delete (the purge job is queued server-side, 202).
 */

function OsTrashRow({
  doc,
  onRestore,
  onPurge,
  isBusy,
}: {
  doc: OsDocumentListItem;
  onRestore: () => void;
  onPurge: () => void;
  isBusy: boolean;
}) {
  const ownerLabel = osOwnerLabel(doc.owner);
  return (
    <div className="flex items-center justify-between gap-3 border-t border-line-soft px-2 py-3.5">
      <div className="flex min-w-0 items-center gap-2.5">
        <OsStatusDot status="archived" />
        <h3 className="min-w-0 truncate font-display text-[17px] font-semibold text-gray-400">
          {doc.title || "Untitled"}
        </h3>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {ownerLabel && (
          <span className="hidden max-w-[140px] truncate font-mono text-[11px] text-gray-300 md:inline">
            {ownerLabel}
          </span>
        )}
        <span
          className="font-mono text-[11px] tabular-nums text-gray-400"
          title="Archived"
        >
          {doc.archived_at ? formatOsRelativeTime(doc.archived_at) : "—"}
        </span>
        <button
          type="button"
          onClick={onRestore}
          disabled={isBusy}
          className="inline-flex items-center gap-1.5 rounded-[9px] border border-line-medium bg-alloro-surface px-2.5 py-1.5 text-[12px] font-semibold text-gray-700 transition-colors duration-150 hover:bg-gray-50 disabled:opacity-50"
        >
          <RotateCcw className="h-3.5 w-3.5" strokeWidth={1.5} />
          Restore
        </button>
        <button
          type="button"
          onClick={onPurge}
          disabled={isBusy}
          className="inline-flex items-center gap-1.5 rounded-[9px] border border-alloro-danger/30 bg-alloro-surface px-2.5 py-1.5 text-[12px] font-semibold text-alloro-danger transition-colors duration-150 hover:bg-danger-soft disabled:opacity-50"
        >
          <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
          Delete forever
        </button>
      </div>
    </div>
  );
}

export default function OsTrash() {
  const trashQuery = useAdminOsTrash();
  const restore = useRestoreOsFromTrash();
  const purge = usePurgeOsDocument();
  const confirm = useConfirm();

  const documents = trashQuery.data?.documents ?? [];
  const isBusy = restore.isPending || purge.isPending;

  const handlePurge = async (doc: OsDocumentListItem) => {
    const confirmed = await confirm({
      title: `Delete "${doc.title}" forever?`,
      message:
        "This permanently removes the document, its versions, and its history. It cannot be undone.",
      confirmLabel: "Delete forever",
      variant: "danger",
    });
    if (confirmed) purge.mutate(doc.id);
  };

  return (
    <section className="mt-6 rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex items-center justify-between border-b border-line-soft pb-4">
        <div>
          <h2 className="font-display text-xl text-alloro-textDark">Trash</h2>
          <p className="mt-0.5 font-mono text-[11px] uppercase tracking-[0.12em] text-gray-400">
            {trashQuery.data?.pagination.total ?? 0} item
            {(trashQuery.data?.pagination.total ?? 0) === 1 ? "" : "s"}
          </p>
        </div>
        <Link
          to="/admin/os"
          className="inline-flex items-center gap-1.5 rounded-[9px] border border-line-medium bg-alloro-surface px-3 py-1.5 text-[12px] font-medium text-gray-600 transition-colors duration-150 hover:bg-gray-50"
        >
          <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.5} />
          Back to Library
        </Link>
      </div>

      {trashQuery.isLoading && (
        <div className="pt-2">
          <OsRowSkeleton rows={4} />
        </div>
      )}

      {trashQuery.isError && (
        <OsErrorState
          message="Couldn't load the trash"
          onRetry={() => void trashQuery.refetch()}
        />
      )}

      {!trashQuery.isLoading &&
        !trashQuery.isError &&
        documents.length === 0 && (
          <OsEmptyState
            icon={Trash2}
            title="Nothing in the trash"
            body="Archived documents wait here before permanent deletion."
            footer="0 items · purge idle"
          />
        )}

      {documents.length > 0 && (
        <div className="pt-2">
          {documents.map((doc) => (
            <OsTrashRow
              key={doc.id}
              doc={doc}
              onRestore={() => restore.mutate(doc.id)}
              onPurge={() => void handlePurge(doc)}
              isBusy={isBusy}
            />
          ))}
        </div>
      )}
    </section>
  );
}
