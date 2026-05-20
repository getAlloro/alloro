import { NavLink } from "react-router-dom";
import { clsx } from "clsx";
import { CATEGORIES, getPagesByCategory } from "../data/pages";
import {
  LogIn,
  LayoutDashboard,
  Trophy,
  Activity,
  CheckSquare,
  Bell,
  Plug,
  Users,
  CreditCard,
  UserCircle,
  Globe,
  LifeBuoy,
  UserPlus,
  KeyRound,
  Clock,
} from "lucide-react";

const ICON_MAP: Record<string, React.ReactNode> = {
  signin: <LogIn size={16} />,
  signup: <UserPlus size={16} />,
  "forgot-password": <KeyRound size={16} />,
  "practice-hub": <LayoutDashboard size={16} />,
  "referrals-hub": <Activity size={16} />,
  "local-rankings": <Trophy size={16} />,
  "todo-list": <CheckSquare size={16} />,
  notifications: <Bell size={16} />,
  "settings-integrations": <Plug size={16} />,
  "settings-users": <Users size={16} />,
  "settings-billing": <CreditCard size={16} />,
  "settings-account": <UserCircle size={16} />,
  website: <Globe size={16} />,
  support: <LifeBuoy size={16} />,
};

interface SidebarProps {
  open?: boolean;
  onClose?: () => void;
}

export function Sidebar({ open = false, onClose }: SidebarProps) {
  const sidebarContent = (
    <aside className="w-72 bg-white border-r border-alloro-border flex flex-col h-full">
      {/* Logo */}
      <div className="px-6 py-6 border-b border-alloro-border">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-alloro-orange flex items-center justify-center">
            <span className="text-white font-bold text-sm">A</span>
          </div>
          <div>
            <h1 className="font-display text-xl text-alloro-navy">Alloro Docs</h1>
            <p className="text-[11px] text-alloro-slate font-medium">Client Guide</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-4 py-5 space-y-6">
        {CATEGORIES.map(({ key, label }) => {
          const pages = getPagesByCategory(key);
          return (
            <div key={key}>
              <h3 className="text-[10px] font-bold uppercase tracking-[0.14em] text-alloro-slate px-3 mb-2">
                {label}
              </h3>
              <ul className="space-y-0.5">
                {pages.map((page) => (
                  <li key={page.slug}>
                    <NavLink
                      to={`/docs/${page.slug}`}
                      onClick={onClose}
                      className={({ isActive }) =>
                        clsx(
                          "flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium transition-colors",
                          isActive
                            ? "bg-alloro-orange-light text-alloro-orange"
                            : "text-alloro-navy/70 hover:bg-alloro-cream hover:text-alloro-navy"
                        )
                      }
                    >
                      {ICON_MAP[page.slug] ?? <Clock size={16} />}
                      {page.shortTitle}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-6 py-4 border-t border-alloro-border">
        <NavLink
          to="/changelog"
          onClick={onClose}
          className={({ isActive }) =>
            clsx(
              "text-xs font-medium transition-colors",
              isActive ? "text-alloro-orange" : "text-alloro-slate hover:text-alloro-navy"
            )
          }
        >
          Changelog
        </NavLink>
      </div>
    </aside>
  );

  return (
    <>
      {/* Desktop: fixed sidebar */}
      <div className="hidden lg:block fixed left-0 top-0 bottom-0 z-30">
        {sidebarContent}
      </div>

      {/* Mobile: overlay */}
      {open && (
        <div className="lg:hidden fixed inset-0 z-40 flex">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-sm"
            onClick={onClose}
          />
          {/* Drawer */}
          <div className="relative z-50 flex-shrink-0">
            {sidebarContent}
          </div>
        </div>
      )}
    </>
  );
}
