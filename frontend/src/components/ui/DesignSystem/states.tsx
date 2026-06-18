/**
 * DesignSystem — state primitives (empty state, expandable section).
 *
 * Responsive-by-default. Every primitive must scale cleanly from 320px to
 * 1920px without horizontal scroll. Fixed font/padding values in this file
 * are reviewed at PR time. See `frontend/docs/responsive-vocabulary.md` for
 * the standardized class ladders this codebase uses.
 */
import type { ReactNode } from "react";
import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Inbox } from "lucide-react";
import { expandCollapse, chevronVariants } from "../../../lib/animations";
import { AnimatedCard } from "./cards";

/**
 * EmptyState Component
 * Consistent empty state display
 */
interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  action,
}) => (
  <motion.div
    className="flex flex-col items-center justify-center py-16 px-6 text-center"
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.4 }}
  >
    <motion.div
      className="w-16 h-16 bg-alloro-bg rounded-2xl flex items-center justify-center text-gray-400 mb-4"
      animate={{ scale: [1, 1.05, 1] }}
      transition={{ duration: 2, repeat: Infinity }}
    >
      {icon || <Inbox className="w-8 h-8" />}
    </motion.div>
    <h3 className="text-lg font-semibold text-gray-700">{title}</h3>
    {description && (
      <p className="text-sm text-gray-500 mt-1 max-w-sm">{description}</p>
    )}
    {action && (
      <motion.button
        onClick={action.onClick}
        className="mt-4 px-4 py-2 bg-alloro-orange text-white rounded-xl font-medium text-sm hover:bg-alloro-navy transition-colors"
        whileHover={{ scale: 1.03 }}
        whileTap={{ scale: 0.98 }}
      >
        {action.label}
      </motion.button>
    )}
  </motion.div>
);

/**
 * ExpandableSection Component
 * Animated accordion section - supports both controlled and uncontrolled modes
 */
interface ExpandableSectionProps {
  // Uncontrolled mode props
  title?: string;
  icon?: ReactNode;
  badge?: string;
  defaultExpanded?: boolean;
  // Controlled mode props
  header?: ReactNode;
  isExpanded?: boolean;
  onToggle?: () => void;
  // Common props
  children: ReactNode;
  delay?: number;
}

export const ExpandableSection: React.FC<ExpandableSectionProps> = ({
  title,
  icon,
  badge,
  defaultExpanded = false,
  header,
  isExpanded: controlledExpanded,
  onToggle,
  children,
  delay = 0,
}) => {
  const [internalExpanded, setInternalExpanded] = useState(defaultExpanded);
  const isControlled = controlledExpanded !== undefined;
  const expanded = isControlled ? controlledExpanded : internalExpanded;

  const handleToggle = () => {
    if (onToggle) {
      onToggle();
    }
    if (!isControlled) {
      setInternalExpanded(!internalExpanded);
    }
  };

  const renderHeader = () => {
    if (header) return header;
    return (
      <div className="flex items-center gap-3">
        {icon && (
          <div className="w-8 h-8 bg-alloro-bg rounded-lg flex items-center justify-center text-alloro-navy">
            {icon}
          </div>
        )}
        <span className="font-semibold text-gray-900">{title}</span>
        {badge && (
          <span className="px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-600 rounded-full">
            {badge}
          </span>
        )}
      </div>
    );
  };

  return (
    <AnimatedCard delay={delay} hoverable={false} className="overflow-hidden">
      <motion.button
        onClick={handleToggle}
        className="w-full p-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
        whileTap={{ scale: 0.995 }}
      >
        {renderHeader()}
        <motion.div
          variants={chevronVariants}
          animate={expanded ? "expanded" : "collapsed"}
          transition={{ duration: 0.2 }}
        >
          <ChevronDown className="w-5 h-5 text-gray-400" />
        </motion.div>
      </motion.button>
      <AnimatePresence>
        {expanded && (
          <motion.div
            variants={expandCollapse}
            initial="collapsed"
            animate="expanded"
            exit="collapsed"
            className="overflow-hidden"
          >
            <div className="p-4 pt-0 border-t border-gray-100">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </AnimatedCard>
  );
};
