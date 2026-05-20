// Copied from: frontend/src/components/Sidebar.tsx @ v0.0.82
// Visual-only replica — all API calls, event listeners, auth, routing,
// LocationSwitcher, billing checks, and wizard logic have been stripped.

import {
  LayoutDashboard,
  Activity,
  CheckSquare,
  Trophy,
  Bell,
  LogOut,
  ChevronRight,
  HelpCircle,
  Globe,
  MapPin,
} from "lucide-react";

interface AlloroSidebarProps {
  activeItem?: string;
}

interface NavItemProps {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  badge?: string;
  hasNotification?: boolean;
}

function NavItem({
  icon,
  label,
  active = false,
  badge,
  hasNotification = false,
}: NavItemProps) {
  return (
    <button
      className={`w-full flex items-center justify-between px-4 py-3.5 rounded-xl transition-all duration-300 group relative
      ${
        active
          ? "bg-alloro-sidehover text-white shadow-sm border border-white/5"
          : "text-white/40 hover:text-white hover:bg-alloro-sidehover"
      }`}
    >
      <div className="flex items-center gap-3.5">
        <div
          className={`transition-transform duration-300 ${
            active
              ? "scale-110 text-alloro-orange"
              : "opacity-40 group-hover:opacity-100"
          }`}
        >
          {icon}
        </div>
        <span
          className={`text-[13px] font-semibold tracking-tight ${
            active ? "text-white" : "group-hover:text-white/80"
          }`}
        >
          {label}
        </span>
      </div>
      {hasNotification && !active && (
        <span className="absolute left-2.5 top-2.5 flex h-1.5 w-1.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-alloro-orange opacity-75"></span>
          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-alloro-orange"></span>
        </span>
      )}
      <div className="flex items-center gap-2">
        {badge && (
          <span
            className={`px-2 py-0.5 rounded-md text-[9px] font-black leading-none
            ${
              active
                ? "bg-alloro-orange text-white"
                : "bg-white/10 text-white/40"
            }`}
          >
            {badge}
          </span>
        )}
        {!badge && active && (
          <ChevronRight size={14} className="opacity-20" />
        )}
      </div>
    </button>
  );
}

// Static nav data matching the real sidebar's structure
const mainNavItems = [
  { label: "Practice Hub", icon: <LayoutDashboard size={18} />, id: "practice-hub" },
  { label: "Referrals Hub", icon: <Activity size={18} />, id: "referrals-hub" },
  { label: "Local Rankings", icon: <Trophy size={18} />, id: "local-rankings" },
];

const executionNavItems = [
  { label: "To-Do List", icon: <CheckSquare size={18} />, id: "todo-list", badge: "3" },
  { label: "Notifications", icon: <Bell size={18} />, id: "notifications", hasNotification: true },
];

export function AlloroSidebar({ activeItem }: AlloroSidebarProps) {
  return (
    <aside className="shrink-0 w-72 h-full bg-alloro-sidebg text-white flex flex-col border-r border-white/5 shadow-2xl overflow-hidden">
      {/* Brand Header */}
      <div className="p-10 pb-12 flex items-center justify-between">
        <div className="flex items-center gap-4 group cursor-pointer">
          <img
            src="/logo.png"
            alt="Alloro"
            className="w-10 h-10 rounded-xl shadow-soft-glow transition-transform group-hover:scale-105"
          />
          <h1 className="font-display font-bold text-2xl tracking-tight leading-none">
            Alloro
          </h1>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-6 space-y-10 scrollbar-thin">
        {/* Operations */}
        <div className="space-y-1.5">
          <div className="text-[10px] font-black text-white/20 uppercase tracking-[0.3em] px-4 mb-4">
            Operations
          </div>
          {mainNavItems.map(({ label, icon, id }) => (
            <NavItem
              key={id}
              icon={icon}
              label={label}
              active={activeItem === id}
            />
          ))}
        </div>

        {/* Websites */}
        <div className="space-y-1.5">
          <NavItem
            icon={<Globe size={18} />}
            label="Websites"
            active={activeItem === "website"}
          />
        </div>

        {/* Execution */}
        <div className="space-y-1.5">
          <div className="text-[10px] font-black text-white/20 uppercase tracking-[0.3em] px-4 mb-4">
            Execution
          </div>
          {executionNavItems.map(({ label, icon, id, badge, hasNotification }) => (
            <NavItem
              key={id}
              icon={icon}
              label={label}
              active={activeItem === id}
              badge={badge}
              hasNotification={hasNotification}
            />
          ))}
        </div>

        {/* Support */}
        <div className="space-y-1.5">
          <div className="text-[10px] font-black text-white/20 uppercase tracking-[0.3em] px-4 mb-4">
            Support
          </div>
          <NavItem
            icon={<HelpCircle size={18} />}
            label="Support"
            active={activeItem === "support"}
          />
        </div>
      </nav>

      {/* Location Card (static replacement for LocationSwitcher) */}
      <div className="px-6 py-3">
        <div className="bg-white/5 border border-white/5 rounded-2xl p-4 flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-alloro-orange/20 flex items-center justify-center">
            <MapPin size={14} className="text-alloro-orange" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[12px] font-bold text-white truncate">
              Smile Clinic - Downtown
            </p>
            <p className="text-[9px] text-white/30 font-black uppercase tracking-widest mt-0.5">
              Primary Location
            </p>
          </div>
        </div>
      </div>

      {/* Footer / Account */}
      <div className="px-8 pt-2 pb-8 mt-auto">
        <div className="bg-white/5 border border-white/5 rounded-2xl p-5 transition-all hover:bg-alloro-sidehover cursor-pointer group">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center text-[10px] font-black border border-white/10 group-hover:border-alloro-orange transition-colors">
              SM
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-bold text-white truncate">
                Dr. Alex Smith
              </p>
              <p className="text-[9px] text-white/20 font-black uppercase tracking-widest mt-0.5">
                Administrator
              </p>
            </div>
          </div>
          <button className="flex items-center gap-2 text-white/20 hover:text-red-400 transition-all w-full text-[9px] font-black uppercase tracking-widest">
            <LogOut size={14} /> Disconnect
          </button>
        </div>
      </div>
    </aside>
  );
}
