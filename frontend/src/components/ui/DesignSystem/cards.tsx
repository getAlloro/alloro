/**
 * DesignSystem — card primitives (metric, animated, data, grid).
 *
 * Responsive-by-default. Every primitive must scale cleanly from 320px to
 * 1920px without horizontal scroll. Fixed font/padding values in this file
 * are reviewed at PR time. See `frontend/docs/responsive-vocabulary.md` for
 * the standardized class ladders this codebase uses.
 */
import type { ReactNode } from "react";
import React from "react";
import { motion } from "framer-motion";
import { cardVariants, staggerContainer } from "../../../lib/animations";
import { StatusPill } from "./controls";

/**
 * MetricCard Component
 * Displays a single metric with label, value, and optional trend indicator
 */
interface MetricCardProps {
  label: string;
  value: string | number;
  trend?: string;
  isHighlighted?: boolean;
}

export const MetricCard: React.FC<MetricCardProps> = ({
  label,
  value,
  trend,
  isHighlighted = false,
}) => {
  const isUp = trend?.startsWith("+");
  const isDown = trend?.startsWith("-");

  return (
    <div
      className={`flex flex-col p-4 sm:p-5 lg:p-6 rounded-2xl border transition-all duration-500 ${
        isHighlighted
          ? "bg-white border-alloro-orange/20 shadow-premium"
          : "bg-white border-black/5 hover:border-alloro-orange/20 hover:shadow-premium"
      }`}
    >
      <span className="text-[10px] font-black text-alloro-textDark/40 uppercase tracking-[0.2em] mb-3 sm:mb-4 leading-none text-left">
        {label}
      </span>
      <div className="flex items-center justify-between">
        <span className="text-2xl sm:text-3xl font-black font-heading tracking-tighter leading-none text-alloro-textDark">
          {value}
        </span>
        {trend && (
          <span
            className={`text-[11px] font-black px-2.5 py-1 rounded-lg flex items-center gap-1 shadow-sm ${
              isUp
                ? "bg-green-100 text-green-700"
                : isDown
                ? "bg-red-100 text-red-700"
                : "bg-slate-100 text-slate-600"
            }`}
          >
            {trend}
          </span>
        )}
      </div>
    </div>
  );
};

/**
 * AnimatedCard Component
 * Wrapper for framer-motion card animations with hover effects
 */
interface AnimatedCardProps {
  children: ReactNode;
  delay?: number;
  className?: string;
  onClick?: () => void;
  hoverable?: boolean;
}

export const AnimatedCard: React.FC<AnimatedCardProps> = ({
  children,
  delay = 0,
  className = "",
  onClick,
  hoverable = true,
}) => (
  <motion.div
    custom={delay}
    variants={cardVariants}
    initial="hidden"
    animate="visible"
    exit="exit"
    whileHover={hoverable ? "hover" : undefined}
    onClick={onClick}
    className={`bg-white rounded-2xl border border-black/5 shadow-premium overflow-hidden transition-all ${
      onClick ? "cursor-pointer" : ""
    } ${
      hoverable
        ? "hover:border-alloro-orange/20 hover:shadow-2xl hover:-translate-y-1"
        : ""
    } ${className}`}
  >
    {children}
  </motion.div>
);

/**
 * DataCard Component
 * Metadata card replacing table rows - displays rich information
 */
interface DataCardProps {
  icon?: ReactNode;
  title: string;
  subtitle?: string;
  badges?: Array<{
    label: string;
    color?: "orange" | "green" | "red" | "blue" | "gray";
  }>;
  metadata?: Array<{
    label: string;
    value: string | number;
  }>;
  actions?: ReactNode;
  onClick?: () => void;
  status?: "success" | "pending" | "error" | "archived";
  delay?: number;
}

export const DataCard: React.FC<DataCardProps> = ({
  icon,
  title,
  subtitle,
  badges,
  metadata,
  actions,
  onClick,
  status,
  delay = 0,
}) => {
  const statusDot = {
    success: "bg-green-500",
    pending: "bg-yellow-500",
    error: "bg-red-500",
    archived: "bg-gray-400",
  };

  return (
    <AnimatedCard delay={delay} onClick={onClick} className="p-5">
      <div className="flex items-start gap-4">
        {icon && (
          <div className="w-10 h-10 bg-alloro-bg rounded-xl flex items-center justify-center shrink-0 text-alloro-navy">
            {icon}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {status && (
              <span
                className={`w-2 h-2 rounded-full ${statusDot[status]}`}
              ></span>
            )}
            <h3 className="font-semibold text-gray-900 truncate">{title}</h3>
          </div>
          {subtitle && (
            <p className="text-sm text-gray-500 mt-0.5 truncate">{subtitle}</p>
          )}
          {badges && badges.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {badges.map((badge, idx) => (
                <StatusPill key={idx} label={badge.label} color={badge.color} />
              ))}
            </div>
          )}
          {metadata && metadata.length > 0 && (
            <div className="flex flex-wrap gap-4 mt-3">
              {metadata.map((item, idx) => (
                <div key={idx} className="text-xs">
                  <span className="text-gray-400 uppercase tracking-wide">
                    {item.label}:
                  </span>
                  <span className="text-gray-700 font-medium ml-1">
                    {item.value}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
        {actions && (
          <div className="flex items-center gap-2 shrink-0">{actions}</div>
        )}
      </div>
    </AnimatedCard>
  );
};

/**
 * CardGrid Component
 * Animated grid container for cards
 */
interface CardGridProps {
  children: ReactNode;
  columns?: 1 | 2 | 3 | 4;
}

export const CardGrid: React.FC<CardGridProps> = ({
  children,
  columns = 2,
}) => {
  const colClasses = {
    1: "grid-cols-1",
    2: "grid-cols-1 md:grid-cols-2",
    3: "grid-cols-1 md:grid-cols-2 lg:grid-cols-3",
    4: "grid-cols-1 md:grid-cols-2 lg:grid-cols-4",
  };

  return (
    <motion.div
      className={`grid ${colClasses[columns]} gap-4`}
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
    >
      {children}
    </motion.div>
  );
};
