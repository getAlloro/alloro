import type { ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Settings, X } from "lucide-react";

export type FormSubmissionsSettingsModalProps = {
  isOpen: boolean;
  children?: ReactNode;
  onClose: () => void;
};

export function FormSubmissionsSettingsModal({
  isOpen,
  children,
  onClose,
}: FormSubmissionsSettingsModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-alloro-navy/40 p-4 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="flex max-h-[84vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl"
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.97 }}
            transition={{ duration: 0.18 }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between border-b border-gray-100 px-5 py-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Settings className="h-5 w-5 text-gray-700" />
                  <h3 className="text-base font-semibold text-gray-900">
                    Form Settings
                  </h3>
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  Default recipients are the fallback for new forms and forms
                  without custom routing.
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
                aria-label="Close form settings"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              {children ?? (
                <p className="text-sm text-gray-500">
                  No settings content is configured for this surface.
                </p>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
