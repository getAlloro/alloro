/**
 * DesignSystem — control primitives (buttons, pills, tags, badges).
 *
 * Responsive-by-default. Every primitive must scale cleanly from 320px to
 * 1920px without horizontal scroll. Fixed font/padding values in this file
 * are reviewed at PR time. See `frontend/docs/responsive-vocabulary.md` for
 * the standardized class ladders this codebase uses.
 */
import type { ReactNode } from "react";
import React from "react";
import { motion } from "framer-motion";
import { RefreshCw } from "lucide-react";

/**
 * CompactTag Component
 * Small status indicator with custom styling per status type
 */
interface CompactTagProps {
  status: string;
}

export const CompactTag: React.FC<CompactTagProps> = ({ status }) => {
  const styles: Record<string, string> = {
    Increasing: "text-green-700 bg-green-50 border-green-100",
    increasing: "text-green-700 bg-green-50 border-green-100",
    Decreasing: "text-red-700 bg-red-50 border-red-100",
    decreasing: "text-red-700 bg-red-50 border-red-100",
    New: "text-indigo-700 bg-indigo-50 border-indigo-100",
    new: "text-indigo-700 bg-indigo-50 border-indigo-100",
    Dormant: "text-alloro-textDark/20 bg-alloro-bg border-black/5",
    dormant: "text-alloro-textDark/20 bg-alloro-bg border-black/5",
    Stable: "text-slate-500 bg-slate-50 border-slate-200",
    stable: "text-slate-500 bg-slate-50 border-slate-200",
  };

  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider border leading-none mt-1 w-fit ${
        styles[status] || styles["Stable"]
      }`}
    >
      {status}
    </span>
  );
};

/**
 * StatusPill Component
 * Colored status indicator
 */
interface StatusPillProps {
  label: string;
  color?: "orange" | "green" | "red" | "blue" | "gray";
}

export const StatusPill: React.FC<StatusPillProps> = ({
  label,
  color = "blue",
}) => {
  const colorStyles: Record<string, string> = {
    orange: "bg-amber-500/15 text-amber-400 border-amber-500/25",
    green: "bg-green-500/15 text-green-400 border-green-500/25",
    red: "bg-red-500/15 text-red-400 border-red-500/25",
    blue: "bg-blue-500/15 text-blue-400 border-blue-500/25",
    gray: "bg-white/[0.06] text-[#a0a0a8] border-white/10",
  };

  return (
    <span
      className={`inline-flex items-center px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border ${colorStyles[color]}`}
    >
      {label}
    </span>
  );
};

/**
 * ActionButton Component
 * Styled button for actions with icon support and glowing orange primary variant
 */
interface ActionButtonProps {
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "sm" | "md" | "lg";
  disabled?: boolean;
  loading?: boolean;
}

export const ActionButton: React.FC<ActionButtonProps> = ({
  label,
  icon,
  onClick,
  variant = "secondary",
  size = "md",
  disabled = false,
  loading = false,
}) => {
  const variants = {
    primary:
      "bg-alloro-orange hover:bg-alloro-orange/90 text-white border-transparent shadow-lg shadow-alloro-orange/30 hover:shadow-xl hover:shadow-alloro-orange/40",
    secondary:
      "bg-white text-gray-700 hover:bg-gray-50 border-gray-200 hover:border-gray-300 shadow-sm hover:shadow",
    danger:
      "bg-white text-red-600 hover:bg-red-50 border-red-200 hover:border-red-300 shadow-sm",
    ghost:
      "bg-transparent text-gray-600 hover:bg-gray-100 border-transparent hover:text-gray-800",
  };

  const sizes = {
    sm: "px-3 py-1.5 text-xs",
    md: "px-4 py-2.5 text-sm",
    lg: "px-6 py-3 text-sm",
  };

  return (
    <motion.button
      onClick={onClick}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-2 font-semibold rounded-xl border transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none ${variants[variant]} ${sizes[size]}`}
      whileHover={{ scale: disabled ? 1 : 1.03 }}
      whileTap={{ scale: disabled ? 1 : 0.97 }}
      transition={{ duration: 0.15 }}
    >
      {loading ? (
        <RefreshCw className="w-4 h-4 animate-spin" />
      ) : (
        icon && <span className="w-4 h-4 flex items-center justify-center">{icon}</span>
      )}
      {label}
    </motion.button>
  );
};

/**
 * Badge Component
 * Small inline badge/pill - supports both label prop and children
 */
type BadgeColor =
  | "orange"
  | "green"
  | "red"
  | "blue"
  | "gray"
  | "purple"
  | "success"
  | "danger"
  | "warning"
  | "info"
  | "default";

interface BadgeProps {
  label?: string;
  children?: ReactNode;
  color?: BadgeColor;
  variant?: BadgeColor;
}

export const Badge: React.FC<BadgeProps> = ({
  label,
  children,
  color,
  variant,
}) => {
  const colorValue = color || variant || "gray";
  const colorStyles: Record<BadgeColor, string> = {
    orange: "bg-amber-100 text-amber-700",
    green: "bg-green-100 text-green-700",
    red: "bg-red-100 text-red-700",
    blue: "bg-blue-100 text-blue-700",
    gray: "bg-gray-100 text-gray-700",
    purple: "bg-purple-100 text-purple-700",
    success: "bg-green-100 text-green-700",
    danger: "bg-red-100 text-red-700",
    warning: "bg-amber-100 text-amber-700",
    info: "bg-blue-100 text-blue-700",
    default: "bg-gray-100 text-gray-700",
  };

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${colorStyles[colorValue]}`}
    >
      {children || label}
    </span>
  );
};
