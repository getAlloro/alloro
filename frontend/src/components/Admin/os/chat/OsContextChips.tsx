import { X } from "lucide-react";
import { useDetachOsContext } from "../../../../hooks/queries/useAdminOsConversation";
import type { OsChatContextDocument } from "../../../../api/admin-os-chat";

/**
 * Grounded-context chips above the input (plans/07042026-alloro-os-admin-port
 * P5 T4). Each shows an attached document's title with an × to detach it.
 * Renders nothing when no docs are attached. Mono chrome; the title carries
 * Spectral (D13).
 */
export function OsContextChips({
  conversationId,
  context,
  titleFor,
}: {
  conversationId: string;
  context: OsChatContextDocument[];
  titleFor: (documentId: string) => string | undefined;
}) {
  const detach = useDetachOsContext(conversationId);
  if (context.length === 0) return null;

  return (
    <div className="mb-2 flex flex-wrap items-center gap-1.5">
      <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-gray-400">
        Context
      </span>
      {context.map((entry) => (
        <span
          key={entry.document_id}
          className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-alloro-orange/5 py-0.5 pl-2.5 pr-1 font-display text-[12px] text-gray-700"
        >
          <span className="max-w-[14rem] truncate">
            {titleFor(entry.document_id) ?? "Document"}
          </span>
          <button
            type="button"
            aria-label="Remove context document"
            onClick={() => detach.mutate(entry.document_id)}
            disabled={detach.isPending}
            className="rounded-full p-0.5 text-gray-400 transition-colors duration-150 hover:bg-alloro-orange/15 hover:text-alloro-orange disabled:opacity-50"
          >
            <X className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
          </button>
        </span>
      ))}
    </div>
  );
}
