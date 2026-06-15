import { motion } from "framer-motion";
import { ChevronRight } from "lucide-react";

export function ScoreCardCtas({
  onOpenScoreDetails,
  onOpenGaps,
  score,
}: {
  onOpenScoreDetails: () => void;
  onOpenGaps: () => void;
  score: number;
}) {
  const actions = [
    { label: `Why you scored ${Math.round(score)}/100`, onClick: onOpenScoreDetails },
    { label: "How to close the gap", onClick: onOpenGaps },
  ];

  return (
    <div className="grid grid-cols-1 gap-2">
      {actions.map((action) => (
        <motion.button
          key={action.label}
          type="button"
          onClick={action.onClick}
          className="inline-flex min-h-[44px] w-full items-center justify-between gap-2 rounded-[10px] border border-line-soft bg-white px-3 py-2.5 text-left text-[10px] font-black uppercase tracking-[0.1em] text-alloro-navy/70 transition-colors hover:border-alloro-orange/25 hover:bg-alloro-orange/10 hover:text-alloro-orange focus:outline-none focus:ring-2 focus:ring-alloro-orange/30"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          whileHover={{ y: -1 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
        >
          {action.label}
          <ChevronRight size={14} />
        </motion.button>
      ))}
    </div>
  );
}
