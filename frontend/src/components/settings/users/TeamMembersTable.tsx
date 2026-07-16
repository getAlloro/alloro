import { motion } from "framer-motion";
import { Clock, Shield } from "lucide-react";
import type { SettingsUser, UserRole } from "../../../api/settingsUsers";
import { UserRoleSelect } from "./UserRoleSelect";

const USER_ROLES: UserRole[] = ["viewer", "manager", "admin"];

export type TeamMembersTableProps = {
  users: SettingsUser[];
  canManageRoles: boolean;
  canRemoveUsers: boolean;
  editingUserId: number | null;
  stagedRole: UserRole;
  isSavingRole: boolean;
  onBeginEdit: (userId: number, role: UserRole) => void;
  onRoleChange: (role: UserRole) => void;
  onSaveRole: (user: SettingsUser) => void;
  onCancelEdit: () => void;
  onRemove: (user: SettingsUser) => void;
};

function roleBadgeClasses(role: UserRole): string {
  if (role === "admin") {
    return "border-alloro-slateBlue/20 bg-alloro-slateBlue/10 text-alloro-slateBlue";
  }
  if (role === "manager") {
    return "border-alloro-orange/20 bg-alloro-orange/5 text-alloro-orange";
  }
  return "border-line-medium bg-alloro-navy/[0.035] text-alloro-navy/65";
}

export function TeamMembersTable({
  users,
  canManageRoles,
  canRemoveUsers,
  editingUserId,
  stagedRole,
  isSavingRole,
  onBeginEdit,
  onRoleChange,
  onSaveRole,
  onCancelEdit,
  onRemove,
}: TeamMembersTableProps) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.08, duration: 0.2 }}
      aria-label="Team members"
      className="overflow-hidden rounded-[2rem] border border-line-soft bg-alloro-surface shadow-premium"
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] table-fixed border-collapse text-left">
          <colgroup>
            <col className="w-[40%]" />
            <col className="w-[20%]" />
            <col className="w-[17%]" />
            <col className="w-[23%]" />
          </colgroup>
          <thead className="sticky top-0 z-10 bg-alloro-navy/[0.025]">
            <tr className="border-b border-line-soft">
              {[
                ["User", "text-left"],
                ["Role", "text-left"],
                ["Joined", "text-left"],
                ["Actions", "text-right"],
              ].map(([label, align]) => (
                <th
                  key={label}
                  scope="col"
                  className={`whitespace-nowrap px-5 py-3.5 font-mono-display text-[9px] font-black uppercase tracking-[0.18em] text-alloro-navy/40 ${align}`}
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line-soft">
            {users.map((user, index) => {
              const isEditing = editingUserId === user.id;
              const displayName = user.name || "Unknown";
              return (
                <tr
                  key={user.id}
                  className={`transition-colors hover:bg-accent-soft/45 ${
                    index % 2 === 0 ? "bg-alloro-surface" : "bg-alloro-navy/[0.015]"
                  }`}
                >
                  <td className="px-5 py-4">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-alloro-orange/10 text-sm font-black text-alloro-orange">
                        {(user.name || user.email).charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div
                          className="truncate whitespace-nowrap text-[13px] font-black text-alloro-navy"
                          title={displayName}
                        >
                          {displayName}
                        </div>
                        <div
                          className="mt-0.5 truncate whitespace-nowrap text-[10px] font-bold uppercase tracking-[0.1em] text-ink-muted"
                          title={user.email}
                        >
                          {user.email}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    {isEditing && canManageRoles ? (
                      <UserRoleSelect
                        value={stagedRole}
                        options={USER_ROLES}
                        onChange={onRoleChange}
                        ariaLabel={`Role for ${displayName}`}
                        placement="table"
                        autoFocus
                      />
                    ) : (
                      <span
                        className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-xl border px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.12em] ${roleBadgeClasses(user.role)}`}
                      >
                        <Shield className="h-3 w-3" />
                        {user.role}
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-5 py-4 text-[10px] font-bold uppercase tracking-[0.1em] text-ink-muted">
                    <span className="inline-flex items-center gap-1.5 tabular-nums">
                      <Clock className="h-3.5 w-3.5" />
                      {new Date(user.joined_at).toLocaleDateString()}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-5 py-4 text-right">
                    <div className="flex items-center justify-end gap-2.5 whitespace-nowrap">
                      {isEditing ? (
                        <>
                          <button
                            type="button"
                            disabled={isSavingRole}
                            onClick={() => onSaveRole(user)}
                            className="whitespace-nowrap rounded-lg px-2 py-1.5 text-[9px] font-black uppercase tracking-[0.12em] text-alloro-orange transition hover:bg-alloro-orange/10 focus:outline-none focus:ring-2 focus:ring-alloro-orange/30 disabled:opacity-50"
                          >
                            {isSavingRole ? "Saving..." : "Save"}
                          </button>
                          <button
                            type="button"
                            disabled={isSavingRole}
                            onClick={onCancelEdit}
                            className="whitespace-nowrap rounded-lg px-2 py-1.5 text-[9px] font-black uppercase tracking-[0.12em] text-ink-muted transition hover:bg-alloro-navy/5 hover:text-alloro-navy focus:outline-none focus:ring-2 focus:ring-alloro-orange/30 disabled:opacity-50"
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          {canManageRoles && (
                            <button
                              type="button"
                              onClick={() => onBeginEdit(user.id, user.role)}
                              className="whitespace-nowrap rounded-lg px-2 py-1.5 text-[9px] font-black uppercase tracking-[0.12em] text-alloro-orange transition hover:bg-alloro-orange/10 focus:outline-none focus:ring-2 focus:ring-alloro-orange/30"
                            >
                              Change role
                            </button>
                          )}
                          {canRemoveUsers && (
                            <button
                              type="button"
                              onClick={() => onRemove(user)}
                              className="whitespace-nowrap rounded-lg px-2 py-1.5 text-[9px] font-black uppercase tracking-[0.12em] text-alloro-danger transition hover:bg-danger-soft focus:outline-none focus:ring-2 focus:ring-alloro-danger/30"
                            >
                              Remove
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </motion.section>
  );
}
