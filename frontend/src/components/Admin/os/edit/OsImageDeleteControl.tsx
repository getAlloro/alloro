import { motion } from "framer-motion";
import { Check, Trash2, X } from "lucide-react";

export type OsImageDeleteControlProps = {
  isConfirming: boolean;
  confirmationFlash: number;
  onRequest: () => void;
  onConfirm: () => void;
  onCancel: () => void;
};

export function OsImageDeleteControl({
  isConfirming,
  confirmationFlash,
  onRequest,
  onConfirm,
  onCancel,
}: OsImageDeleteControlProps) {
  return (
    <div
      className={`absolute right-2 top-2 transition-opacity ${
        isConfirming ? "opacity-100" : "opacity-0 group-hover:opacity-100"
      }`}
    >
      {isConfirming ? (
        <motion.div
          key={confirmationFlash}
          initial={{ scale: 0.92 }}
          animate={{ scale: [1.07, 1], x: [0, -2, 2, 0] }}
          transition={{ duration: 0.22, ease: "easeOut" }}
          className="flex items-center gap-1 rounded-md bg-gray-900/85 py-1 pl-2 pr-1 text-white shadow-md"
        >
          <span className="text-[11px] font-medium">Delete?</span>
          <button
            type="button"
            onClick={onConfirm}
            aria-label="Confirm delete image"
            className="inline-flex h-5 w-5 items-center justify-center rounded hover:bg-red-600"
          >
            <Check className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Cancel delete"
            className="inline-flex h-5 w-5 items-center justify-center rounded hover:bg-white/20"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </motion.div>
      ) : (
        <button
          type="button"
          onClick={onRequest}
          aria-label="Delete image"
          className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-gray-900/60 text-white transition-colors hover:bg-red-600"
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
