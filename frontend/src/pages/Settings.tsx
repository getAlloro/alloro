import React, { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Users,
  Link2,
  MapPin,
  Shield,
  User,
} from "lucide-react";
import { Outlet, NavLink, useSearchParams, useNavigate, useLocation } from "react-router-dom";
export const Settings: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();

  // Legacy redirect: ?billing=cancelled → /settings/billing?cancelled=true
  useEffect(() => {
    if (searchParams.get("billing") === "cancelled") {
      navigate("/settings/billing?cancelled=true", { replace: true });
    }
  }, [searchParams, navigate]);

  const tabClass = (isActive: boolean) =>
    `px-6 py-3 rounded-[14px] text-[10px] font-black uppercase tracking-widest transition-all duration-200 flex items-center gap-2 ${
      isActive
        ? "bg-alloro-navy text-white shadow-lg"
        : "text-slate-400 hover:text-alloro-navy hover:bg-slate-50"
    }`;

  const settingsTabs = [
    { to: "/settings/integrations", icon: Link2, label: "Integrations" },
    { to: "/settings/locations", icon: MapPin, label: "Locations" },
    { to: "/settings/users", icon: Users, label: "Users & Roles" },
    { to: "/settings/billing", icon: Shield, label: "Billing" },
    { to: "/settings/account", icon: User, label: "Account" },
  ];

  return (
    <div className="min-h-screen bg-alloro-bg font-body text-alloro-textDark pb-32 selection:bg-alloro-orange selection:text-white">
      <div className="max-w-[1400px] mx-auto relative flex flex-col">
        {/* Main Content */}
        <main className="w-full max-w-[960px] mx-auto px-4 sm:px-6 md:px-8 lg:px-10 py-8 lg:py-10 space-y-8">
          {/* Tabs — desktop/tablet pills */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="hidden sm:flex p-1.5 bg-white border border-black/5 rounded-[20px] shadow-[0_2px_8px_rgba(0,0,0,0.04)] w-fit max-w-full overflow-x-auto"
          >
            {settingsTabs.map(({ to, icon: Icon, label }) => (
              <NavLink key={to} to={to} className={({ isActive }) => tabClass(isActive)}>
                <Icon className="w-4 h-4" />
                {label}
              </NavLink>
            ))}
          </motion.div>

          {/* Route Content */}
          <Outlet />

          {/* Mobile floating action bar — active tab expands with animated label */}
          <motion.nav
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            aria-label="Settings sections"
            className="sm:hidden fixed bottom-[calc(3.5rem+env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 z-40 flex items-center gap-1 p-1.5 bg-white/95 backdrop-blur-md border border-black/5 rounded-full shadow-[0_8px_32px_rgba(0,0,0,0.12)]"
          >
            {settingsTabs.map(({ to, icon: Icon, label }) => {
              const isActive = location.pathname.startsWith(to);
              return (
                <NavLink
                  key={to}
                  to={to}
                  aria-label={label}
                  className={`flex items-center h-11 rounded-full transition-colors duration-200 overflow-hidden ${
                    isActive
                      ? "bg-alloro-navy text-white shadow-lg px-4 gap-2"
                      : "text-slate-400 hover:text-alloro-navy hover:bg-slate-50 w-11 justify-center"
                  }`}
                >
                  <Icon className="w-5 h-5 shrink-0" />
                  <AnimatePresence initial={false}>
                    {isActive && (
                      <motion.span
                        key={`${to}-label`}
                        initial={{ opacity: 0, width: 0 }}
                        animate={{ opacity: 1, width: "auto" }}
                        exit={{ opacity: 0, width: 0 }}
                        transition={{ duration: 0.22, ease: "easeOut" }}
                        className="text-[11px] font-black uppercase tracking-wider whitespace-nowrap"
                      >
                        {label}
                      </motion.span>
                    )}
                  </AnimatePresence>
                </NavLink>
              );
            })}
          </motion.nav>

          <footer className="pt-16 pb-12 flex flex-col items-center gap-10 text-center">
            <img
              src="/logo.png"
              alt="Alloro"
              className="w-16 h-16 rounded-2xl shadow-2xl"
            />
            <p className="text-[11px] text-alloro-textDark/20 font-black tracking-[0.4em] uppercase">
              Alloro Settings • v2.6.0
            </p>
          </footer>
        </main>
      </div>
    </div>
  );
};
