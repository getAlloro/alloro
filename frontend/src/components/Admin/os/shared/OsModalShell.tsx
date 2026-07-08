import { AnimatePresence, motion } from "framer-motion";
import type { ReactNode } from "react";

/**
 * Shared modal scaffolding for OS dialogs (D13: white bounded surface,
 * 12px radius, 150–200ms ease-out): backdrop, panel, enter/exit motion.
 * Used by the new-document and publish modals.
 */
export function OsModalShell({
  isOpen,
  onClose,
  label,
  children,
}: {
  isOpen: boolean;
  onClose: () => void;
  label: string;
  children: ReactNode;
}) {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          <motion.div
            className="absolute inset-0 bg-black/40"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={label}
            className="relative w-full max-w-md rounded-xl border border-line-medium bg-alloro-surface p-6 shadow-xl"
            initial={{ opacity: 0, scale: 0.97, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 8 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
