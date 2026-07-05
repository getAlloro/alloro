import { MessageSquarePlus, Trash2 } from "lucide-react";
import { useConfirm } from "../../../ui/ConfirmModal";
import { formatOsRelativeTime } from "../shared/osFormat";
import type { OsChatConversation } from "../../../../api/admin-os-chat";

/**
 * Conversation rail (plans/07042026-alloro-os-admin-port P5 T4): a New chat
 * action over the thread list. Each row shows the title (falls back to "New
 * conversation"), an optional one-line preview, and a mono meta line of
 * relative last-activity time + message count, with a confirmed delete revealed
 * on hover. Pure presentation — data + actions come from the page. Terracotta
 * marks the active row (D13).
 */

function ConversationRow({
  conversation,
  active,
  onSelect,
  onDelete,
}: {
  conversation: OsChatConversation;
  active: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  const confirm = useConfirm();
  const count = conversation.message_count;

  async function requestDelete() {
    const confirmed = await confirm({
      title: `Delete "${conversation.title || "New conversation"}"?`,
      message: "This conversation and its messages are removed permanently.",
      confirmLabel: "Delete",
    });
    if (confirmed) onDelete();
  }

  return (
    <div
      className={`group flex items-center gap-2 rounded-lg border px-3 py-2 transition-colors duration-150 ${
        active
          ? "border-transparent bg-alloro-orange/10"
          : "border-transparent hover:bg-alloro-orange/5"
      }`}
    >
      <button
        type="button"
        onClick={onSelect}
        className="min-w-0 flex-1 text-left"
      >
        <p
          className={`truncate font-display text-[14px] ${
            active ? "text-alloro-textDark" : "text-gray-700"
          }`}
        >
          {conversation.title || "New conversation"}
        </p>
        {conversation.last_message_preview && (
          <p className="truncate text-[12px] text-gray-400">
            {conversation.last_message_preview}
          </p>
        )}
        <p className="font-mono text-[10px] text-gray-400">
          {formatOsRelativeTime(conversation.last_activity_at)} · {count}{" "}
          {count === 1 ? "message" : "messages"}
        </p>
      </button>
      <button
        type="button"
        aria-label="Delete conversation"
        onClick={(event) => {
          event.stopPropagation();
          void requestDelete();
        }}
        className="rounded-md px-1.5 py-1 text-gray-400 opacity-0 transition hover:bg-alloro-danger/10 hover:text-alloro-danger focus:opacity-100 group-hover:opacity-100"
      >
        <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
      </button>
    </div>
  );
}

export function OsConversationSidebar({
  conversations,
  isLoading,
  activeId,
  onSelect,
  onNew,
  onDelete,
  creating,
}: {
  conversations: OsChatConversation[] | undefined;
  isLoading: boolean;
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  creating: boolean;
}) {
  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-gray-200">
      <div className="p-3">
        <button
          type="button"
          onClick={onNew}
          disabled={creating}
          className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-gray-200 bg-alloro-surface px-3 py-2 font-sans text-sm font-medium text-gray-700 transition-colors duration-150 hover:border-alloro-orange/40 hover:text-alloro-orange disabled:opacity-50"
        >
          <MessageSquarePlus className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          New chat
        </button>
      </div>
      <div className="flex-1 space-y-1 overflow-y-auto px-2 pb-3">
        {isLoading && (
          <p className="px-3 py-6 text-center font-mono text-[11px] text-gray-400">
            Loading…
          </p>
        )}
        {!isLoading && conversations && conversations.length === 0 && (
          <p className="px-3 py-6 text-center font-mono text-[11px] text-gray-400">
            No conversations yet.
          </p>
        )}
        {conversations?.map((conversation) => (
          <ConversationRow
            key={conversation.id}
            conversation={conversation}
            active={conversation.id === activeId}
            onSelect={() => onSelect(conversation.id)}
            onDelete={() => onDelete(conversation.id)}
          />
        ))}
      </div>
    </aside>
  );
}
