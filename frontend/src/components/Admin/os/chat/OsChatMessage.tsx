import { motion, useReducedMotion } from "framer-motion";
import { OsMarkdownBody } from "../read/OsMarkdownBody";
import { OsCitationChip } from "./OsCitationChip";
import { OsThinkingIndicator } from "./OsThinkingIndicator";
import type { OsChatMessage as OsChatMessageType } from "../../../../api/admin-os-chat";

/**
 * One chat turn (plans/07042026-alloro-os-admin-port P5 T4). User turns are
 * plain text in a right-aligned terracotta-tinted bubble (Jakarta chrome); the
 * just-sent optimistic turn slides + scales in. Assistant turns render on warm
 * paper: a thinking indicator until the first token, then Spectral markdown
 * (react-markdown, D13) with a blinking terracotta caret while streaming, then
 * deduped citation chips once done. No citations ⇒ no sources row — a grounded
 * refusal must not invent sources.
 */

function dedupeByDocument(
  citations: OsChatMessageType["citations"],
): OsChatMessageType["citations"] {
  const seen = new Set<string>();
  return citations.filter((citation) => {
    if (seen.has(citation.document_id)) return false;
    seen.add(citation.document_id);
    return true;
  });
}

export function OsChatMessage({
  message,
  streaming,
  statusText,
  titleFor,
}: {
  message: OsChatMessageType;
  streaming: boolean;
  statusText?: string | null;
  titleFor: (documentId: string) => string | undefined;
}) {
  const reduceMotion = useReducedMotion();
  const isUser = message.role === "user";
  // Empty + still streaming = sent, no delta yet → show the thinking cue.
  const isThinking = streaming && !isUser && message.content.length === 0;
  // Only the optimistic just-sent user turn animates in; history stays put.
  const justSent = isUser && message.id.startsWith("tmp-");
  const citations = dedupeByDocument(message.citations);

  return (
    <motion.div
      className={`flex ${isUser ? "justify-end" : "justify-start"}`}
      initial={
        justSent && !reduceMotion ? { opacity: 0, y: 20, scale: 0.97 } : false
      }
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
    >
      {isUser ? (
        <div className="max-w-[85%] rounded-2xl bg-alloro-orange/10 px-4 py-2.5">
          <p className="whitespace-pre-wrap font-sans text-[15px] leading-7 text-alloro-textDark">
            {message.content}
          </p>
        </div>
      ) : isThinking ? (
        <div className="max-w-[85%] py-1">
          <OsThinkingIndicator statusText={statusText} />
        </div>
      ) : (
        <div className="max-w-[85%]">
          <OsMarkdownBody markdown={message.content} />
          {streaming && (
            <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse rounded-sm bg-alloro-orange align-middle" />
          )}
          {!streaming && citations.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-gray-400">
                Sources
              </span>
              {citations.map((citation) => (
                <OsCitationChip
                  key={citation.document_id}
                  citation={citation}
                  title={titleFor(citation.document_id)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
}
