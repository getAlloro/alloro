import { useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DashboardAlert } from "./DashboardAlert";
import type { DashboardAlertModel } from "./types";

export type DashboardAlertStackProps = {
  alerts: DashboardAlertModel[];
  className?: string;
};

const BEHIND_STYLES = [
  { scale: 0.96, y: 14, opacity: 0.7, z: 20 },
  { scale: 0.92, y: 26, opacity: 0.45, z: 10 },
];

/**
 * DashboardAlertStack — renders prioritized dashboard alerts as a cascade: the
 * highest-priority alert sits full-size on top, the rest peek behind it scaled
 * down, and left/right arrows cycle through them. Collapses to a single card
 * when only one alert is active. Shared by the main dashboard and the PMS
 * Statistics surface so both speak with one component.
 */
export function DashboardAlertStack({ alerts, className }: DashboardAlertStackProps) {
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState(0);
  const reduceMotion = useReducedMotion();

  const sorted = [...alerts].sort((a, b) => b.priority - a.priority);
  const count = sorted.length;
  if (count === 0) return null;

  const activeIndex = index % count;
  const active = sorted[activeIndex];
  const behind = BEHIND_STYLES.slice(0, Math.min(count - 1, 2)).map(
    (style, offset) => ({ alert: sorted[(activeIndex + offset + 1) % count], style })
  );

  const go = (next: number) => {
    setDirection(next);
    setIndex((current) => (current + next + count) % count);
  };

  const variants = {
    enter: (dir: number) => ({
      opacity: 0,
      x: reduceMotion ? 0 : dir > 0 ? 40 : -40,
      scale: 0.97,
    }),
    center: { opacity: 1, x: 0, scale: 1 },
    exit: (dir: number) => ({
      opacity: 0,
      x: reduceMotion ? 0 : dir > 0 ? -40 : 40,
      scale: 0.97,
    }),
  };

  return (
    <div className={className}>
      {count > 1 && (
        <div className="mb-2 flex items-center justify-end gap-2">
          <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#9AA0A6] tabular-nums">
            {activeIndex + 1} of {count}
          </span>
          <StackArrow label="Previous alert" onClick={() => go(-1)}>
            <ChevronLeft className="h-4 w-4" />
          </StackArrow>
          <StackArrow label="Next alert" onClick={() => go(1)}>
            <ChevronRight className="h-4 w-4" />
          </StackArrow>
        </div>
      )}

      <div className="relative pb-7">
        {behind.map(({ alert, style }) => (
          <div
            key={alert.id}
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0"
            style={{
              transform: `scale(${style.scale}) translateY(${style.y}px)`,
              transformOrigin: "top center",
              opacity: style.opacity,
              zIndex: style.z,
            }}
          >
            <DashboardAlert alert={alert} interactive={false} />
          </div>
        ))}

        <AnimatePresence mode="popLayout" initial={false} custom={direction}>
          <motion.div
            key={active.id}
            custom={direction}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.28, ease: "easeOut" }}
            className="relative z-30"
          >
            <DashboardAlert alert={active} />
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

function StackArrow({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#E8E4DD] bg-white text-[#1A1A1A] transition-all hover:-translate-y-px hover:border-alloro-orange/50 hover:text-alloro-orange focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-alloro-orange/40"
    >
      {children}
    </button>
  );
}
