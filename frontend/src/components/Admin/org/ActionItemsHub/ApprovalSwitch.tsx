import React from "react";
import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";

// Approval Switch Component
interface ApprovalSwitchProps {
  isApproved: boolean;
  isLoading: boolean;
  disabled: boolean;
  onToggle: () => void;
}

export const ApprovalSwitch: React.FC<ApprovalSwitchProps> = ({
  isApproved,
  isLoading,
  disabled,
  onToggle,
}) => {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      disabled={disabled || isLoading}
      className="flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <span
        className={`text-xs font-medium w-16 text-right ${
          isApproved ? "text-green-600" : "text-gray-500"
        }`}
      >
        {isLoading ? "Updating..." : isApproved ? "Approved" : "Pending"}
      </span>
      <motion.div
        className={`relative w-10 h-5 rounded-full transition-colors ${
          isApproved ? "bg-green-500" : "bg-gray-300"
        }`}
        whileTap={{ scale: 0.95 }}
      >
        <motion.div
          className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm flex items-center justify-center"
          initial={false}
          animate={{ x: isApproved ? 22 : 2 }}
          transition={{ type: "spring", stiffness: 500, damping: 30 }}
        >
          {isLoading && (
            <Loader2 className="w-2.5 h-2.5 text-gray-400 animate-spin" />
          )}
        </motion.div>
      </motion.div>
    </button>
  );
};
