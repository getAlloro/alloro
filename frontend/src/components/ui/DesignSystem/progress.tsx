/**
 * DesignSystem — progress + live-state primitives.
 *
 * Responsive-by-default. Every primitive must scale cleanly from 320px to
 * 1920px without horizontal scroll. Fixed font/padding values in this file
 * are reviewed at PR time. See `frontend/docs/responsive-vocabulary.md` for
 * the standardized class ladders this codebase uses.
 */
import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  shineVariants,
  glowRingVariants,
  getScoreColor,
  scoreColorClasses,
} from "../../../lib/animations";

/**
 * IntelligencePulse Component
 * Animated pulse indicator for live data or active states
 */
export const IntelligencePulse = () => (
  <span className="relative flex h-2.5 w-2.5">
    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-alloro-orange opacity-30"></span>
    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-alloro-orange opacity-60"></span>
  </span>
);

/**
 * CircularProgress Component
 * Animated SVG progress ring with score-based colors and glow effect
 */
interface CircularProgressProps {
  score?: number;
  value?: number;
  size?: number;
  strokeWidth?: number;
  label?: string;
  delay?: number;
  showGlow?: boolean;
}

export const CircularProgress: React.FC<CircularProgressProps> = ({
  score: scoreProp,
  value,
  size = 80,
  strokeWidth = 6,
  label,
  delay = 0,
  showGlow = true,
}) => {
  const score = scoreProp ?? value ?? 0;
  const [isVisible, setIsVisible] = useState(false);
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (score / 100) * circumference;
  const color = getScoreColor(score);
  const colors = scoreColorClasses[color];

  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), delay * 1000);
    return () => clearTimeout(timer);
  }, [delay]);

  return (
    <motion.div
      className="flex flex-col items-center"
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5, delay, type: "spring", stiffness: 100 }}
    >
      {label && (
        <span className="mb-2 text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
          {label}
        </span>
      )}
      <div className="relative" style={{ width: size, height: size }}>
        {showGlow && (
          <motion.div
            className={`absolute inset-0 rounded-full ${colors.bg}`}
            variants={glowRingVariants}
            initial="initial"
            animate={isVisible ? "animate" : "initial"}
            style={{ filter: "blur(8px)" }}
          />
        )}
        <svg
          className="transform -rotate-90 relative z-10"
          width={size}
          height={size}
        >
          <circle
            className={colors.bgLight}
            strokeWidth={strokeWidth}
            stroke="currentColor"
            fill="transparent"
            r={radius}
            cx={size / 2}
            cy={size / 2}
          />
          <motion.circle
            className={colors.text}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: offset }}
            transition={{ duration: 1.5, ease: [0.4, 0, 0.2, 1], delay }}
            strokeLinecap="round"
            stroke="currentColor"
            fill="transparent"
            r={radius}
            cx={size / 2}
            cy={size / 2}
          />
        </svg>
        <motion.div
          className="absolute inset-0 flex items-center justify-center z-20"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: delay + 0.5 }}
        >
          <span className={`text-lg font-bold ${colors.text}`}>{score}%</span>
        </motion.div>
      </div>
    </motion.div>
  );
};

/**
 * HorizontalProgressBar Component
 * Animated width fill bar with shine effect
 */
interface HorizontalProgressBarProps {
  score?: number;
  value?: number;
  label?: string;
  delay?: number;
  showValue?: boolean;
  size?: "sm" | "md" | "lg";
  height?: number;
}

export const HorizontalProgressBar: React.FC<HorizontalProgressBarProps> = ({
  score: scoreProp,
  value,
  label,
  delay = 0,
  showValue = true,
  size = "md",
  height,
}) => {
  const score = scoreProp ?? value ?? 0;
  const color = getScoreColor(score);
  const colors = scoreColorClasses[color];
  const heights = { sm: "h-1.5", md: "h-2.5", lg: "h-4" };
  const heightStyle = height ? { height: `${height}px` } : undefined;
  const heightClass = height ? "" : heights[size];

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.4, delay }}
    >
      <div className="flex justify-between items-center mb-1.5">
        {label && (
          <span className="text-sm font-medium text-gray-700">{label}</span>
        )}
        {showValue && (
          <motion.span
            className={`text-sm font-bold ${colors.text}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: delay + 0.3 }}
          >
            {Math.round(score)}%
          </motion.span>
        )}
      </div>
      <div
        className={`w-full ${heightClass} ${colors.bgLight} rounded-full overflow-hidden`}
        style={heightStyle}
      >
        <motion.div
          className={`h-full ${colors.bg} rounded-full relative overflow-hidden`}
          initial={{ width: 0 }}
          animate={{ width: `${score}%` }}
          transition={{ duration: 1, ease: [0.4, 0, 0.2, 1], delay: delay + 0.2 }}
        >
          <motion.div
            className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent"
            variants={shineVariants}
            initial="initial"
            animate="animate"
          />
        </motion.div>
      </div>
    </motion.div>
  );
};
