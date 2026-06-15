import { motion } from "framer-motion";
import { ClipboardPaste, Download, Plus, Upload } from "lucide-react";

import { ALORO_ORANGE } from "../pmsManualEntryModal.utils";

interface EmptyStateActionsProps {
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  downloadTemplate: () => void;
  handlePasteFromClipboard: () => void;
  isPasting: boolean;
  addRow: () => void;
}

export const EmptyStateActions: React.FC<EmptyStateActionsProps> = ({
  fileInputRef,
  downloadTemplate,
  handlePasteFromClipboard,
  isPasting,
  addRow,
}) => {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="py-10"
    >
      <div className="mx-auto grid w-full max-w-3xl grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          {
            label: "Choose File",
            description: "Select a valid file from your computer",
            icon: <Upload size={22} />,
            accent: true,
            onClick: () => fileInputRef.current?.click(),
          },
          {
            label: "Download Template",
            description: "Fill out and upload",
            icon: <Download size={22} />,
            accent: false,
            onClick: downloadTemplate,
          },
          {
            label: "Paste Data",
            description: "Copy and paste data from a sheets software",
            icon: <ClipboardPaste size={22} />,
            accent: false,
            onClick: handlePasteFromClipboard,
            disabled: isPasting,
          },
          {
            label: "Add Source",
            description: "Manually input your sources and revenue here",
            icon: <Plus size={22} />,
            accent: true,
            onClick: addRow,
          },
        ].map((action) => (
          <button
            key={action.label}
            type="button"
            onClick={action.onClick}
            disabled={action.disabled}
            className="flex flex-col items-center gap-3 rounded-2xl border bg-white px-4 py-6 text-center transition-all hover:-translate-y-0.5 hover:shadow-md disabled:opacity-50"
            style={{
              borderColor: action.accent ? ALORO_ORANGE : "#E5E7EB",
            }}
          >
            <span
              className="flex h-12 w-12 items-center justify-center rounded-full"
              style={{
                backgroundColor: action.accent
                  ? "rgba(201,118,94,0.12)"
                  : "#F3F4F6",
                color: action.accent ? ALORO_ORANGE : "#6B7280",
              }}
            >
              {action.icon}
            </span>
            <span
              className="text-sm font-bold"
              style={{
                color: action.accent ? ALORO_ORANGE : "#374151",
              }}
            >
              {action.label}
            </span>
            <span className="text-xs leading-relaxed text-gray-500">
              {action.description}
            </span>
          </button>
        ))}
      </div>
    </motion.div>
  );
};
