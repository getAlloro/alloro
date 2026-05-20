// Copied from: frontend/src/pages/Settings.tsx @ v0.0.82
// Visual-only replica — NavLink routing, useLocation, Outlet, and the
// legacy billing redirect have been stripped. Desktop pills only (the
// mobile floating action bar is omitted since replicas are desktop-only).

import { Users, Link2, Shield, User } from "lucide-react";
import { clsx } from "clsx";

interface SettingsTabsProps {
  activeTab?: string;
}

const settingsTabs = [
  { id: "integrations", icon: Link2, label: "Integrations" },
  { id: "users", icon: Users, label: "Users & Roles" },
  { id: "billing", icon: Shield, label: "Billing" },
  { id: "account", icon: User, label: "Account" },
];

export function SettingsTabs({ activeTab }: SettingsTabsProps) {
  return (
    <div className="hidden sm:flex p-1.5 bg-white border border-black/5 rounded-[20px] shadow-[0_2px_8px_rgba(0,0,0,0.04)] w-fit max-w-full overflow-x-auto">
      {settingsTabs.map(({ id, icon: Icon, label }) => (
        <div
          key={id}
          className={clsx(
            "px-6 py-3 rounded-[14px] text-[10px] font-black uppercase tracking-widest transition-all duration-200 flex items-center gap-2 cursor-default",
            activeTab === id
              ? "bg-alloro-navy text-white shadow-lg"
              : "text-slate-400 hover:text-alloro-navy hover:bg-slate-50"
          )}
        >
          <Icon className="w-4 h-4" />
          {label}
        </div>
      ))}
    </div>
  );
}
