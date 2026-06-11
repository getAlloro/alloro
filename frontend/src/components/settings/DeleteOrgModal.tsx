import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, Loader2, X } from "lucide-react";

interface DeleteOrgModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  organizationName: string;
}

export const DeleteOrgModal: React.FC<DeleteOrgModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  organizationName,
}) => {
  const [confirmText, setConfirmText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  const isConfirmed = confirmText === organizationName;

  const handleConfirm = async () => {
    if (!isConfirmed) return;
    setIsDeleting(true);
    try {
      await onConfirm();
    } finally {
      setIsDeleting(false);
      setConfirmText("");
    }
  };

  const handleClose = () => {
    if (isDeleting) return;
    setConfirmText("");
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-alloro-navy/50 backdrop-blur-sm"
            onClick={handleClose}
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: "spring", duration: 0.3 }}
            className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
          >
            <button
              onClick={handleClose}
              disabled={isDeleting}
              className="absolute top-4 right-4 p-2 hover:bg-slate-100 rounded-xl transition-colors disabled:opacity-50"
            >
              <X className="w-5 h-5 text-slate-400" />
            </button>

            <div className="p-6">
              <div className="flex items-center gap-4 mb-4">
                <div className="p-3 rounded-xl bg-red-50 text-red-600">
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <h3 className="font-display text-lg font-medium text-alloro-navy tracking-tight">
                  Delete Organization
                </h3>
              </div>

              <div className="space-y-4 mb-6">
                <p className="text-slate-600 leading-relaxed">
                  This will <span className="font-bold text-red-600">permanently delete</span> your
                  organization and all associated data including:
                </p>
                <ul className="text-sm text-slate-500 space-y-1 pl-4">
                  <li>All locations and Google connections</li>
                  <li>All tasks, rankings, and notifications</li>
                  <li>All agent results and PMS data</li>
                  <li>All team member access</li>
                  <li>Website builder projects</li>
                </ul>
                <p className="text-sm text-red-600 font-bold">
                  This action cannot be undone.
                </p>
              </div>

              <div className="mb-6">
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Type <span className="font-bold text-alloro-navy">"{organizationName}"</span> to confirm:
                </label>
                <input
                  type="text"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  className="w-full px-4 py-2.5 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-500/50 focus:border-red-300"
                  placeholder={organizationName}
                  disabled={isDeleting}
                  autoComplete="off"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
                <button
                  onClick={handleClose}
                  disabled={isDeleting}
                  className="px-5 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirm}
                  disabled={!isConfirmed || isDeleting}
                  className="px-5 py-2.5 text-sm font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-md"
                >
                  {isDeleting && <Loader2 className="w-4 h-4 animate-spin" />}
                  Delete Organization
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
