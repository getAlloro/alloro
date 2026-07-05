import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

/**
 * Shown on the live assistant turn after a send but before the first token
 * (plans/07042026-alloro-os-admin-port P5 T4). Three pulsing terracotta dots +
 * a cycling italic Spectral word, on warm paper (D13). A concrete stream status
 * ("Searching the knowledge base…") replaces the cycling word when present.
 * Reduced motion: dots stop pulsing, the word stops cycling, the cue still reads.
 */

const OS_THINKING_WORDS = [
  "Thinking",
  "Consulting the docs",
  "Reasoning",
  "Composing",
] as const;
const OS_WORD_INTERVAL_MS = 1800;

export function OsThinkingIndicator({
  statusText,
}: {
  statusText?: string | null;
}) {
  const reduceMotion = useReducedMotion();
  const [wordIndex, setWordIndex] = useState(0);

  useEffect(() => {
    if (reduceMotion || statusText) return;
    const id = setInterval(
      () => setWordIndex((i) => (i + 1) % OS_THINKING_WORDS.length),
      OS_WORD_INTERVAL_MS,
    );
    return () => clearInterval(id);
  }, [reduceMotion, statusText]);

  // Backend status copy already carries its own ellipsis; the fallback words don't.
  const label = statusText ?? `${OS_THINKING_WORDS[wordIndex]}…`;

  return (
    <div
      className="flex items-center gap-3"
      role="status"
      aria-label="Assistant is thinking"
    >
      <div className="flex gap-1.5" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="h-1.5 w-1.5 rounded-full bg-alloro-orange"
            animate={reduceMotion ? undefined : { opacity: [0.3, 1, 0.3] }}
            transition={
              reduceMotion
                ? undefined
                : {
                    duration: 1.1,
                    repeat: Infinity,
                    ease: "easeInOut",
                    delay: i * 0.18,
                  }
            }
          />
        ))}
      </div>
      <AnimatePresence mode="wait">
        <motion.span
          key={label}
          initial={reduceMotion ? false : { opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduceMotion ? undefined : { opacity: 0, y: -4 }}
          transition={{ duration: 0.25 }}
          className="font-display text-[15px] italic leading-7 text-gray-500"
        >
          {label}
        </motion.span>
      </AnimatePresence>
    </div>
  );
}
