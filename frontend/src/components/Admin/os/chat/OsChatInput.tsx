import { useState, type KeyboardEvent } from "react";
import { Paperclip, Send } from "lucide-react";
import { OsContextChips } from "./OsContextChips";
import { OsAttachDocDialog } from "./OsAttachDocDialog";
import type { OsChatContextDocument } from "../../../../api/admin-os-chat";

/**
 * The composer (plans/07042026-alloro-os-admin-port P5 T4): attached-context
 * chips, an @-attach button, a growing textarea (Enter sends, Shift+Enter
 * newlines), and a send/stop toggle. Owns only its draft text and the picker's
 * open state; sending, cancelling, and grounding are delegated upward. Warm
 * paper + terracotta accent (D13).
 */
export function OsChatInput({
  conversationId,
  context,
  isStreaming,
  titleFor,
  onSend,
  onCancel,
}: {
  conversationId: string;
  context: OsChatContextDocument[];
  isStreaming: boolean;
  titleFor: (documentId: string) => string | undefined;
  onSend: (text: string) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const attachedIds = new Set(context.map((entry) => entry.document_id));

  function submit() {
    const trimmed = text.trim();
    if (!trimmed || isStreaming) return;
    onSend(trimmed);
    setText("");
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  }

  return (
    <div className="border-t border-gray-200 bg-gray-50 px-4 py-3">
      <OsContextChips
        conversationId={conversationId}
        context={context}
        titleFor={titleFor}
      />
      <div className="flex items-end gap-2 rounded-xl border border-gray-200 bg-alloro-surface p-2 transition focus-within:border-alloro-orange/40 focus-within:ring-2 focus-within:ring-alloro-orange/15">
        <button
          type="button"
          aria-label="Attach a document"
          onClick={() => setPickerOpen(true)}
          className="rounded-lg px-2.5 py-2 text-gray-400 transition-colors duration-150 hover:bg-alloro-orange/10 hover:text-alloro-orange"
        >
          <Paperclip className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
        </button>
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={onKeyDown}
          rows={1}
          placeholder="Ask anything about the knowledge base…"
          aria-label="Message"
          className="max-h-40 flex-1 resize-none bg-transparent py-2 font-sans text-[15px] text-alloro-textDark placeholder:text-gray-400 focus:outline-none"
        />
        {isStreaming ? (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-gray-200 px-3 py-2 font-sans text-sm text-gray-600 transition-colors duration-150 hover:bg-gray-50"
          >
            Stop
          </button>
        ) : (
          <button
            type="button"
            onClick={submit}
            disabled={!text.trim()}
            aria-label="Send message"
            className="inline-flex items-center gap-1.5 rounded-lg bg-alloro-orange px-3.5 py-2 font-sans text-sm font-semibold text-white transition-colors duration-150 hover:bg-alloro-orange/90 disabled:opacity-50"
          >
            <Send className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
            Send
          </button>
        )}
      </div>
      <OsAttachDocDialog
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        conversationId={conversationId}
        attachedIds={attachedIds}
      />
    </div>
  );
}
