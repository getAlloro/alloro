import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { UserPlus, Shield, Clock, X, Users as UsersIcon, RefreshCw } from "lucide-react";
import { apiPost, apiPut, apiDelete } from "../../api";
import { getPriorityItem } from "../../hooks/useLocalStorage";
import { ConfirmModal } from "@/components/settings/ConfirmModal";
import { AlertModal } from "@/components/ui/AlertModal";
import { useSettingsUsers, useInvalidateSettingsUsers } from "../../hooks/queries/useSettingsQueries";
import { useIsWizardActive, useWizardDemoData } from "../../contexts/OnboardingWizardContext";

interface User {
  id: number;
  email: string;
  name: string;
  role: string;
  joined_at: string;
}

interface Invitation {
  id: number;
  email: string;
  role: string;
  created_at: string;
  expires_at: string;
}

type UserRole = "admin" | "manager" | "viewer";

export const UsersTab: React.FC = () => {
  const isWizardActive = useIsWizardActive();
  const wizardDemoData = useWizardDemoData();
  const { data: usersData, isLoading: _isLoading } = useSettingsUsers();
  const { invalidateAll: refetchUsers } = useInvalidateSettingsUsers();
  const isLoading = isWizardActive ? false : _isLoading;
  const users = (isWizardActive && wizardDemoData?.demoUsers
    ? wizardDemoData.demoUsers
    : usersData?.users ?? []) as User[];
  const invitations = (isWizardActive && wizardDemoData?.demoInvitations
    ? wizardDemoData.demoInvitations
    : usersData?.invitations ?? []) as Invitation[];
  const currentUserRole = getPriorityItem("user_role") as UserRole | null;
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("viewer");
  const [changingRoleUserId, setChangingRoleUserId] = useState<number | null>(
    null
  );
  const [newRole, setNewRole] = useState<string>("");
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    type?: "danger" | "warning" | "info";
  }>({ isOpen: false, title: "", message: "", onConfirm: () => {} });
  const [alertModal, setAlertModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type?: "error" | "success" | "info";
  }>({ isOpen: false, title: "", message: "" });

  const fetchUsers = async () => {
    await refetchUsers();
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const data = await apiPost({
        path: "/settings/users/invite",
        passedData: { email: inviteEmail, role: inviteRole },
      });

      if (data.error) {
        setAlertModal({ isOpen: true, title: "Invite Failed", message: data.error || "Failed to invite user", type: "error" });
        return;
      }

      setShowInviteModal(false);
      setInviteEmail("");
      setInviteRole("viewer");
      fetchUsers(); // Reload
    } catch (err) {
      console.error("Failed to invite user:", err);
      setAlertModal({ isOpen: true, title: "Invite Failed", message: "Failed to invite user", type: "error" });
    }
  };

  const handleRemoveUser = (userId: number) => {
    setConfirmModal({
      isOpen: true,
      title: "Remove User",
      message: "Are you sure you want to remove this user?",
      type: "danger",
      onConfirm: async () => {
        try {
          const data = await apiDelete({ path: `/settings/users/${userId}` });

          if (data.error) {
            setAlertModal({ isOpen: true, title: "Remove Failed", message: data.error || "Failed to remove user", type: "error" });
            return;
          }

          fetchUsers(); // Reload
        } catch (err) {
          console.error("Failed to remove user:", err);
          setAlertModal({ isOpen: true, title: "Remove Failed", message: "Failed to remove user", type: "error" });
        }
      },
    });
  };

  const handleChangeRole = async (userId: number, role: string) => {
    try {
      const data = await apiPut({
        path: `/settings/users/${userId}/role`,
        passedData: { role },
      });

      if (data.error) {
        setAlertModal({ isOpen: true, title: "Role Change Failed", message: data.error || "Failed to change role", type: "error" });
        return;
      }

      setAlertModal({ isOpen: true, title: "Role Updated", message: "Role updated successfully. The user will need to log in again.", type: "success" });
      setChangingRoleUserId(null);
      fetchUsers(); // Reload
    } catch (err) {
      console.error("Failed to change role:", err);
      setAlertModal({ isOpen: true, title: "Role Change Failed", message: "Failed to change role", type: "error" });
    }
  };

  const handleResendInvite = async (invitationId: number) => {
    try {
      const data = await apiPost({
        path: `/settings/users/invite/${invitationId}/resend`,
        passedData: {},
      });

      if (data.error) {
        setAlertModal({ isOpen: true, title: "Resend Failed", message: data.error || "Failed to resend invitation", type: "error" });
        return;
      }

      setAlertModal({ isOpen: true, title: "Invitation Resent", message: data.message || "Invitation email has been resent", type: "success" });
      fetchUsers();
    } catch (err) {
      console.error("Failed to resend invitation:", err);
      setAlertModal({ isOpen: true, title: "Resend Failed", message: "Failed to resend invitation", type: "error" });
    }
  };

  const canManageRoles = currentUserRole === "admin";
  const canRemoveUsers = currentUserRole === "admin";
  const canInvite =
    currentUserRole === "admin" || currentUserRole === "manager";

  // Available roles for invitation based on current user role
  const availableRoles =
    currentUserRole === "manager"
      ? [
          { value: "viewer", label: "Viewer (Read Only)" },
          { value: "manager", label: "Manager (Can Edit)" },
        ]
      : [
          { value: "viewer", label: "Viewer (Read Only)" },
          { value: "manager", label: "Manager (Can Edit)" },
          { value: "admin", label: "Admin (Full Access)" },
        ];

  if (isLoading)
    return (
      <div className="space-y-8 animate-pulse">
        {/* Header Skeleton */}
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-slate-100 rounded-xl" />
            <div>
              <div className="h-5 w-36 bg-slate-100 rounded mb-2" />
              <div className="h-4 w-56 bg-slate-100 rounded" />
            </div>
          </div>
          <div className="h-10 w-36 bg-slate-100 rounded-xl" />
        </div>

        {/* Table Skeleton */}
        <div className="bg-white rounded-[2.5rem] shadow-premium border border-black/5 overflow-hidden p-8">
          {/* Table Rows */}
          {[...Array(4)].map((_, i) => (
            <div
              key={i}
              className="py-5 border-b border-black/5 grid grid-cols-4 gap-4 items-center last:border-0"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-slate-100 rounded-xl" />
                <div>
                  <div className="h-4 w-28 bg-slate-100 rounded mb-1.5" />
                  <div className="h-3 w-40 bg-slate-100 rounded" />
                </div>
              </div>
              <div className="h-7 w-20 bg-slate-100 rounded-lg" />
              <div className="h-4 w-24 bg-slate-100 rounded" />
              <div className="flex justify-end gap-2">
                <div className="h-4 w-20 bg-slate-100 rounded" />
                <div className="h-4 w-16 bg-slate-100 rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );

  return (
    <div className="space-y-8" data-wizard-target="settings-users">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white rounded-[2.5rem] border border-black/5 p-10 shadow-premium"
      >
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
        {canInvite && (
          <button
            onClick={() => setShowInviteModal(true)}
            className="px-6 py-3 bg-alloro-orange text-white rounded-xl hover:bg-blue-700 transition-colors text-[10px] font-black uppercase tracking-widest flex items-center gap-2 shadow-lg active:scale-95 w-full sm:w-auto justify-center"
          >
            <UserPlus className="w-4 h-4" />
            Invite Member
          </button>
        )}
      </motion.div>

      {/* Users List */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="bg-white rounded-[2.5rem] shadow-premium border border-black/5 overflow-hidden p-4 sm:p-8"
      >
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
                        {user.name
                          ? user.name.charAt(0).toUpperCase()
                          : user.email.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className="text-sm font-black text-alloro-navy tracking-tight">
                          {user.name || "Unknown"}
                        </div>
                        <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">
                          {user.email}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-5">
                    {changingRoleUserId === user.id && canManageRoles ? (
                      <select
                        value={newRole || user.role}
                        onChange={(e) => setNewRole(e.target.value)}
                        className="text-[10px] px-3 py-2 border border-black/10 rounded-xl focus:ring-2 focus:ring-alloro-orange/20 focus:border-alloro-orange outline-none font-bold"
                        autoFocus
                      >
                        <option value="viewer">Viewer</option>
                        <option value="manager">Manager</option>
                        <option value="admin">Admin</option>
                      </select>
                    ) : (
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
                    )}
                  </td>
                  <td className="px-6 py-5 text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5" />
                      {new Date(user.joined_at).toLocaleDateString()}
                    </div>
                  </td>
                  <td className="px-6 sm:px-8 py-5 text-right">
                    <div className="flex justify-end gap-3">
                      {changingRoleUserId === user.id ? (
                        <>
                          <button
                            onClick={() => {
                              if (newRole && newRole !== user.role) {
                                handleChangeRole(user.id, newRole);
                              } else {
                                setChangingRoleUserId(null);
                              }
                            }}
                            className="text-alloro-orange hover:text-blue-700 text-[10px] font-black uppercase tracking-widest"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => {
                              setChangingRoleUserId(null);
                              setNewRole("");
                            }}
                            className="text-slate-400 hover:text-slate-700 text-[10px] font-black uppercase tracking-widest"
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          {canManageRoles && (
                            <button
                              onClick={() => {
                                setChangingRoleUserId(user.id);
                                setNewRole(user.role);
                              }}
                              className="text-alloro-orange hover:text-blue-700 text-[10px] font-black uppercase tracking-widest"
                            >
                              Change Role
                            </button>
                          )}
                          {canRemoveUsers && (
                            <button
                              onClick={() => handleRemoveUser(user.id)}
                              className="text-red-500 hover:text-red-700 text-[10px] font-black uppercase tracking-widest"
                            >
                              Remove
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </motion.div>

      {/* Invitations List */}
      {invitations.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white rounded-[2.5rem] shadow-premium border border-black/5 overflow-hidden p-8"
        >
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
                    {canInvite && (
                      <button
                        onClick={() => handleResendInvite(invite.id)}
                        className="inline-flex items-center gap-1.5 text-alloro-orange hover:text-blue-700 text-[10px] font-black uppercase tracking-widest"
                      >
                        <RefreshCw className="w-3 h-3" />
                        Resend
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </motion.div>
      )}

      {/* Invite Modal */}
      <AnimatePresence>
        {showInviteModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-alloro-navy/60 backdrop-blur-sm"
              onClick={() => setShowInviteModal(false)}
            />

            {/* Modal */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: "spring", duration: 0.3 }}
              className="relative bg-white rounded-[2.5rem] w-full max-w-md shadow-2xl overflow-hidden border border-black/5"
            >
              {/* Header */}
              <div className="flex items-center justify-between p-8 border-b border-black/5">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-alloro-orange/10 rounded-2xl">
                    <UserPlus className="w-5 h-5 text-alloro-orange" />
                  </div>
                  <h3 className="text-lg font-black text-alloro-navy font-heading tracking-tight">
                    Invite Team Member
                  </h3>
                </div>
                <button
                  onClick={() => setShowInviteModal(false)}
                  className="p-2.5 hover:bg-slate-100 rounded-xl transition-colors"
                >
                  <X className="w-5 h-5 text-slate-400" />
                </button>
              </div>

              {/* Form */}
              <form onSubmit={handleInvite} className="p-8">
                <div className="space-y-6">
                  <div>
                    <label className="block text-[10px] font-black text-alloro-navy mb-2 uppercase tracking-widest">
                      Email Address
                    </label>
                    <input
                      type="email"
                      required
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      className="w-full px-4 py-3.5 border border-black/10 rounded-2xl focus:ring-4 focus:ring-alloro-orange/10 focus:border-alloro-orange outline-none transition-all text-alloro-navy font-bold"
                      placeholder="colleague@example.com"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-alloro-navy mb-2 uppercase tracking-widest">
                      Role
                    </label>
                    <div className="relative">
                      <select
                        value={inviteRole}
                        onChange={(e) => setInviteRole(e.target.value)}
                        className="w-full px-4 py-3.5 border border-black/10 rounded-2xl focus:ring-4 focus:ring-alloro-orange/10 focus:border-alloro-orange outline-none transition-all text-alloro-navy font-bold appearance-none bg-white"
                      >
                        {availableRoles.map((role) => (
                          <option key={role.value} value={role.value}>
                            {role.label}
                          </option>
                        ))}
                      </select>
                      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-slate-400">
                        <svg
                          className="h-4 w-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M19 9l-7 7-7-7"
                          />
                        </svg>
                      </div>
                    </div>
                    {currentUserRole === "manager" && (
                      <p className="text-[10px] text-slate-400 mt-2.5 font-bold uppercase tracking-widest">
                        Managers can only invite Viewers and Managers
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex flex-col sm:flex-row justify-end gap-3 mt-8 pt-6 border-t border-black/5">
                  <button
                    type="button"
                    onClick={() => setShowInviteModal(false)}
                    className="px-6 py-3 text-slate-500 hover:bg-slate-100 rounded-xl transition-colors text-[10px] font-black uppercase tracking-widest order-2 sm:order-1"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-6 py-3 bg-alloro-orange text-white rounded-xl hover:bg-blue-700 transition-colors text-[10px] font-black uppercase tracking-widest shadow-lg active:scale-95 order-1 sm:order-2"
                  >
                    Send Invitation
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <ConfirmModal
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
        onConfirm={confirmModal.onConfirm}
        title={confirmModal.title}
        message={confirmModal.message}
        type={confirmModal.type}
        confirmText="Remove"
      />
      <AlertModal
        isOpen={alertModal.isOpen}
        onClose={() => setAlertModal(prev => ({ ...prev, isOpen: false }))}
        title={alertModal.title}
        message={alertModal.message}
        type={alertModal.type}
      />
    </div>
  );
};
