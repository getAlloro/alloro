import { useEffect, useState } from "react";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { Target, CalendarRange, Inbox } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { PmStats } from "../../types/pm";
import { fetchStats } from "../../api/pm";
import { logger } from "../../lib/logger";

function AnimatedNum({ value }: { value: number }) {
  const mv = useMotionValue(0);
  const spring = useSpring(mv, { stiffness: 50, damping: 15 });
  const display = useTransform(spring, (v) => Math.round(v));
  const [current, setCurrent] = useState(0);
  useEffect(() => { mv.set(value); }, [value, mv]);
  useEffect(() => display.on("change", setCurrent), [display]);
  return <span>{current}</span>;
}

const SEVERITY_COLORS: Record<string, string> = { green: "#3D8B40", amber: "#D4920A", red: "#C43333" };

type StatsRowProps = {
  onBacklogClick?: () => void;
};

type StatCard = {
  key: string;
  label: string;
  icon: LucideIcon;
  iconColor: string;
  iconBg: string;
  count: number;
  subtitle: string;
  numberColor: string;
  subtitleColor?: string;
  onClick?: () => void;
};

export function StatsRow({ onBacklogClick }: StatsRowProps) {
  const [stats, setStats] = useState<PmStats | null>(null);

  useEffect(() => { fetchStats().then(setStats).catch((err) => logger.error(err)); }, []);

  const cards: StatCard[] = [
    {
      key: "focus",
      label: "FOCUS TODAY",
      icon: Target,
      iconColor: "#D66853",
      iconBg: "rgba(214,104,83,0.08)",
      count: stats?.focus_today.count ?? 0,
      subtitle: stats?.focus_today.subtitle ?? "",
      numberColor: SEVERITY_COLORS[stats?.focus_today.severity ?? "green"] || "var(--color-pm-text-primary)",
      subtitleColor: (stats?.focus_today.severity === "amber" || stats?.focus_today.severity === "red") ? SEVERITY_COLORS[stats?.focus_today.severity] : undefined,
    },
    {
      key: "week",
      label: "THIS WEEK",
      icon: CalendarRange,
      iconColor: "#D4920A",
      iconBg: "rgba(212,146,10,0.08)",
      count: stats?.this_week.count ?? 0,
      subtitle: stats?.this_week.subtitle ?? "",
      numberColor: "var(--color-pm-text-primary)",
    },
    {
      key: "backlog",
      label: "BACKLOG",
      icon: Inbox,
      iconColor: "#5E5850",
      iconBg: "rgba(94,88,80,0.08)",
      count: stats?.backlog.count ?? 0,
      subtitle: stats?.backlog.subtitle ?? "",
      numberColor: "var(--color-pm-text-primary)",
      subtitleColor: stats?.backlog.severity === "amber" ? "#D4920A" : undefined,
      onClick: onBacklogClick,
    },
  ];

  return (
    <div className="grid grid-cols-3 gap-3">
      {cards.map((c, i) => {
        const Icon = c.icon;
        const content = (
          <>
            <div className="flex items-center gap-2 mb-3">
              <div className="flex h-7 w-7 items-center justify-center rounded-md" style={{ backgroundColor: c.iconBg }}>
                <Icon className="h-4 w-4" strokeWidth={1.5} style={{ color: c.iconColor }} />
              </div>
              <span className="text-[10px] font-semibold uppercase tracking-[0.05em]" style={{ color: "var(--color-pm-text-secondary)" }}>{c.label}</span>
            </div>
            <div className="text-[26px] font-bold" style={{ color: c.numberColor, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em" }}>
              <AnimatedNum value={c.count} />
            </div>
            <p className="text-[11px] mt-0.5" style={{ color: c.subtitleColor || "var(--color-pm-text-muted)" }}>{c.subtitle}</p>
          </>
        );
        const motionProps = {
          initial: { opacity: 0, y: 8 },
          animate: { opacity: 1, y: 0 },
          transition: { delay: i * 0.06, duration: 0.3, ease: "easeOut" as const },
          whileHover: { y: -1, transition: { duration: 0.15 } },
        };
        const style = {
          backgroundColor: "var(--color-pm-bg-secondary)",
          boxShadow: "var(--pm-shadow-card)",
        };

        if (c.onClick) {
          return (
            <motion.button
              key={c.key}
              type="button"
              onClick={c.onClick}
              {...motionProps}
              className="w-full rounded-xl p-4 text-left cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#D66853]/30"
              style={style}
            >
              {content}
            </motion.button>
          );
        }

        return (
          <motion.div
            key={c.key}
            {...motionProps}
            className="rounded-xl p-4"
            style={style}
          >
            {content}
          </motion.div>
        );
      })}
    </div>
  );
}
