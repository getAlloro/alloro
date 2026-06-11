import React from "react";
import { motion } from "framer-motion";
import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  Activity,
  Trophy,
  Sparkles,
  Settings as SettingsIcon,
  type LucideIcon,
} from "lucide-react";
import { useIsWizardActive } from "../contexts/OnboardingWizardContext";

interface NavItem {
  to: string;
  icon: LucideIcon;
  label: string;
  requiresOnboarding: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { to: "/dashboard", icon: LayoutDashboard, label: "Practice Hub", requiresOnboarding: false },
  { to: "/pmsStatistics", icon: Activity, label: "Referrals Hub", requiresOnboarding: true },
  { to: "/rankings", icon: Trophy, label: "Local Rankings", requiresOnboarding: true },
  { to: "/gbp-manager", icon: Sparkles, label: "Reviews & Posts", requiresOnboarding: true },
  { to: "/settings", icon: SettingsIcon, label: "Settings", requiresOnboarding: false },
];

interface MobileBottomNavProps {
  onboardingCompleted: boolean | null;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  onboardingCompleted,
}) => {
  const isWizardActive = useIsWizardActive();

  // Wizard controls its own navigation — hide bar to avoid accidental jumps
  if (isWizardActive) return null;

  const visibleItems = onboardingCompleted
    ? NAV_ITEMS
    : NAV_ITEMS.filter((item) => !item.requiresOnboarding);

  return (
    <motion.nav
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15 }}
      aria-label="Primary navigation"
      className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-alloro-sidebg/95 backdrop-blur-md border-t border-white/5 rounded-t-xl shadow-[0_-8px_32px_rgba(0,0,0,0.35)] pb-[env(safe-area-inset-bottom)]"
    >
      <div className="flex items-center justify-between px-2 pt-2 pb-2">
        {visibleItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/settings" ? false : to === "/dashboard"}
            aria-label={label}
            className={({ isActive }) =>
              `flex items-center justify-center w-11 h-11 rounded-[12px] transition-all duration-200 ${
                isActive
                  ? "bg-alloro-orange text-white shadow-lg scale-105"
                  : "text-white/50 hover:text-white hover:bg-white/5"
              }`
            }
          >
            <Icon className="w-5 h-5" />
          </NavLink>
        ))}
      </div>
    </motion.nav>
  );
};
