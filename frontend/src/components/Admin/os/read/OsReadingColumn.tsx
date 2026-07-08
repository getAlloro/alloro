import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "react-hot-toast";
import { ListTree, Pencil, RotateCw, Trash2 } from "lucide-react";
import type {
  OsDocumentListItem,
  OsDocumentVersion,
  OsUpdateMetaPatch,
} from "../../../../api/admin-os";
import {
  useArchiveOsDocument,
  useReindexOsDocument,
  useRenameOsDocument,
  useUpdateOsDocumentMeta,
} from "../../../../hooks/queries/useAdminOsDocumentMutations";
import { useConfirm } from "../../../ui/ConfirmModal";
import { OsCategoryPill } from "../library/OsCategoryPill";
import { OsOwnerPicker } from "../library/OsOwnerPicker";
import { OsTagChips } from "../library/OsTagChips";
import { OsStatusDot } from "../shared/OsStatusDot";
import { formatOsRelativeTime } from "../shared/osFormat";
import { OsDocumentToc } from "./OsDocumentToc";
import { OsInlineTitle } from "./OsInlineTitle";
import { OsMarkdownBody } from "./OsMarkdownBody";

/**
 * Center reading column (P3 T3): inline-editable Spectral title, mono meta,
 * editable category/tags/owner header, and the rendered live version in a
 * 70ch measure with a toggleable TOC.
 */

function OsEmptyBody({
  status,
  onReindex,
  isReindexing,
}: {
  status: OsDocumentListItem["status"];
  onReindex: () => void;
  isReindexing: boolean;
}) {
  if (status === "processing") {
    return (
      <div className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-line-medium bg-gray-50/60 px-4 py-10 text-center">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber motion-safe:animate-pulse" />
        <p className="text-sm text-gray-500">
          Processing this document — content appears here once indexing
          finishes.
        </p>
      </div>
    );
  }
  if (status === "processing_failed") {
    return (
      <div className="rounded-xl bg-danger-soft px-4 py-8 text-center">
        <p className="text-sm text-alloro-danger">
          We couldn't process this document.
        </p>
        <button
          type="button"
          onClick={onReindex}
          disabled={isReindexing}
          className="mt-3 inline-flex items-center gap-1.5 rounded-[9px] border border-alloro-danger/30 bg-alloro-surface px-3 py-1.5 text-[12px] font-semibold text-alloro-danger transition-colors duration-150 hover:bg-danger-soft disabled:opacity-60"
        >
          <RotateCw
            className={`h-3.5 w-3.5 ${isReindexing ? "motion-safe:animate-spin" : ""}`}
            strokeWidth={1.5}
          />
          {isReindexing ? "Reindexing…" : "Reindex"}
        </button>
      </div>
    );
  }
  return (
    <p className="rounded-xl border border-dashed border-line-medium bg-gray-50/60 px-4 py-10 text-center text-sm text-gray-400">
      No published version yet — open the editor to write the first one.
    </p>
  );
}

/** Compact "Indexing failed — Reindex" banner shown whenever a document is in
 *  the processing_failed state, even if it still has a readable live version
 *  (a reindex of existing content can fail). Complements the red status dot. */
function OsReindexBanner({
  onReindex,
  isReindexing,
}: {
  onReindex: () => void;
  isReindexing: boolean;
}) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 rounded-[9px] bg-danger-soft px-3 py-2">
      <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-alloro-danger" />
      <span className="text-[12px] text-alloro-danger">
        Indexing failed — search and related links may be stale.
      </span>
      <button
        type="button"
        onClick={onReindex}
        disabled={isReindexing}
        className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-alloro-danger/30 bg-alloro-surface px-2.5 py-1 text-[11px] font-semibold text-alloro-danger transition-colors duration-150 hover:bg-danger-soft disabled:opacity-60"
      >
        <RotateCw
          className={`h-3 w-3 ${isReindexing ? "motion-safe:animate-spin" : ""}`}
          strokeWidth={1.75}
        />
        {isReindexing ? "Reindexing…" : "Reindex"}
      </button>
    </div>
  );
}

function OsReadingHeader({
  document,
  version,
  onRename,
  isRenaming,
  onPatchMeta,
  isMetaSaving,
  onEdit,
  onArchive,
  isArchiving,
  onReindex,
  isReindexing,
}: {
  document: OsDocumentListItem;
  version: OsDocumentVersion | null;
  onRename: (title: string) => void;
  isRenaming: boolean;
  onPatchMeta: (patch: OsUpdateMetaPatch) => void;
  isMetaSaving: boolean;
  onEdit: () => void;
  onArchive: () => void;
  isArchiving: boolean;
  onReindex: () => void;
  isReindexing: boolean;
}) {
  return (
    <header className="border-b border-line-soft pb-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <OsInlineTitle
            title={document.title}
            onRename={onRename}
            isSaving={isRenaming}
          />
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <OsStatusDot status={document.status} withLabel />
            {version && (
              <span className="font-mono text-[11px] tabular-nums text-gray-400">
                v{version.version_no}
              </span>
            )}
            <span className="font-mono text-[11px] tabular-nums text-gray-400">
              updated {formatOsRelativeTime(document.updated_at)}
            </span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={onArchive}
            disabled={isArchiving}
            aria-label="Move to trash"
            title="Move to trash"
            className="flex h-9 w-9 items-center justify-center rounded-[9px] border border-line-medium bg-alloro-surface text-gray-400 transition-colors duration-150 hover:border-alloro-danger/40 hover:text-alloro-danger disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" strokeWidth={1.5} />
          </button>
          <button
            type="button"
            onClick={onEdit}
            className="inline-flex items-center gap-1.5 rounded-[9px] bg-alloro-orange px-3.5 py-2 text-sm font-semibold text-white transition-colors duration-150 hover:bg-alloro-orange/90"
          >
            <Pencil className="h-4 w-4" strokeWidth={1.5} />
            Edit
          </button>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <OsCategoryPill
          category={document.category}
          onSelect={(category) => onPatchMeta({ category })}
          isSaving={isMetaSaving}
        />
        <OsOwnerPicker
          owner={document.owner}
          onSelect={(ownerId) => onPatchMeta({ owner_id: ownerId })}
          isSaving={isMetaSaving}
        />
        <OsTagChips
          tags={document.tags}
          onChange={(tags) => onPatchMeta({ tags })}
          isSaving={isMetaSaving}
        />
      </div>
      {/* Failed + still has a readable version → surface Reindex here too
          (the null-version case shows its own Reindex in OsEmptyBody). */}
      {document.status === "processing_failed" && version && (
        <OsReindexBanner onReindex={onReindex} isReindexing={isReindexing} />
      )}
    </header>
  );
}

export function OsReadingColumn({
  document,
  version,
}: {
  document: OsDocumentListItem;
  version: OsDocumentVersion | null;
}) {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const rename = useRenameOsDocument(document.id);
  const updateMeta = useUpdateOsDocumentMeta();
  const archive = useArchiveOsDocument();
  const reindex = useReindexOsDocument(document.id);
  const [isTocVisible, setIsTocVisible] = useState(false);

  const handleArchive = async () => {
    const confirmed = await confirm({
      title: `Move "${document.title}" to trash?`,
      message: "You can restore it from the Trash at any time.",
      confirmLabel: "Move to trash",
      variant: "danger",
    });
    if (!confirmed) return;
    archive.mutate(document.id, {
      onSuccess: () => {
        toast.success("Moved to trash");
        navigate("/admin/os");
      },
    });
  };

  const tocEntries = version?.toc_json ?? [];

  return (
    <main className="min-w-0 rounded-xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8">
      <OsReadingHeader
        document={document}
        version={version}
        onRename={(title) => rename.mutate(title)}
        isRenaming={rename.isPending}
        onPatchMeta={(patch) =>
          updateMeta.mutate({ documentId: document.id, patch })
        }
        isMetaSaving={updateMeta.isPending}
        onEdit={() => navigate(`/admin/os/doc/${document.id}/edit`)}
        onArchive={() => void handleArchive()}
        isArchiving={archive.isPending}
        onReindex={() => reindex.mutate()}
        isReindexing={reindex.isPending}
      />

      <div className="mt-6">
        {tocEntries.length > 0 && (
          <button
            type="button"
            onClick={() => setIsTocVisible((v) => !v)}
            aria-expanded={isTocVisible}
            className="mb-4 hidden items-center gap-1.5 rounded-[9px] border border-line-medium px-2.5 py-1.5 font-mono text-[11px] text-gray-500 transition-colors duration-150 hover:bg-accent-soft/60 hover:text-gray-800 lg:inline-flex"
          >
            <ListTree className="h-3.5 w-3.5" strokeWidth={1.5} />
            {isTocVisible ? "Hide contents" : "Contents"}
          </button>
        )}
        <div className="flex gap-8">
          {isTocVisible && <OsDocumentToc entries={tocEntries} />}
          <article className="min-w-0 max-w-[70ch] flex-1">
            {version ? (
              <OsMarkdownBody markdown={version.content_md} />
            ) : (
              <OsEmptyBody
                status={document.status}
                onReindex={() => reindex.mutate()}
                isReindexing={reindex.isPending}
              />
            )}
          </article>
        </div>
      </div>
    </main>
  );
}
