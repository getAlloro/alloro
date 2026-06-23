import React, { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard,
  Activity,
  Trophy,
  Sparkles,
  LogOut,
  ChevronRight,
  AlertTriangle,
  X,
  HelpCircle,
  Lock,
  Globe,
  PanelLeftClose,
  PanelLeftOpen,
  Settings as SettingsIcon,
} from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { useSidebar } from "./Admin/shell/SidebarContext";
import { apiGet } from "../api/index";
import { useIsWizardActive } from "../contexts/OnboardingWizardContext";
import { useAuth } from "../hooks/useAuth";
import { useLabels } from "../hooks/useLabels";
import type { UserProfile } from "../contexts/authContext";
import { LocationSwitcher } from "./LocationSwitcher";

interface SidebarProps {
  userProfile: UserProfile | null;
  onboardingCompleted: boolean | null;
  disconnect: () => void;
  selectedDomain?: unknown;
  isOpen?: boolean;
  onClose?: () => void;
}

interface NavItemProps {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  onClick: () => void;
  badge?: string;
  hasNotification?: boolean;
  isLocked?: boolean;
  minimized?: boolean;
}

const NavItem = ({
  icon,
  label,
  active = false,
  onClick,
  badge,
  hasNotification = false,
  isLocked = false,
  minimized = false,
}: NavItemProps) => (
  <button
    onClick={onClick}
    disabled={isLocked}
    title={minimized ? label : undefined}
    className={`w-full flex items-center ${
      minimized ? "justify-center px-0 py-3" : "justify-between px-4 py-3.5"
    } rounded-xl transition-all duration-300 group relative
    ${
      isLocked
        ? "opacity-40 cursor-not-allowed"
        : active
        ? "bg-alloro-sidehover text-white shadow-sm border border-white/5"
        : "text-white/40 hover:text-white hover:bg-alloro-sidehover"
    }`}
  >
    <div className={minimized ? "" : "flex items-center gap-3.5"}>
      <div
        className={`transition-transform duration-300 ${
          active
            ? "scale-110 text-alloro-orange"
            : "opacity-40 group-hover:opacity-100"
        }`}
      >
        {icon}
      </div>
      {!minimized && (
        <span
          className={`text-[13px] font-semibold tracking-tight ${
            active ? "text-white" : "group-hover:text-white/80"
          }`}
        >
          {label}
        </span>
      )}
    </div>
    {hasNotification && !active && !isLocked && (
      <span className={`absolute ${minimized ? "top-1 right-1" : "left-2.5 top-2.5"} flex h-1.5 w-1.5`}>
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-alloro-orange opacity-75"></span>
        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-alloro-orange"></span>
      </span>
    )}
    {!minimized && (
      <div className="flex items-center gap-2">
        {isLocked && <Lock size={12} className="text-white/30" />}
        {badge && !isLocked && (
          <span
            className={`px-2 py-0.5 rounded-md text-[9px] font-black leading-none
            ${
              active ? "bg-alloro-orange text-white" : "bg-white/10 text-white/40"
            }`}
          >
            {badge}
          </span>
        )}
        {!badge && !isLocked && active && <ChevronRight size={14} className="opacity-20" />}
      </div>
    )}
    {minimized && badge && !isLocked && (
      <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 flex items-center justify-center rounded-full bg-alloro-orange text-white text-[8px] font-black px-1">
        {badge}
      </span>
    )}
  </button>
);

export const Sidebar: React.FC<SidebarProps> = ({
  userProfile,
  onboardingCompleted,
  disconnect,
  isOpen,
  onClose,
}) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { collapsed, toggleCollapsed } = useSidebar();
  const isWizardActive = useIsWizardActive();
  const { billingStatus } = useAuth();
  const isLockedOut = billingStatus?.isLockedOut ?? false;
  const [hasWebsite, setHasWebsite] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [unreadSubmissionCount, setUnreadSubmissionCount] = useState<number>(0);

  // Check if org has a website project (determines whether Websites nav shows).
  useEffect(() => {
    const checkWebsite = async () => {
      const organizationId = userProfile?.organizationId;
      if (!organizationId) return;

      try {
        const data = await apiGet({ path: "/user/website" });
        if (data && !data.error) {
          setHasWebsite(true);
        }
      } catch {
        // Silent fail — no website project, or 401/403 for viewer role
      }
    };

    checkWebsite();
  }, [userProfile?.organizationId]);

  // Fetch unread submission count for sidebar indicator
  const loadSubmissionCount = useCallback(async () => {
    if (!hasWebsite || !onboardingCompleted) return;

    try {
      const result = await apiGet({ path: "/user/website/form-submissions/stats" });
      if (result?.success) {
        setUnreadSubmissionCount(result.unreadCount || 0);
      }
    } catch {
      // Silent fail
    }
  }, [hasWebsite, onboardingCompleted]);

  // Initial load and periodic refresh of submission count
  useEffect(() => {
    loadSubmissionCount();

    const interval = setInterval(loadSubmissionCount, 30000);
    return () => clearInterval(interval);
  }, [loadSubmissionCount]);

  // Listen for submission updates (when user opens submissions list)
  useEffect(() => {
    const handleSubmissionsUpdated = () => {
      loadSubmissionCount();
    };

    window.addEventListener("submissions:updated", handleSubmissionsUpdated);
    return () => {
      window.removeEventListener("submissions:updated", handleSubmissionsUpdated);
    };
  }, [loadSubmissionCount]);

  const handleLogout = () => {
    disconnect();
    window.location.href = "/signin";
  };


  const labels = useLabels();

  // Main navigation items
  const mainNavItems = [
    {
      label: labels.hubHome,
      icon: <LayoutDashboard size={18} />,
      path: "/dashboard",
      showDuringOnboarding: true,
    },
    {
      label: labels.hubReferrals,
      icon: <Activity size={18} />,
      path: "/pmsStatistics",
      showDuringOnboarding: false,
    },
    {
      label: "Local Rankings",
      icon: <Trophy size={18} />,
      path: "/rankings",
      showDuringOnboarding: false,
    },
    {
      label: "Reviews & Posts",
      icon: <Sparkles size={18} />,
      path: "/gbp-manager",
      showDuringOnboarding: false,
    },
  ];

  // Filter nav items based on onboarding status
  const filteredMainNav = onboardingCompleted
    ? mainNavItems
    : mainNavItems.filter((item) => item.showDuringOnboarding);

  const isActive = (path: string) => {
    if (path === "/dashboard" && location.pathname === "/dashboard")
      return true;
    // Competitor management (/dashboard/competitors/:id/onboarding) lives under
    // the Local Rankings section — keep that tab active while managing the set.
    if (path === "/rankings" && location.pathname.startsWith("/dashboard/competitors"))
      return true;
    return location.pathname.startsWith(path) && path !== "/dashboard";
  };

  const handleNavigate = (path: string) => {
    // Block navigation during wizard - the wizard controls navigation
    if (isWizardActive) {
      return;
    }
    navigate(path);
    onClose?.();
  };

  // Minimized = collapsed on desktop, but never when mobile drawer is open
  const isMinimized = collapsed && !isOpen;

  return (
    <>
      {/* Mobile Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-alloro-navy/40 backdrop-blur-sm z-[70] lg:hidden transition-opacity duration-300"
          onClick={onClose}
        />
      )}

      {/* Logout Confirmation Modal */}
      <AnimatePresence>
        {showLogoutConfirm && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-alloro-navy/50 backdrop-blur-sm"
              onClick={() => setShowLogoutConfirm(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: "spring", duration: 0.3 }}
              className="relative bg-white rounded-[32px] shadow-2xl w-full max-w-sm overflow-hidden"
            >
              <div className="p-8">
                <div className="flex items-center gap-4 mb-4">
                  <div className="p-3 rounded-xl bg-red-50 text-red-600">
                    <AlertTriangle className="w-6 h-6" />
                  </div>
                  <h3 className="text-lg font-black text-alloro-navy font-heading">
                    Log Out?
                  </h3>
                </div>
                <p className="text-slate-600 mb-6 leading-relaxed text-[14px]">
                  Are you sure you want to log out of your account?
                </p>
                <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                  <button
                    onClick={() => setShowLogoutConfirm(false)}
                    className="px-5 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleLogout}
                    className="px-5 py-2.5 text-sm font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl transition-colors shadow-md"
                  >
                    Log Out
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <aside
        className={`
          fixed left-0 top-0 h-screen bg-alloro-sidebg text-white flex flex-col z-[80] border-r border-white/5 shadow-2xl
          transition-all duration-300 ease-in-out overflow-hidden
          w-72 ${collapsed ? "lg:w-[68px]" : "lg:w-72"}
          ${isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
        `}
      >
        {/* Brand Header */}
        {isMinimized ? (
          <div className="px-3 pt-5 pb-4 flex flex-col items-center gap-3">
            <img
              src="/logo.png"
              alt="Alloro"
              className="w-8 h-8 rounded-xl shadow-soft-glow cursor-pointer hover:scale-105 transition-transform"
              onClick={() => handleNavigate("/dashboard")}
            />
            <button
              onClick={toggleCollapsed}
              className="p-1.5 text-white/30 hover:text-white/70 transition-colors"
              title="Expand sidebar"
            >
              <PanelLeftOpen size={16} />
            </button>
          </div>
        ) : (
          <div className="p-10 pb-12 flex items-center justify-between">
            <div
              className="flex min-w-0 flex-1 items-center gap-4 group cursor-pointer"
              onClick={() => handleNavigate("/dashboard")}
            >
              <img
                src="/logo.png"
                alt="Alloro"
                className="w-10 h-10 rounded-xl shadow-soft-glow transition-transform group-hover:scale-105"
              />
              <div className="min-w-0">
                <h1 className="font-display font-bold text-2xl tracking-tight leading-none">
                  Alloro
                </h1>
                {userProfile?.practiceName && (
                  <p className="mt-1.5 truncate whitespace-nowrap text-[9px] font-black uppercase tracking-[0.2em] text-white/30">
                    {userProfile.practiceName}
                  </p>
                )}
              </div>
            </div>
            <button
              onClick={onClose}
              className="lg:hidden p-2 text-white/40 hover:text-white transition-colors bg-white/5 rounded-lg"
            >
              <X size={18} />
            </button>
            <button
              onClick={toggleCollapsed}
              className="hidden lg:flex p-2 text-white/40 hover:text-white transition-colors bg-white/5 rounded-lg"
              title="Collapse sidebar"
            >
              <PanelLeftClose size={18} />
            </button>
          </div>
        )}

        {/* Navigation */}
        <nav className={`flex-1 overflow-y-auto ${isMinimized ? "px-2 space-y-2" : "px-6 space-y-10"} scrollbar-thin`}>
          {/* Lockout Banner */}
          {isLockedOut && (
            isMinimized ? (
              <div className="flex justify-center py-2" title="Account Locked">
                <Lock size={16} className="text-red-400" />
              </div>
            ) : (
              <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-1.5">
                  <Lock size={14} className="text-red-400 shrink-0" />
                  <span className="text-[11px] font-black text-red-300 uppercase tracking-wider">
                    Account Locked
                  </span>
                </div>
                <p className="text-[11px] text-red-300/70 leading-relaxed">
                  Add a payment method in Settings to restore access.
                </p>
              </div>
            )
          )}

          {/* Main Operating View */}
          {!isLockedOut && (
            <div className="space-y-1.5">
              {!isMinimized && (
                <div className="text-[10px] font-black text-white/20 uppercase tracking-[0.3em] px-4 mb-4">
                  Operations
                  {isWizardActive && (
                    <span className="ml-2 text-alloro-orange">(Tour Active)</span>
                  )}
                </div>
              )}
              {filteredMainNav.map(({ label, icon, path }) => (
                <NavItem
                  key={label}
                  icon={icon}
                  label={label}
                  active={isActive(path)}
                  onClick={() => handleNavigate(path)}
                  isLocked={isWizardActive}
                  minimized={isMinimized}
                />
              ))}
              {onboardingCompleted && (hasWebsite || isWizardActive) && (
                <NavItem
                  icon={<Globe size={18} />}
                  label="Website"
                  active={isActive("/dfy/website")}
                  onClick={() => handleNavigate("/dfy/website")}
                  hasNotification={unreadSubmissionCount > 0}
                  isLocked={isWizardActive}
                  minimized={isMinimized}
                />
              )}
            </div>
          )}

          {/* Support Section */}
          {!isLockedOut && onboardingCompleted && (
            <div className="space-y-1.5">
              {!isMinimized && (
                <div className="text-[10px] font-black text-white/20 uppercase tracking-[0.3em] px-4 mb-4">
                  Support
                </div>
              )}
              <NavItem
                icon={<HelpCircle size={18} />}
                label="Support"
                active={location.pathname === "/help"}
                onClick={() => handleNavigate("/help")}
                isLocked={isWizardActive}
                minimized={isMinimized}
              />
            </div>
          )}
        </nav>

        {/* Location Switcher — hidden when minimized */}
        {!isMinimized && <LocationSwitcher />}

        {/* Footer — Settings + Log out */}
        {isMinimized ? (
          <div className="px-2 pt-2 pb-4 mt-auto flex flex-col items-center gap-2">
            <button
              onClick={() => handleNavigate("/settings")}
              className="p-2 rounded-xl text-white/40 hover:text-white hover:bg-white/5 transition-all"
              title="Settings"
            >
              <SettingsIcon size={16} />
            </button>
            <button
              onClick={() => setShowLogoutConfirm(true)}
              className="p-2 rounded-xl text-white/40 hover:text-red-400 hover:bg-white/5 transition-all"
              title="Log out"
            >
              <LogOut size={16} />
            </button>
          </div>
        ) : (
          <div className="px-6 pt-2 pb-8 mt-auto space-y-1.5">
            <NavItem
              icon={<SettingsIcon size={18} />}
              label="Settings"
              active={isActive("/settings")}
              onClick={() => handleNavigate("/settings")}
              isLocked={isWizardActive}
              minimized={false}
            />
            <button
              onClick={() => setShowLogoutConfirm(true)}
              className="w-full flex items-center gap-3.5 px-4 py-3.5 rounded-xl text-white/40 hover:text-red-400 hover:bg-white/5 transition-all duration-300 text-sm font-medium"
            >
              <LogOut size={18} />
              Log out
            </button>
          </div>
        )}
      </aside>
    </>
  );
};
