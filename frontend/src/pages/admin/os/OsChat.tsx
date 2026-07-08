import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, MessageSquare } from "lucide-react";
import {
  useAdminOsConversations,
  useCreateOsConversation,
  useDeleteOsConversation,
} from "../../../hooks/queries/useAdminOsConversations";
import { useAdminOsConversation } from "../../../hooks/queries/useAdminOsConversation";
import { useOsChatStream } from "../../../hooks/queries/useOsChatStream";
import { useOsStreamScroll } from "../../../hooks/useOsStreamScroll";
import { useOsDocTitles } from "../../../hooks/queries/useOsDocTitles";
import { OsConversationSidebar } from "../../../components/Admin/os/chat/OsConversationSidebar";
import { OsMessageThread } from "../../../components/Admin/os/chat/OsMessageThread";
import { OsChatInput } from "../../../components/Admin/os/chat/OsChatInput";

/**
 * Chat sub-tab (plans/07042026-alloro-os-admin-port P5 T4). Two panes on warm
 * paper inside the OS shell: a conversation rail and the active panel (transcript
 * + composer). Owns selection + create/delete; the stream hook owns the live
 * send and writes tokens into the conversation cache the thread reads from.
 * Auto-selects the newest conversation so the panel is never blank when chats
 * exist. Empty state (zero conversations) invites the first chat.
 */

// The shell renders a header + sub-nav above this; bound the two-pane box to the
// remaining viewport so only the transcript scrolls (not the page).
const OS_CHAT_HEIGHT = "min-h-[520px] h-[calc(100vh-320px)]";

function OsChatEmptyState({
  onNew,
  creating,
}: {
  onNew: () => void;
  creating: boolean;
}) {
  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="mx-auto flex max-w-md flex-col items-center px-6 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full border border-gray-200 bg-alloro-surface">
          <MessageSquare className="h-5 w-5 text-gray-400" strokeWidth={1.5} />
        </div>
        <h2 className="mt-5 font-display text-xl text-alloro-textDark">
          Ask the knowledge base
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-gray-500">
          Get grounded answers with citations from your indexed documents — or an
          honest note when nothing matches.
        </p>
        <button
          type="button"
          onClick={onNew}
          disabled={creating}
          className="mt-6 inline-flex items-center gap-2 rounded-lg bg-alloro-orange px-4 py-2 font-sans text-sm font-semibold text-white transition-colors duration-150 hover:bg-alloro-orange/90 disabled:opacity-60"
        >
          Start a conversation
        </button>
      </div>
    </div>
  );
}

function OsChatPanel({ conversationId }: { conversationId: string }) {
  const { data, isLoading } = useAdminOsConversation(conversationId);
  const { send, cancel, isStreaming, status } = useOsChatStream(conversationId);
  const titleFor = useOsDocTitles();

  const messages = data?.messages ?? [];
  const context = data?.context ?? [];
  const lastContent = messages[messages.length - 1]?.content;
  const { scrollRef, endRef, atBottom, onScroll, scrollToBottom } =
    useOsStreamScroll([messages.length, lastContent, isStreaming]);

  return (
    <section className="relative flex min-h-0 min-w-0 flex-1 flex-col">
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="min-h-0 flex-1 overflow-y-auto px-4 py-6"
      >
        {isLoading && messages.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <p className="font-mono text-[11px] text-gray-400">
              Loading conversation…
            </p>
          </div>
        ) : (
          <div className="mx-auto max-w-3xl">
            <OsMessageThread
              messages={messages}
              isStreaming={isStreaming}
              statusText={status}
              titleFor={titleFor}
              endRef={endRef}
            />
          </div>
        )}
      </div>

      <AnimatePresence>
        {!atBottom && messages.length > 0 && (
          <motion.button
            type="button"
            onClick={scrollToBottom}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.18 }}
            className="absolute bottom-[108px] left-1/2 z-10 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-alloro-orange px-3.5 py-1.5 font-sans text-xs font-semibold text-white shadow-lg transition hover:bg-alloro-orange/90"
          >
            <ChevronDown className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
            Jump to latest
          </motion.button>
        )}
      </AnimatePresence>

      <div className="mx-auto w-full max-w-3xl">
        <OsChatInput
          conversationId={conversationId}
          context={context}
          isStreaming={isStreaming}
          titleFor={titleFor}
          onSend={send}
          onCancel={cancel}
        />
      </div>
    </section>
  );
}

export default function OsChat() {
  const { data: conversations, isLoading } = useAdminOsConversations();
  const createConversation = useCreateOsConversation();
  const deleteConversation = useDeleteOsConversation();
  const [activeId, setActiveId] = useState<string | null>(null);

  // Keep a valid selection: pick the newest when none is chosen or the chosen
  // one disappears (deleted). Server state stays in React Query; only the
  // selection is local UI state (§15.1/§15.2).
  useEffect(() => {
    if (!conversations) return;
    if (activeId && conversations.some((c) => c.id === activeId)) return;
    setActiveId(conversations[0]?.id ?? null);
  }, [conversations, activeId]);

  async function onNew() {
    const conversation = await createConversation.mutateAsync(undefined);
    setActiveId(conversation.id);
  }

  function onDelete(id: string) {
    deleteConversation.mutate(id, {
      onSuccess: () => {
        if (id === activeId) setActiveId(null);
      },
    });
  }

  return (
    <div
      className={`mt-6 flex overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm ${OS_CHAT_HEIGHT}`}
    >
      <OsConversationSidebar
        conversations={conversations}
        isLoading={isLoading}
        activeId={activeId}
        onSelect={setActiveId}
        onNew={() => void onNew()}
        onDelete={onDelete}
        creating={createConversation.isPending}
      />
      {activeId ? (
        <OsChatPanel key={activeId} conversationId={activeId} />
      ) : (
        <OsChatEmptyState
          onNew={() => void onNew()}
          creating={createConversation.isPending}
        />
      )}
    </div>
  );
}
