import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, Loader2, X } from "lucide-react";

interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  isLoading?: boolean;
  type?: "danger" | "warning" | "info";
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = "Confirm",
  cancelText = "Cancel",
  isLoading = false,
  type = "danger",
}) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-alloro-navy/50 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: "spring", duration: 0.3 }}
            className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
          >
            {/* Close button */}
            <button
              onClick={onClose}
              disabled={isLoading}
              className="absolute top-4 right-4 p-2 hover:bg-slate-100 rounded-xl transition-colors disabled:opacity-50"
            >
              <X className="w-5 h-5 text-slate-400" />
            </button>

            <div className="p-6">
              <div className="flex items-center gap-4 mb-4">
                <div
                  className={`p-3 rounded-xl ${
                    type === "danger"
                      ? "bg-red-50 text-red-600"
                      : type === "warning"
                      ? "bg-amber-50 text-amber-600"
                      : "bg-alloro-orange/10 text-alloro-orange"
                  }`}
                >
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <h3 className="font-display text-lg font-medium text-alloro-navy tracking-tight">
                  {title}
                </h3>
              </div>

              <p className="text-slate-600 mb-6 leading-relaxed">{message}</p>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
                <button
                  onClick={onClose}
                  disabled={isLoading}
                  className="px-5 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors disabled:opacity-50"
                >
                  {cancelText}
                </button>
                <button
                  onClick={onConfirm}
                  disabled={isLoading}
                  className={`px-5 py-2.5 text-sm font-bold text-white rounded-xl transition-colors disabled:opacity-50 flex items-center gap-2 shadow-md ${
                    type === "danger"
                      ? "bg-red-600 hover:bg-red-700"
                      : type === "warning"
                      ? "bg-amber-600 hover:bg-amber-700"
                      : "bg-alloro-orange hover:bg-blue-700"
                  }`}
                >
                  {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                  {confirmText}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
