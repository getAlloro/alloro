import { AnimatePresence, motion } from "framer-motion";
import type { ReactNode } from "react";

export type GbpLatestReviewCardDeckProps = {
  cardKey: string;
  children: ReactNode;
};

const CARD_CLASS =
  "flex h-full min-h-[360px] flex-col rounded-[12px] border border-line-soft bg-white p-3.5 shadow-[0_12px_28px_rgba(17,21,28,0.07)]";

export function GbpLatestReviewCardDeck({
  cardKey,
  children,
}: GbpLatestReviewCardDeckProps) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.aside
        key={cardKey}
        className={CARD_CLASS}
        initial={{ opacity: 0, x: 24, rotate: 1.2, scale: 0.98 }}
        animate={{ opacity: 1, x: 0, rotate: 0, scale: 1 }}
        exit={{ opacity: 0, x: -28, rotate: -1.2, scale: 0.97 }}
        transition={{ duration: 0.28, ease: "easeOut" }}
      >
        {children}
      </motion.aside>
    </AnimatePresence>
  );
}
