import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "react-hot-toast";
import { FileQuestion, Send, X } from "lucide-react";
import { useAdminOsDocument, useAdminOsDraft } from "../../../hooks/queries/useAdminOsDocument";
import { useAdminOsLock } from "../../../hooks/queries/useAdminOsLock";
import { useAdminOsUsers } from "../../../hooks/queries/useAdminOsUsers";
import { useOsDraftAutosave } from "../../../hooks/useOsDraftAutosave";
import { OsEditor } from "../../../components/Admin/os/edit/OsEditor";
import { OsLockBanner } from "../../../components/Admin/os/edit/OsLockBanner";
import { OsPublishModal } from "../../../components/Admin/os/edit/OsPublishModal";
import { OsEmptyState } from "../../../components/Admin/os/shared/OsEmptyState";
import { OsErrorState } from "../../../components/Admin/os/shared/OsErrorState";

/**
 * DocumentEdit (plans/07042026-alloro-os-admin-port P3 T4) — the lazy-loaded
 * editor route: TipTap over markdown storage, 800ms draft autosave, edit-lock
 * lifecycle (banner + read-only when held elsewhere), and the publish flow.
 */

function OsEditHeader({
  title,
  banner,
  onExit,
  onPublish,
  isPublishDisabled,
}: {
  title: string;
  banner: ReactNode;
  onExit: () => void;
  onPublish: () => void;
  isPublishDisabled: boolean;
}) {
  return (
    <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <h1 className="truncate font-display text-2xl font-semibold tracking-tight text-alloro-textDark">
          {title || "Untitled"}
        </h1>
        <div className="mt-1.5">{banner}</div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={onExit}
          className="inline-flex items-center gap-1.5 rounded-[9px] border border-line-medium bg-alloro-surface px-3 py-2 text-sm font-medium text-gray-600 transition-colors duration-150 hover:bg-gray-50"
        >
          <X className="h-4 w-4" strokeWidth={1.5} />
          Exit
        </button>
        <button
          type="button"
          onClick={onPublish}
          disabled={isPublishDisabled}
          className="inline-flex items-center gap-1.5 rounded-[9px] bg-alloro-orange px-3.5 py-2 text-sm font-semibold text-white transition-colors duration-150 hover:bg-alloro-orange/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Send className="h-4 w-4" strokeWidth={1.75} />
          Publish
        </button>
      </div>
    </header>
  );
}

export default function OsDocumentEdit() {
  const { id } = useParams<{ id: string }>();
  const documentId = id ?? null;
  const navigate = useNavigate();

  const detailQuery = useAdminOsDocument(documentId);
  const draftQuery = useAdminOsDraft(documentId);
  const lock = useAdminOsLock(documentId);
  const usersQuery = useAdminOsUsers();

  const [content, setContent] = useState("");
  const [isSeeded, setIsSeeded] = useState(false);
  const [baseVersionOverride, setBaseVersionOverride] = useState<number | null>(
    null,
  );
  const [isPublishOpen, setIsPublishOpen] = useState(false);

  // Seed the editor once from the loaded draft; local state owns it after.
  useEffect(() => {
    if (draftQuery.data && !isSeeded) {
      setContent(draftQuery.data.content_md);
      setIsSeeded(true);
    }
  }, [draftQuery.data, isSeeded]);

  const effectiveBaseVersion =
    baseVersionOverride ?? draftQuery.data?.base_version ?? 0;

  const autosave = useOsDraftAutosave(
    documentId,
    content,
    effectiveBaseVersion,
    isSeeded && lock.isHeld,
  );

  const holderName = useMemo(() => {
    if (lock.heldByUserId === null) return null;
    const holder = (usersQuery.data ?? []).find(
      (user) => user.id === lock.heldByUserId,
    );
    return holder ? holder.name || holder.email : null;
  }, [lock.heldByUserId, usersQuery.data]);

  if (!documentId) {
    return (
      <OsEmptyState
        icon={FileQuestion}
        title="Document not found"
        body="This link is missing a document id."
      />
    );
  }

  const handleOpenPublish = async () => {
    try {
      await autosave.saveNow();
      setIsPublishOpen(true);
    } catch {
      toast.error("Couldn't save the draft — check your connection and retry.");
    }
  };

  const handlePublished = (versionNo: number) => {
    setIsPublishOpen(false);
    toast.success(`Published v${versionNo}`);
    navigate(`/admin/os/doc/${documentId}`);
  };

  /**
   * Publish-conflict reload: pull the latest published version number and
   * re-base the draft on it. The author's text is kept verbatim — publishing
   * afterwards replaces the newer version's content, which the modal states.
   */
  const handleConflictReload = async () => {
    const result = await detailQuery.refetch();
    const liveVersionNo = result.data?.version?.version_no ?? 0;
    setBaseVersionOverride(liveVersionNo);
    await autosave.saveNow(liveVersionNo);
  };

  const isLoading = draftQuery.isLoading || detailQuery.isLoading;

  return (
    <div className="mx-auto max-w-6xl pt-6">
      <OsEditHeader
        title={detailQuery.data?.document.title ?? ""}
        banner={
          <OsLockBanner
            lockState={lock.state}
            holderName={holderName}
            saveStatus={autosave.status}
            lastSavedAt={autosave.lastSavedAt}
            onRetry={lock.retry}
          />
        }
        onExit={() => navigate(`/admin/os/doc/${documentId}`)}
        onPublish={() => void handleOpenPublish()}
        isPublishDisabled={!lock.isHeld || !isSeeded}
      />

      {draftQuery.isError && (
        <OsErrorState
          message="Couldn't load the draft"
          onRetry={() => void draftQuery.refetch()}
        />
      )}

      {isLoading && !isSeeded ? (
        <div className="min-h-[60vh] rounded-xl border border-line-soft bg-alloro-surface motion-safe:animate-pulse" />
      ) : (
        !draftQuery.isError && (
          <OsEditor
            documentId={documentId}
            content={content}
            onChange={setContent}
            isEditable={lock.isHeld && isSeeded}
          />
        )
      )}

      <OsPublishModal
        documentId={documentId}
        isOpen={isPublishOpen}
        onClose={() => setIsPublishOpen(false)}
        baseVersion={effectiveBaseVersion}
        onPublished={handlePublished}
        onConflictReload={handleConflictReload}
      />
    </div>
  );
}
