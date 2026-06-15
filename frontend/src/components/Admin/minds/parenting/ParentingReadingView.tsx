import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ReadingAnimation } from "./ReadingAnimation";
import { triggerParentingReadingStream } from "../../../../api/minds";
import { getErrorMessage } from "../../../../lib/errorMessage";

interface ParentingReadingViewProps {
  mindId: string;
  mindName: string;
  sessionId: string;
  onComplete: (proposalCount: number) => void;
  onError: (error: string) => void;
  triggerReadingStream?: (mindId: string, sessionId: string) => Promise<Response>;
}

export function ParentingReadingView({
  mindId,
  mindName,
  sessionId,
  onComplete,
  onError,
  triggerReadingStream,
}: ParentingReadingViewProps) {
  const [_phase, setPhase] = useState<string>("starting");
  const [narrationKey, setNarrationKey] = useState(0);
  const [idleMessageIdx, setIdleMessageIdx] = useState(0);
  const [previewMessages, setPreviewMessages] = useState<string[]>([]);
  const hasStarted = useRef(false);

  const FALLBACK_MESSAGES = [
    "Scanning for new patterns...",
    "Cross-referencing with what I already know...",
    "Picking apart the important bits...",
    "Deciding what's worth remembering...",
    "Mapping this to my existing knowledge...",
    "Separating signal from noise...",
    "Checking if I've seen this before...",
    "Connecting dots across sources...",
    "Building a mental model...",
    "Weighing what matters most...",
    "Looking for contradictions...",
    "Absorbing the good stuff...",
    "Filing away key insights...",
    "Almost got it...",
  ];

  const idleMessages = previewMessages.length > 0 ? previewMessages : FALLBACK_MESSAGES;

  useEffect(() => {
    const timer = setInterval(() => {
      setIdleMessageIdx((i) => (i + 1) % idleMessages.length);
      setNarrationKey((k) => k + 1);
    }, 3000);
    return () => clearInterval(timer);
  }, [idleMessages]);

  useEffect(() => {
    if (hasStarted.current) return;
    hasStarted.current = true;

    let cancelled = false;

    async function runStream() {
      try {
        const doTrigger = triggerReadingStream || triggerParentingReadingStream;
        const response = await doTrigger(mindId, sessionId);

        if (!response.ok) {
          const errText = await response.text();
          onError(errText || "Stream request failed");
          return;
        }

        const reader = response.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          if (cancelled) break;
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const data = line.slice(6).trim();
            if (data === "[DONE]") break;

            try {
              const parsed = JSON.parse(data);

              if (parsed.type === "error") {
                onError(parsed.error || "Reading failed");
                return;
              }

              if (parsed.type === "preview_messages") {
                setPreviewMessages(parsed.messages);
                setIdleMessageIdx(0);
                setNarrationKey((k) => k + 1);
              }

              if (parsed.type === "phase") {
                setNarrationKey((k) => k + 1);
                setPhase(parsed.phase);
              }

              if (parsed.type === "complete") {
                await new Promise((r) => setTimeout(r, 1500));
                onComplete(parsed.proposalCount);
                return;
              }
            } catch (e) {
              if (e instanceof SyntaxError) continue;
              throw e;
            }
          }
        }
      } catch (err: unknown) {
        if (!cancelled) {
          onError(getErrorMessage(err) || "Reading failed");
        }
      }
    }

    runStream();

    return () => {
      cancelled = true;
    };
  }, [mindId, sessionId, onComplete, onError]);

  return (
    <div className="liquid-glass rounded-xl p-8">
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <ReadingAnimation />

        <h3 className="text-base font-semibold text-[#eaeaea] mt-6 mb-2">
          {mindName} is reading...
        </h3>

        {/* Narration text — typewriter style */}
        <div className="max-w-md min-h-[3rem] flex items-center justify-center">
          <AnimatePresence mode="wait">
            <motion.div
              key={narrationKey}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.3 }}
            >
              <p className="text-sm text-[#6a6a75]">
                {idleMessages[idleMessageIdx % idleMessages.length]}
              </p>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
