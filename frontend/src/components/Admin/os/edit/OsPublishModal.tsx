import { useEffect, useState } from "react";
import { toast } from "react-hot-toast";
import { Send } from "lucide-react";
import { ApiError } from "../../../../api";
import { usePublishOsDocument } from "../../../../hooks/queries/useAdminOsDocumentMutations";
import { getErrorMessage } from "../../../../lib/errorMessage";
import { OsModalShell } from "../shared/OsModalShell";

/**
 * Publish flow (P3 T4): optional note → POST publish with the draft's
 * base_version. A 409 OS_VERSION_CONFLICT toasts and offers a reload that
 * re-bases the draft on the latest published version (the parent owns the
 * actual re-base). OS_VERSION_NO_CHANGES surfaces as a plain toast.
 */

function OsConflictNotice({
  onReload,
  isReloading,
}: {
  onReload: () => void;
  isReloading: boolean;
}) {
  return (
    <div className="mt-4 rounded-xl bg-amber-soft px-3.5 py-3">
      <p className="text-[13px] text-gray-800">
        Someone published a newer version while you were editing. Reload to
        re-base your draft on it — your text stays as-is and replaces theirs
        when you publish.
      </p>
      <button
        type="button"
        onClick={onReload}
        disabled={isReloading}
        className="mt-3 rounded-[9px] bg-alloro-orange px-3 py-1.5 text-[12px] font-semibold text-white transition-colors duration-150 hover:bg-alloro-orange/90 disabled:opacity-50"
      >
        {isReloading ? "Reloading…" : "Reload latest"}
      </button>
    </div>
  );
}

export function OsPublishModal({
  documentId,
  isOpen,
  onClose,
  baseVersion,
  onPublished,
  onConflictReload,
}: {
  documentId: string;
  isOpen: boolean;
  onClose: () => void;
  baseVersion: number;
  onPublished: (versionNo: number) => void;
  onConflictReload: () => Promise<void>;
}) {
  const publish = usePublishOsDocument(documentId);
  const [note, setNote] = useState("");
  const [hasConflict, setHasConflict] = useState(false);
  const [isReloading, setIsReloading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setNote("");
      setHasConflict(false);
    }
  }, [isOpen]);

  const handlePublish = async () => {
    if (publish.isPending) return;
    try {
      const { version } = await publish.mutateAsync({
        base_version: baseVersion,
        note: note.trim() || null,
      });
      onPublished(version.version_no);
    } catch (error) {
      if (error instanceof ApiError && error.code === "OS_VERSION_CONFLICT") {
        setHasConflict(true);
        toast.error("This document changed since you started editing.");
        return;
      }
      if (error instanceof ApiError && error.code === "OS_VERSION_NO_CHANGES") {
        toast.error("Nothing to publish — the draft matches the live version.");
        onClose();
        return;
      }
      toast.error(getErrorMessage(error) || "Publish failed");
    }
  };

  const handleConflictReload = async () => {
    setIsReloading(true);
    try {
      await onConflictReload();
      setHasConflict(false);
      toast.success("Draft re-based on the latest version — review, then publish.");
    } catch (error) {
      toast.error(getErrorMessage(error) || "Couldn't reload the latest version");
    } finally {
      setIsReloading(false);
    }
  };

  return (
    <OsModalShell isOpen={isOpen} onClose={onClose} label="Publish version">
      <h3 className="font-display text-lg text-alloro-textDark">
        Publish version
      </h3>
      <p className="mt-1 font-mono text-[11px] tabular-nums text-gray-400">
        base v{baseVersion} → v{baseVersion + 1}
      </p>

      {hasConflict ? (
        <OsConflictNotice
          onReload={() => void handleConflictReload()}
          isReloading={isReloading}
        />
      ) : (
        <textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          rows={3}
          placeholder="Optional note for the history (what changed, why)"
          aria-label="Version note"
          className="mt-4 w-full resize-none rounded-lg border border-line-medium bg-alloro-surface px-3 py-2 text-sm text-gray-800 outline-none transition-colors duration-150 focus:border-alloro-orange"
        />
      )}

      <div className="mt-5 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded-[9px] border border-line-medium px-3.5 py-2 text-sm font-medium text-gray-600 transition-colors duration-150 hover:bg-gray-50"
        >
          Cancel
        </button>
        {!hasConflict && (
          <button
            type="button"
            onClick={() => void handlePublish()}
            disabled={publish.isPending}
            className="inline-flex items-center gap-1.5 rounded-[9px] bg-alloro-orange px-3.5 py-2 text-sm font-semibold text-white transition-colors duration-150 hover:bg-alloro-orange/90 disabled:opacity-50"
          >
            <Send className="h-4 w-4" strokeWidth={1.75} />
            {publish.isPending ? "Publishing…" : "Publish"}
          </button>
        )}
      </div>
    </OsModalShell>
  );
}
