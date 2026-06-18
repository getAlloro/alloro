/**
 * DesignSystem — header primitives (section, page, admin page headers).
 *
 * Responsive-by-default. Every primitive must scale cleanly from 320px to
 * 1920px without horizontal scroll. Fixed font/padding values in this file
 * are reviewed at PR time. See `frontend/docs/responsive-vocabulary.md` for
 * the standardized class ladders this codebase uses.
 */
import type { ReactNode } from "react";
import React from "react";
import { motion } from "framer-motion";
import { ChevronLeft } from "lucide-react";

/**
 * SectionHeader Component
 * Reusable section header with icon and divider
 */
interface SectionHeaderProps {
  title: string;
  icon?: React.ReactNode;
}

export const SectionHeader: React.FC<SectionHeaderProps> = ({
  title,
  icon,
}) => (
  <div className="flex items-center gap-4 px-1">
    {icon && <div className="shrink-0">{icon}</div>}
    <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-alloro-textDark/40 whitespace-nowrap">
      {title}
    </h3>
    <div className="h-px w-full bg-black/10"></div>
  </div>
);

/**
 * PageHeader Component
 * Sticky header with icon, title, subtitle and action button
 */
interface PageHeaderProps {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  actionButton?: React.ReactNode;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  icon,
  title,
  subtitle,
  actionButton,
}) => (
  <header className="glass-header border-b border-black/5 lg:sticky lg:top-0 z-40">
    <div className="max-w-[1100px] mx-auto px-4 sm:px-6 md:px-8 lg:px-10 py-4 sm:py-6 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3 sm:gap-5 min-w-0">
        <div className="w-9 h-9 sm:w-10 sm:h-10 bg-alloro-navy text-white rounded-xl flex items-center justify-center shadow-lg shrink-0">
          {icon}
        </div>
        <div className="flex flex-col text-left">
          <h1 className="text-[11px] font-black font-heading text-alloro-textDark uppercase tracking-[0.25em] leading-none">
            {title}
          </h1>
          {subtitle && (
            <span className="text-[9px] font-bold text-alloro-textDark/40 uppercase tracking-widest mt-1.5 hidden sm:inline">
              {subtitle}
            </span>
          )}
        </div>
      </div>
      {actionButton && (
        <div className="flex items-center gap-4">{actionButton}</div>
      )}
    </div>
  </header>
);

// ============================================================
// ADMIN COMPONENTS - Based on alloro-leadgen-tool patterns
// ============================================================

/**
 * AdminPageHeader Component
 * Enhanced page header with icon, title, description, and action buttons
 * Features animated entrance and optional back navigation
 */
interface AdminPageHeaderProps {
  icon: ReactNode;
  title: string;
  description?: string | ReactNode;
  actionButtons?: ReactNode;
  backButton?: {
    label: string;
    onClick: () => void;
  };
}

export const AdminPageHeader: React.FC<AdminPageHeaderProps> = ({
  icon,
  title,
  description,
  actionButtons,
  backButton,
}) => (
  <motion.header
    className="mb-8"
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.4 }}
  >
    {backButton && (
      <motion.button
        onClick={backButton.onClick}
        className="flex items-center gap-2 text-sm text-gray-500 hover:text-alloro-orange mb-4 transition-colors"
        whileHover={{ x: -4 }}
        whileTap={{ scale: 0.98 }}
      >
        <ChevronLeft className="w-4 h-4" />
        {backButton.label}
      </motion.button>
    )}
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div className="flex items-center gap-4">
        <motion.div
          className="w-12 h-12 bg-alloro-navy text-white rounded-2xl flex items-center justify-center shadow-lg"
          whileHover={{ scale: 1.05, rotate: 5 }}
          transition={{ type: "spring", stiffness: 400, damping: 20 }}
        >
          {icon}
        </motion.div>
        <div>
          <h1 className="text-xl font-bold text-alloro-textDark">{title}</h1>
          {description && (
            <p className="text-sm text-gray-500 mt-0.5">{description}</p>
          )}
        </div>
      </div>
      {actionButtons && (
        <div className="flex items-center gap-3">{actionButtons}</div>
      )}
    </div>
  </motion.header>
);
