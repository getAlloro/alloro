import { type ReactNode, useEffect, useId } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";

export type DetailsModalProps = {
  open: boolean;
  title: string;
  eyebrow: string;
  children: ReactNode;
  onClose: () => void;
};

export function DetailsModal({
  open,
  title,
  eyebrow,
  children,
  onClose,
}: DetailsModalProps) {
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[110] flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
        >
          <motion.div
            className="absolute inset-0 bg-alloro-navy/55 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="relative flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-[16px] border border-white/70 bg-[#F7F5F1] shadow-2xl"
            initial={{ opacity: 0, scale: 0.96, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 16 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            onClick={(event) => event.stopPropagation()}
          >
            <header className="flex items-start justify-between gap-4 border-b border-line-soft bg-white px-6 py-5 lg:px-7">
              <div className="min-w-0">
                <span className="font-mono-display text-[10px] font-bold uppercase tracking-[0.18em] text-alloro-navy/40">
                  {eyebrow}
                </span>
                <h2
                  id={titleId}
                  className="mt-1 font-display text-[24px] font-medium tracking-tight text-alloro-navy"
                >
                  {title}
                </h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-[10px] p-2 text-alloro-navy/45 transition-colors hover:bg-alloro-navy/5 hover:text-alloro-navy focus:outline-none focus:ring-2 focus:ring-alloro-orange/40"
                aria-label={`Close ${title}`}
              >
                <X size={20} />
              </button>
            </header>
            <div className="overflow-y-auto px-6 py-5 lg:px-7 lg:py-6">
              {children}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
