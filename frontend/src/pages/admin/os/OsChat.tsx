import { MessageSquare, Sparkles } from "lucide-react";

/**
 * Chat — P1 placeholder (plans/07042026-alloro-os-admin-port).
 * The grounded RAG chat (SSE streaming, citations) lands in P5; this ships a
 * designed, honest empty state so the sub-tab renders today.
 */
export default function OsChat() {
  return (
    <section className="pt-14">
      <div className="mx-auto flex max-w-md flex-col items-center text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full border border-gray-200 bg-white">
          <MessageSquare className="h-5 w-5 text-gray-400" strokeWidth={1.5} />
        </div>
        <h2 className="mt-5 font-display text-xl text-alloro-textDark">
          Ask the knowledge base
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-gray-500">
          Grounded answers with citations from your indexed documents arrive
          with the Chat build.
        </p>
        <button
          type="button"
          disabled
          title="Chat arrives with the RAG build (Phase 5)"
          className="mt-6 inline-flex cursor-not-allowed items-center gap-2 rounded-lg bg-alloro-orange px-4 py-2 text-sm font-semibold text-white opacity-50"
        >
          <Sparkles className="h-4 w-4" strokeWidth={2} />
          Start a conversation
        </button>
        <p className="mt-10 w-full border-t border-gray-200 pt-4 font-mono text-[11px] uppercase tracking-[0.12em] text-gray-400">
          0 conversations · retrieval offline
        </p>
      </div>
    </section>
  );
}
