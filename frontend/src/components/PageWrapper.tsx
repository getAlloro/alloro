import React, { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Menu, Bell, Lock, CreditCard, ArrowRight } from "lucide-react";
import { Sidebar } from "./Sidebar";
import { MobileBottomNav } from "./MobileBottomNav";
import { LocationTransitionOverlay } from "./LocationTransitionOverlay";
import { SidebarProvider, useSidebar } from "./Admin/shell/SidebarContext";
import { useAuth } from "../hooks/useAuth";
import { useSession } from "../contexts/sessionContext";

interface PageWrapperProps {
  children: React.ReactNode;
}

export const PageWrapper: React.FC<PageWrapperProps> = ({ children }) => {
  return (
    <SidebarProvider defaultCollapsed={false}>
      <PageWrapperInner>{children}</PageWrapperInner>
    </SidebarProvider>
  );
};

const PageWrapperInner: React.FC<PageWrapperProps> = ({ children }) => {
  const { userProfile, selectedDomain, onboardingCompleted, billingStatus } =
    useAuth();
  const { disconnect } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const { collapsed } = useSidebar();

  const [sidebarOpen, setSidebarOpen] = useState(false);

  const isLockedOut = billingStatus?.isLockedOut ?? false;
  const isOnSettingsPage = location.pathname.startsWith("/settings");

  // Redirect locked-out users to /settings (the only page they can access)
  useEffect(() => {
    if (isLockedOut && !isOnSettingsPage) {
      navigate("/settings/billing", { replace: true });
    }
  }, [isLockedOut, isOnSettingsPage, navigate]);

  return (
    <div className="flex bg-alloro-bg min-h-screen font-body text-alloro-navy relative overflow-x-hidden selection:bg-alloro-orange selection:text-white">
      {/* Mobile Header - consistent across all pages */}
      <div className="lg:hidden fixed top-0 left-0 right-0 h-16 bg-white border-b border-slate-200 flex items-center justify-between px-4 sm:px-6 z-[60] shadow-sm">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 text-alloro-navy hover:bg-slate-100 rounded-lg transition-colors"
            aria-label="Open menu"
          >
            <Menu size={24} />
          </button>
          <div className="flex items-center gap-2">
            <img
              src="/logo.png"
              alt="Alloro"
              className="w-8 h-8 rounded-lg object-contain"
            />
            <span className="text-alloro-navy font-heading font-black text-base hidden sm:inline-block">
              {onboardingCompleted
                ? userProfile?.practiceName || "Alloro"
                : "Alloro"}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {!isLockedOut && (
            <button
              onClick={() => navigate("/notifications")}
              className="p-2 text-slate-400 hover:text-alloro-orange transition-colors relative"
            >
              <Bell size={20} />
            </button>
          )}
          <button
            onClick={() => navigate("/settings")}
            className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-bold border border-slate-200"
          >
            {userProfile?.practiceName?.substring(0, 2).toUpperCase() || "AP"}
          </button>
        </div>
      </div>

      <Sidebar
        userProfile={userProfile}
        onboardingCompleted={onboardingCompleted}
        disconnect={disconnect}
        selectedDomain={selectedDomain}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      {/* Main Content Area - responsive padding applied here */}
      <main
        className={`flex-1 w-full pt-16 lg:pt-0 min-h-screen flex flex-col transition-all duration-300 ease-in-out ${
          collapsed ? "lg:pl-[68px]" : "lg:pl-72"
        }`}
      >
        {/* Lockout Banner — persistent top bar when account is locked */}
        {isLockedOut && (
          <div className="bg-red-50 border-b border-red-200 px-4 sm:px-6 py-3 sm:py-3.5 shrink-0">
            <div className="flex items-center gap-3 max-w-5xl mx-auto">
              <Lock size={14} className="text-red-600 shrink-0" />
              <p className="flex-1 text-xs sm:text-[13px] text-red-800 font-medium leading-snug">
                Your account is locked. Add a payment method to restore full access.
              </p>
              {!isOnSettingsPage && (
                <button
                  onClick={() => navigate("/settings/billing")}
                  className="group flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors shrink-0 whitespace-nowrap shadow-sm"
                >
                  <span className="hidden sm:inline">Go to Settings</span>
                  <span className="sm:hidden">Fix</span>
                  <ArrowRight size={12} className="transition-transform group-hover:translate-x-0.5" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Subscribe Banner — persistent for admin-granted users without Stripe */}
        {!isLockedOut && billingStatus?.isAdminGranted && !isOnSettingsPage && (
          <div className="bg-amber-50 border-b border-amber-200 px-4 sm:px-6 py-3 sm:py-3.5 shrink-0">
            <div className="flex items-center gap-3 max-w-5xl mx-auto">
              <CreditCard size={14} className="text-amber-600 shrink-0" />
              <p className="flex-1 text-xs sm:text-[13px] text-amber-800 font-medium leading-snug">
                You haven't subscribed to Alloro yet.{" "}
                <span className="hidden sm:inline">Head to Settings › Billing to get started.</span>
              </p>
              <button
                onClick={() => navigate("/settings/billing")}
                className="group flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-alloro-orange hover:bg-[#c45a47] rounded-lg transition-colors shrink-0 whitespace-nowrap shadow-sm"
              >
                Subscribe
                <ArrowRight size={12} className="transition-transform group-hover:translate-x-0.5" />
              </button>
            </div>
          </div>
        )}
        {children}
      </main>

      <MobileBottomNav onboardingCompleted={onboardingCompleted} />
      <LocationTransitionOverlay />
    </div>
  );
};
