// Copied from: frontend/src/components/settings/ProfileTab.tsx @ v0.0.82
// Visual-only replica — password API calls (getPasswordStatus, changePassword),
// toast, loading/saving state, password validation logic, visibility toggle
// useState, and form onSubmit have been stripped.
// Hardcoded: hasPassword = true (Change Password mode), all fields empty,
// eye icons in hidden state, password rules shown but unchecked.

import { Key, EyeOff, Check } from "lucide-react";
import type { ReplicaProps } from "../../types/docs";
import { DashboardLayout } from "./DashboardLayout";
import { SettingsTabs } from "./SettingsTabs";
import { HotspotZone } from "../HotspotZone";

const PASSWORD_RULES = [
  { label: "At least 8 characters" },
  { label: "1 uppercase letter" },
  { label: "1 number" },
];

export function AccountReplica({
  hotspots,
  activeHotspotId,
  onHotspotClick,
}: ReplicaProps) {
  const findHotspot = (id: string) => hotspots.find((h) => h.id === id);

  return (
    <DashboardLayout activeItem="account">
      <div className="max-w-[900px] space-y-5">
        {/* Settings Tabs */}
        <HotspotZone
          id="settings-tabs"
          hotspot={findHotspot("settings-tabs")}
          isActive={activeHotspotId === "settings-tabs"}
          onHotspotClick={onHotspotClick}
        >
          <SettingsTabs activeTab="account" />
        </HotspotZone>

        {/* Password Form */}
        <HotspotZone
          id="password-form"
          hotspot={findHotspot("password-form")}
          isActive={activeHotspotId === "password-form"}
          onHotspotClick={onHotspotClick}
        >
          <div className="max-w-xl">
            <div className="bg-white rounded-[2rem] border border-black/5 p-6 lg:p-8 shadow-premium relative overflow-hidden">
              <div className="absolute top-0 right-0 w-64 h-64 bg-alloro-orange/[0.03] rounded-full blur-3xl -mr-32 -mt-32 pointer-events-none"></div>

              <div className="relative z-10">
                {/* Header */}
                <div className="flex items-center gap-4 mb-6">
                  <div className="p-3 rounded-xl bg-alloro-navy/5 text-alloro-navy">
                    <Key className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-alloro-navy tracking-tight">
                      Change Password
                    </h3>
                    <p className="text-sm text-slate-500">
                      Update your account password
                    </p>
                  </div>
                </div>

                {/* Form */}
                <div className="space-y-5">
                  {/* Current Password */}
                  <div>
                    <label className="block text-[10px] font-black text-alloro-textDark/40 uppercase tracking-[0.15em] mb-2">
                      Current Password
                    </label>
                    <div className="relative">
                      <input
                        type="password"
                        readOnly
                        className="w-full px-4 py-3 bg-alloro-bg border border-black/5 rounded-xl text-sm font-medium text-alloro-navy focus:outline-none focus:ring-2 focus:ring-alloro-orange/30 focus:border-alloro-orange/30 pr-12"
                        placeholder="Enter current password"
                      />
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-400">
                        <EyeOff className="h-4 w-4" />
                      </div>
                    </div>
                  </div>

                  {/* New Password */}
                  <div>
                    <label className="block text-[10px] font-black text-alloro-textDark/40 uppercase tracking-[0.15em] mb-2">
                      New Password
                    </label>
                    <div className="relative">
                      <input
                        type="password"
                        readOnly
                        className="w-full px-4 py-3 bg-alloro-bg border border-black/5 rounded-xl text-sm font-medium text-alloro-navy focus:outline-none focus:ring-2 focus:ring-alloro-orange/30 focus:border-alloro-orange/30 pr-12"
                        placeholder="Enter new password"
                      />
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-400">
                        <EyeOff className="h-4 w-4" />
                      </div>
                    </div>

                    {/* Password Rules — always visible, all unchecked */}
                    <div className="mt-3 space-y-1.5">
                      {PASSWORD_RULES.map((rule) => (
                        <div
                          key={rule.label}
                          className="flex items-center gap-2 text-xs font-medium text-gray-400"
                        >
                          <Check className="h-3 w-3 opacity-30" />
                          {rule.label}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Confirm New Password */}
                  <div>
                    <label className="block text-[10px] font-black text-alloro-textDark/40 uppercase tracking-[0.15em] mb-2">
                      Confirm Password
                    </label>
                    <div className="relative">
                      <input
                        type="password"
                        readOnly
                        className="w-full px-4 py-3 bg-alloro-bg border border-black/5 rounded-xl text-sm font-medium text-alloro-navy focus:outline-none focus:ring-2 focus:ring-alloro-orange/30 focus:border-alloro-orange/30 pr-12"
                        placeholder="Confirm your password"
                      />
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-400">
                        <EyeOff className="h-4 w-4" />
                      </div>
                    </div>
                  </div>

                  {/* Submit */}
                  <HotspotZone
                    id="submit-btn"
                    hotspot={findHotspot("submit-btn")}
                    isActive={activeHotspotId === "submit-btn"}
                    onHotspotClick={onHotspotClick}
                  >
                    <button
                      type="button"
                      disabled
                      className="w-full px-6 py-3 bg-alloro-navy text-white text-sm font-black uppercase tracking-widest rounded-xl disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      Update Password
                    </button>
                  </HotspotZone>
                </div>
              </div>
            </div>
          </div>
        </HotspotZone>
      </div>
    </DashboardLayout>
  );
}
