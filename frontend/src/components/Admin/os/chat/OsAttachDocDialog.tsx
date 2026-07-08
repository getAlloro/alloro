import { useState } from "react";
import { useAdminOsDocuments } from "../../../../hooks/queries/useAdminOsDocuments";
import { useAttachOsContext } from "../../../../hooks/queries/useAdminOsConversation";
import { OsModalShell } from "../shared/OsModalShell";
import { OsStatusDot } from "../shared/OsStatusDot";

/**
 * @-attach picker (plans/07042026-alloro-os-admin-port P5 T4). Lists library
 * documents (reuses the Library list hook, D12); clicking one grounds the
 * conversation in it via attach. Already-attached docs read "Attached" and are
 * disabled. Detach is driven from the chips above the input, not here. Uses the
 * shared OsModalShell surface (D13).
 */
export function OsAttachDocDialog({
  open,
  onClose,
  conversationId,
  attachedIds,
}: {
  open: boolean;
  onClose: () => void;
  conversationId: string;
  attachedIds: Set<string>;
}) {
  const { data, isLoading } = useAdminOsDocuments();
  const attach = useAttachOsContext(conversationId);
  const [busyId, setBusyId] = useState<string | null>(null);
  const documents = data?.documents ?? [];

  async function onPick(documentId: string) {
    setBusyId(documentId);
    try {
      await attach.mutateAsync(documentId);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <OsModalShell isOpen={open} onClose={onClose} label="Attach a document">
      <h2 className="font-display text-lg text-alloro-textDark">
        Attach a document
      </h2>
      <p className="mt-1 text-[13px] text-gray-500">
        Ground this conversation in a specific document.
      </p>
      <div className="mt-4 max-h-[55vh] space-y-1.5 overflow-y-auto">
        {isLoading && (
          <p className="py-6 text-center font-mono text-[11px] text-gray-400">
            Loading documents…
          </p>
        )}
        {!isLoading && documents.length === 0 && (
          <p className="py-6 text-center font-mono text-[11px] text-gray-400">
            No documents to attach yet.
          </p>
        )}
        {documents.map((doc) => {
          const isAttached = attachedIds.has(doc.id);
          return (
            <button
              key={doc.id}
              type="button"
              disabled={isAttached || busyId === doc.id}
              onClick={() => onPick(doc.id)}
              className={`flex w-full items-center justify-between gap-3 rounded-lg border border-gray-200 px-3 py-2.5 text-left transition-colors duration-150 ${
                isAttached
                  ? "opacity-50"
                  : "hover:border-alloro-orange/40 hover:bg-alloro-orange/5"
              }`}
            >
              <span className="truncate font-display text-[14px] text-alloro-textDark">
                {doc.title || "Untitled"}
              </span>
              {isAttached ? (
                <span className="shrink-0 font-mono text-[10px] uppercase text-alloro-orange">
                  Attached
                </span>
              ) : (
                <OsStatusDot status={doc.status} />
              )}
            </button>
          );
        })}
      </div>
    </OsModalShell>
  );
}
