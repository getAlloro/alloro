import { AnimatePresence, motion } from "framer-motion";

export type SupportLauncherTooltipProps = {
  isOpen: boolean;
  text: string;
};

export function SupportLauncherTooltip({
  isOpen,
  text,
}: SupportLauncherTooltipProps) {
  return (
    <motion.div
      layout
      role="tooltip"
      aria-live="polite"
      transition={{ layout: { duration: 0.18, ease: "easeOut" } }}
      className={`pointer-events-none absolute right-[calc(100%+0.75rem)] top-1/2 w-max max-w-[min(24rem,calc(100vw-7rem))] -translate-y-1/2 rounded-xl border border-white/10 bg-alloro-navy px-3.5 py-2 text-left text-[12px] font-bold leading-5 text-white shadow-[0_16px_42px_rgba(17,21,28,0.26)] transition duration-200 ${
        isOpen
          ? "translate-x-0 opacity-100"
          : "translate-x-2 opacity-0 group-hover/support-launcher:translate-x-0 group-hover/support-launcher:opacity-100 group-focus-within/support-launcher:translate-x-0 group-focus-within/support-launcher:opacity-100"
      }`}
    >
      <span
        aria-hidden="true"
        className="absolute right-[-5px] top-1/2 h-3 w-3 -translate-y-1/2 rotate-45 border-r border-t border-white/10 bg-alloro-navy"
      />
      <AnimatePresence initial={false} mode="wait">
        <motion.span
          key={text}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.16, ease: "easeOut" }}
          className="relative z-10 block"
        >
          {text}
        </motion.span>
      </AnimatePresence>
    </motion.div>
  );
}
