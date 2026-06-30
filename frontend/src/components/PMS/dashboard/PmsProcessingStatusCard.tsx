import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import Lottie from "lottie-react";
import cogitatingSpinner from "../../../assets/cogitating-spinner.json";
import { usePmsCopy, type PmsCopy } from "../pmsCopy";

function buildProcessingMessages(copy: PmsCopy) {
  return [
    `Mapping ${copy.sourcesLabel.toLowerCase()}`,
    `Ranking top ${copy.sourcesLabel.toLowerCase()}`,
    `Tracing ${copy.moneyLower} per source`,
    "Comparing month over month",
    `Calculating ${copy.moneyLower} per ${copy.countSingular}`,
    "Identifying growth opportunities",
    "Grounding insights to your data",
    "Preparing your action plan",
  ];
}

export function PmsProcessingStatusCard() {
  const copy = usePmsCopy();
  const processingMessages = useMemo(
    () => buildProcessingMessages(copy),
    [copy],
  );
  const [messageIndex, setMessageIndex] = useState(0);
  const [displayedMessage, setDisplayedMessage] = useState("");

  useEffect(() => {
    const targetMessage = processingMessages[messageIndex];

    if (displayedMessage.length < targetMessage.length) {
      const typingTimeoutId = window.setTimeout(() => {
        setDisplayedMessage(
          targetMessage.slice(0, displayedMessage.length + 1),
        );
      }, 35);

      return () => window.clearTimeout(typingTimeoutId);
    }

    const holdTimeoutId = window.setTimeout(() => {
      setDisplayedMessage("");
      setMessageIndex(
        (currentIndex) => (currentIndex + 1) % processingMessages.length,
      );
    }, 1600);

    return () => window.clearTimeout(holdTimeoutId);
  }, [displayedMessage, messageIndex, processingMessages]);

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: "easeOut" }}
      role="status"
      aria-live="polite"
      className="overflow-hidden rounded-2xl border border-alloro-orange/20 bg-white p-6 shadow-premium"
    >
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
        <div
          aria-hidden="true"
          className="relative flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-alloro-orange/10"
        >
          <div className="absolute inset-2 rounded-full border-2 border-alloro-orange/15 border-t-alloro-orange animate-spin" />
          <Lottie
            animationData={cogitatingSpinner}
            loop
            className="relative z-10 h-11 w-11"
          />
        </div>

        <div>
          <p className="text-[10px] font-medium text-slate-400">
            Est. 3-5 minutes
          </p>
          <h2 className="mt-2 font-display text-2xl font-medium tracking-tight text-alloro-navy">
            Alloro is analyzing your latest {copy.dataNameLower}
          </h2>
          <p className="mt-2 min-h-6 max-w-2xl text-sm font-normal leading-6">
            <span className="cogitating-gradient">{displayedMessage}</span>
            <span className="ml-[1px] inline-flex w-[1.5em] justify-start">
              <span className="cogitating-dot">.</span>
              <span className="cogitating-dot [animation-delay:0.15s]">.</span>
              <span className="cogitating-dot [animation-delay:0.3s]">.</span>
            </span>
          </p>
        </div>
      </div>
    </motion.section>
  );
}
