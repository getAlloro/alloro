import type { RefObject } from "react";
import { OsChatMessage } from "./OsChatMessage";
import type { OsChatMessage as OsChatMessageType } from "../../../../api/admin-os-chat";

/**
 * The transcript + the bottom sentinel (plans/07042026-alloro-os-admin-port
 * P5 T4). Stream-following scroll is owned by the parent's useOsStreamScroll,
 * which watches the sentinel. Only the trailing assistant turn shows the
 * thinking cue / streaming caret while a send is in flight. Empty state invites
 * the first question.
 */
export function OsMessageThread({
  messages,
  isStreaming,
  statusText,
  titleFor,
  endRef,
}: {
  messages: OsChatMessageType[];
  isStreaming: boolean;
  statusText?: string | null;
  titleFor: (documentId: string) => string | undefined;
  endRef: RefObject<HTMLDivElement | null>;
}) {
  if (messages.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="font-display text-[15px] italic text-gray-400">
          Ask anything about the knowledge base.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {messages.map((message, index) => (
        <OsChatMessage
          key={message.id}
          message={message}
          streaming={
            isStreaming &&
            message.role === "assistant" &&
            index === messages.length - 1
          }
          statusText={statusText}
          titleFor={titleFor}
        />
      ))}
      <div ref={endRef} />
    </div>
  );
}
