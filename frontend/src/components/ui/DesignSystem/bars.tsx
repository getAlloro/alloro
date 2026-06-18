/**
 * DesignSystem — bar primitives (filter bar, bulk action bar, tab bar).
 *
 * Responsive-by-default. Every primitive must scale cleanly from 320px to
 * 1920px without horizontal scroll. Fixed font/padding values in this file
 * are reviewed at PR time. See `frontend/docs/responsive-vocabulary.md` for
 * the standardized class ladders this codebase uses.
 */
import type { ReactNode } from "react";
import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { RefreshCw } from "lucide-react";

/**
 * FilterBar Component
 * Standardized filter controls container
 */
interface FilterBarProps {
  children: ReactNode;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

export const FilterBar: React.FC<FilterBarProps> = ({
  children,
  onRefresh,
  isRefreshing,
}) => (
  <motion.div
    className="flex flex-wrap items-center justify-between gap-3 p-4 bg-white rounded-2xl border border-black/5 shadow-sm"
    initial={{ opacity: 0, y: -10 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.3 }}
  >
    {children}
    {onRefresh && (
      <motion.button
        onClick={onRefresh}
        disabled={isRefreshing}
        className="p-2 rounded-xl bg-alloro-bg text-gray-600 hover:bg-alloro-orange/10 hover:text-alloro-orange disabled:opacity-50 transition-colors"
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
      >
        <RefreshCw
          className={`w-4 h-4 ${isRefreshing ? "animate-spin" : ""}`}
        />
      </motion.button>
    )}
  </motion.div>
);

/**
 * BulkActionBar Component
 * Selection action bar with count display
 */
interface BulkAction {
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  variant?: "primary" | "secondary" | "danger";
  disabled?: boolean;
}

interface BulkActionBarProps {
  selectedCount: number;
  totalCount?: number;
  onSelectAll?: () => void;
  onDeselectAll?: () => void;
  onClear?: () => void;
  actions: BulkAction[] | ReactNode;
  isAllSelected?: boolean;
  extraContent?: ReactNode;
}

export const BulkActionBar: React.FC<BulkActionBarProps> = ({
  selectedCount,
  totalCount,
  onSelectAll,
  onDeselectAll,
  onClear,
  actions,
  isAllSelected,
  extraContent,
}) => {
  const actionVariants = {
    primary:
      "bg-alloro-orange text-white hover:bg-alloro-orange/90 border-transparent shadow-lg shadow-alloro-orange/30",
    secondary:
      "bg-white text-gray-700 hover:bg-gray-50 border-gray-200 hover:border-gray-300",
    danger: "bg-white text-red-600 hover:bg-red-50 border-red-200",
  };

  // Only render when there are selected items
  if (selectedCount === 0) return null;

  return (
    <AnimatePresence>
      <motion.div
        className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2"
        initial={{ opacity: 0, y: 50, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 50, scale: 0.95 }}
        transition={{ type: "spring", stiffness: 300, damping: 25 }}
      >
        <div className="flex items-center gap-4 px-5 py-3 bg-white rounded-2xl border border-gray-200 shadow-2xl">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-100">
              <span className="text-sm font-bold text-blue-600">
                {selectedCount}
              </span>
            </div>
            <span className="text-sm font-medium text-gray-700">
              {totalCount ? `of ${totalCount}` : ""} selected
            </span>
            {onSelectAll && onDeselectAll && (
              <button
                onClick={isAllSelected ? onDeselectAll : onSelectAll}
                className="text-sm text-blue-600 hover:text-blue-800 font-medium"
              >
                {isAllSelected ? "Deselect all" : "Select all"}
              </button>
            )}
          </div>
          <div className="w-px h-6 bg-gray-200" />
          <div className="flex items-center gap-2">
            {extraContent}
            {Array.isArray(actions)
              ? actions.map((action, idx) => (
                  <motion.button
                    key={idx}
                    onClick={action.onClick}
                    disabled={action.disabled}
                    className={`inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-xl border transition-all disabled:opacity-50 disabled:cursor-not-allowed ${actionVariants[action.variant || "secondary"]}`}
                    whileHover={{ scale: action.disabled ? 1 : 1.02 }}
                    whileTap={{ scale: action.disabled ? 1 : 0.98 }}
                  >
                    {action.icon}
                    {action.label}
                  </motion.button>
                ))
              : actions}
          </div>
          {(onClear || onDeselectAll) && (
            <>
              <div className="w-px h-6 bg-gray-200" />
              <motion.button
                onClick={onClear || onDeselectAll}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                title="Clear selection"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </motion.button>
            </>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

/**
 * TabBar Component
 * Animated tab navigation with indicator
 */
interface TabBarProps {
  tabs: Array<{
    id: string;
    label: string;
    description?: string;
    icon?: ReactNode;
  }>;
  activeTab: string;
  onTabChange: (tabId: string) => void;
}

export const TabBar: React.FC<TabBarProps> = ({
  tabs,
  activeTab,
  onTabChange,
}) => (
  <div className="flex items-stretch gap-1 p-1.5 bg-gray-100 rounded-xl">
    {tabs.map((tab) => {
      const isActive = activeTab === tab.id;
      return (
        <motion.button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          className={`group relative flex items-center justify-center px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
            isActive
              ? "text-alloro-navy"
              : "text-gray-500 hover:text-gray-700"
          }`}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          {isActive && (
            <motion.div
              className="absolute inset-0 bg-white rounded-lg shadow-sm"
              layoutId="activeTab"
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
            />
          )}
          <span className="relative z-10 flex flex-col items-center text-center">
            <span className="flex items-center gap-1.5">
              {tab.icon}
              <span>{tab.label}</span>
            </span>
            {isActive && tab.description && (
              <span className="text-[10px] font-normal leading-tight text-gray-400 mt-0.5">
                {tab.description}
              </span>
            )}
          </span>
        </motion.button>
      );
    })}
  </div>
);
