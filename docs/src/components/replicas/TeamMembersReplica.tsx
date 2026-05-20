// Copied from: frontend/src/components/settings/UsersTab.tsx @ v0.0.82
// Visual-only replica — API mutations (apiPost, apiPut, apiDelete),
// useSettingsUsers query, useInvalidateSettingsUsers, modal state
// (invite/confirm/alert), role change handlers, invite flow, and
// getPriorityItem localStorage have been stripped.
// Hardcoded 3 users + 1 pending invitation. Default state: table
// populated, no modals open.

import { UserPlus, Shield, Clock, Users as UsersIcon, RefreshCw } from "lucide-react";
import type { ReplicaProps } from "../../types/docs";
import { DashboardLayout } from "./DashboardLayout";
import { SettingsTabs } from "./SettingsTabs";
import { HotspotZone } from "../HotspotZone";

interface HardcodedUser {
  id: number;
  email: string;
  name: string;
  role: "admin" | "manager" | "viewer";
  joined_at: string;
}

interface HardcodedInvitation {
  id: number;
  email: string;
  role: string;
  expires_at: string;
}

const users: HardcodedUser[] = [
  {
    id: 1,
    email: "dr.smith@smileclinic.com",
    name: "Dr. Sarah Smith",
    role: "admin",
    joined_at: "2026-01-15",
  },
  {
    id: 2,
    email: "jessica@smileclinic.com",
    name: "Jessica Torres",
    role: "manager",
    joined_at: "2026-03-01",
  },
  {
    id: 3,
    email: "marcus@smileclinic.com",
    name: "Marcus Lee",
    role: "viewer",
    joined_at: "2026-04-10",
  },
];

const invitations: HardcodedInvitation[] = [
  {
    id: 100,
    email: "newdentist@smileclinic.com",
    role: "viewer",
    expires_at: "2026-05-24",
  },
];

export function TeamMembersReplica({
  hotspots,
  activeHotspotId,
  onHotspotClick,
}: ReplicaProps) {
  const findHotspot = (id: string) => hotspots.find((h) => h.id === id);

  return (
    <DashboardLayout activeItem="team">
      {/* Settings Tabs */}
      <HotspotZone
        id="settings-tabs"
        hotspot={findHotspot("settings-tabs")}
        isActive={activeHotspotId === "settings-tabs"}
        onHotspotClick={onHotspotClick}
      >
        <div className="mb-6">
          <SettingsTabs activeTab="users" />
        </div>
      </HotspotZone>

      {/* Header */}
      <HotspotZone
        id="team-header"
        hotspot={findHotspot("team-header")}
        isActive={activeHotspotId === "team-header"}
        onHotspotClick={onHotspotClick}
      >
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white rounded-[2.5rem] border border-black/5 p-10 shadow-premium mb-6">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-alloro-orange/10 rounded-2xl">
              <UsersIcon className="w-5 h-5 text-alloro-orange" />
            </div>
            <div>
              <h2 className="text-xl font-black text-alloro-navy font-heading tracking-tight">
                Team Members
              </h2>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">
                Manage who has access to this organization
              </p>
            </div>
          </div>
          <button
            type="button"
            className="px-6 py-3 bg-alloro-orange text-white rounded-xl hover:bg-blue-700 transition-colors text-[10px] font-black uppercase tracking-widest flex items-center gap-2 shadow-lg active:scale-95 w-full sm:w-auto justify-center cursor-default"
          >
            <UserPlus className="w-4 h-4" />
            Invite Member
          </button>
        </div>
      </HotspotZone>

      {/* Users Table */}
      <HotspotZone
        id="users-table"
        hotspot={findHotspot("users-table")}
        isActive={activeHotspotId === "users-table"}
        onHotspotClick={onHotspotClick}
      >
        <div className="bg-white rounded-[2.5rem] shadow-premium border border-black/5 overflow-hidden p-4 sm:p-8 mb-6">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="border-b border-black/5">
                <tr>
                  <th className="px-6 sm:px-8 py-4 text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">
                    User
                  </th>
                  <th className="px-6 py-4 text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">
                    Role
                  </th>
                  <th className="px-6 py-4 text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">
                    Joined
                  </th>
                  <th className="px-6 sm:px-8 py-4 text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] text-right">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5">
                {users.map((user) => (
                  <tr
                    key={user.id}
                    className="hover:bg-slate-50/50 transition-colors"
                  >
                    <td className="px-6 sm:px-8 py-5">
                      <div className="flex items-center">
                        <div className="h-11 w-11 rounded-2xl bg-alloro-orange/10 flex items-center justify-center text-alloro-orange font-black text-sm mr-4">
                          {user.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="text-sm font-black text-alloro-navy tracking-tight">
                            {user.name}
                          </div>
                          <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">
                            {user.email}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      <span
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest border ${
                          user.role === "admin"
                            ? "bg-purple-50 text-purple-700 border-purple-200"
                            : user.role === "manager"
                              ? "bg-alloro-orange/5 text-alloro-orange border-alloro-orange/20"
                              : "bg-slate-50 text-slate-600 border-slate-200"
                        }`}
                      >
                        <Shield className="w-3 h-3" />
                        {user.role}
                      </span>
                    </td>
                    <td className="px-6 py-5 text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5" />
                        {new Date(user.joined_at).toLocaleDateString()}
                      </div>
                    </td>
                    <td className="px-6 sm:px-8 py-5 text-right">
                      <div className="flex justify-end gap-3">
                        <span className="text-alloro-orange text-[10px] font-black uppercase tracking-widest cursor-default">
                          Change Role
                        </span>
                        <span className="text-red-500 text-[10px] font-black uppercase tracking-widest cursor-default">
                          Remove
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </HotspotZone>

      {/* Pending Invitations */}
      <HotspotZone
        id="invitations-section"
        hotspot={findHotspot("invitations-section")}
        isActive={activeHotspotId === "invitations-section"}
        onHotspotClick={onHotspotClick}
      >
        <div className="bg-white rounded-[2.5rem] shadow-premium border border-black/5 overflow-hidden p-8">
          <div className="mb-6 flex items-center gap-3">
            <div className="p-2 bg-amber-50 rounded-xl">
              <Clock className="w-4 h-4 text-amber-500" />
            </div>
            <h3 className="text-lg font-black text-alloro-navy font-heading tracking-tight">
              Pending Invitations
            </h3>
          </div>
          <table className="w-full text-left">
            <tbody className="divide-y divide-black/5">
              {invitations.map((invite) => (
                <tr key={invite.id} className="hover:bg-slate-50/50">
                  <td className="px-6 sm:px-8 py-5">
                    <div className="text-sm font-black text-alloro-navy tracking-tight">
                      {invite.email}
                    </div>
                  </td>
                  <td className="px-6 py-5">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest bg-amber-50 text-amber-700 border border-amber-200">
                      <Clock className="w-3 h-3" />
                      {invite.role} (Pending)
                    </span>
                  </td>
                  <td className="px-6 py-5 text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                    Expires: {new Date(invite.expires_at).toLocaleDateString()}
                  </td>
                  <td className="px-6 sm:px-8 py-5 text-right">
                    <span className="inline-flex items-center gap-1.5 text-alloro-orange text-[10px] font-black uppercase tracking-widest cursor-default">
                      <RefreshCw className="w-3 h-3" />
                      Resend
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </HotspotZone>
    </DashboardLayout>
  );
}
