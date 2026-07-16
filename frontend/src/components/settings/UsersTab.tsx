import { useState } from "react";
import { motion } from "framer-motion";
import { UserPlus, Users as UsersIcon } from "lucide-react";
import type { PendingInvitation, SettingsUser, UserRole } from "../../api/settingsUsers";
import { useIsWizardActive, useWizardDemoData } from "../../contexts/OnboardingWizardContext";
import { useSettingsUserMutations } from "../../hooks/queries/useSettingsUserMutations";
import { useSettingsUsers } from "../../hooks/queries/useSettingsQueries";
import { getPriorityItem } from "../../hooks/useLocalStorage";
import { getErrorMessage } from "../../lib/errorMessage";
import { showErrorToast, showSuccessToast } from "../../lib/toast";
import { ConfirmModal } from "./ConfirmModal";
import { InviteMemberModal } from "./users/InviteMemberModal";
import { PendingInvitationsTable } from "./users/PendingInvitationsTable";
import { TeamMembersTable } from "./users/TeamMembersTable";

export function UsersTab() {
  const isWizardActive = useIsWizardActive();
  const wizardDemoData = useWizardDemoData();
  const { data, isLoading: queryIsLoading } = useSettingsUsers();
  const { inviteUser, updateRole, removeUser, resendInvite } = useSettingsUserMutations();
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [editingUserId, setEditingUserId] = useState<number | null>(null);
  const [stagedRole, setStagedRole] = useState<UserRole>("viewer");
  const [removeTarget, setRemoveTarget] = useState<SettingsUser | null>(null);
  const currentUserRole = getPriorityItem("user_role") as UserRole | null;
  const canManageRoles = currentUserRole === "admin";
  const canRemoveUsers = currentUserRole === "admin";
  const canInvite = currentUserRole === "admin" || currentUserRole === "manager";
  const roleOptions: UserRole[] =
    currentUserRole === "manager"
      ? ["viewer", "manager"]
      : ["viewer", "manager", "admin"];
  const users = (isWizardActive && wizardDemoData?.demoUsers
    ? wizardDemoData.demoUsers
    : data?.users ?? []) as SettingsUser[];
  const invitations = (isWizardActive && wizardDemoData?.demoInvitations
    ? wizardDemoData.demoInvitations
    : data?.invitations ?? []) as PendingInvitation[];

  const handleInvite = async (email: string, role: UserRole) => {
    try {
      const result = await inviteUser.mutateAsync({ email, role });
      showSuccessToast("Invitation sent", result.message || `An invitation was sent to ${email}.`);
      setIsInviteOpen(false);
    } catch (error) {
      showErrorToast("Invite failed", getErrorMessage(error) || "Failed to invite this user.");
      throw error;
    }
  };

  const handleSaveRole = async (user: SettingsUser) => {
    if (stagedRole === user.role) {
      setEditingUserId(null);
      return;
    }
    try {
      const result = await updateRole.mutateAsync({ userId: user.id, role: stagedRole });
      showSuccessToast(
        "Role updated",
        result.message || "The user will need to log in again before the change takes effect.",
      );
      setEditingUserId(null);
    } catch (error) {
      showErrorToast("Role change failed", getErrorMessage(error) || "Failed to change this role.");
    }
  };

  const handleRemove = async () => {
    if (!removeTarget) return;
    try {
      const result = await removeUser.mutateAsync(removeTarget.id);
      showSuccessToast("Team member removed", result.message || `${removeTarget.email} was removed.`);
      setRemoveTarget(null);
    } catch (error) {
      showErrorToast("Remove failed", getErrorMessage(error) || "Failed to remove this user.");
    }
  };

  const handleResend = async (invitationId: number) => {
    try {
      const result = await resendInvite.mutateAsync(invitationId);
      showSuccessToast("Invitation resent", result.message || "The invitation email was sent again.");
    } catch (error) {
      showErrorToast("Resend failed", getErrorMessage(error) || "Failed to resend this invitation.");
    }
  };

  if (!isWizardActive && queryIsLoading) {
    return (
      <div className="animate-pulse space-y-8" aria-label="Loading team members">
        <div className="flex items-center justify-between rounded-[2rem] border border-line-soft bg-alloro-surface p-8">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-xl bg-alloro-navy/5" />
            <div className="space-y-2">
              <div className="h-4 w-36 rounded bg-alloro-navy/5" />
              <div className="h-3 w-56 rounded bg-alloro-navy/5" />
            </div>
          </div>
          <div className="h-10 w-36 rounded-xl bg-alloro-navy/5" />
        </div>
        <div className="overflow-hidden rounded-[2rem] border border-line-soft bg-alloro-surface">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="grid grid-cols-4 gap-6 border-b border-line-soft p-5 last:border-0">
              <div className="h-10 rounded bg-alloro-navy/5" />
              <div className="h-8 rounded bg-alloro-navy/5" />
              <div className="h-5 rounded bg-alloro-navy/5" />
              <div className="h-5 rounded bg-alloro-navy/5" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-wizard-target="settings-users">
      <motion.header
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-start justify-between gap-4 rounded-[2rem] border border-line-soft bg-alloro-surface p-7 shadow-premium sm:flex-row sm:items-center"
      >
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-alloro-orange/10 p-2.5 text-alloro-orange">
            <UsersIcon className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-display text-xl font-medium tracking-tight text-alloro-navy">
              Team Members
            </h2>
            <p className="mt-0.5 text-[9px] font-bold uppercase tracking-[0.14em] text-ink-muted">
              Manage who has access to this organization
            </p>
          </div>
        </div>
        {canInvite && (
          <button
            type="button"
            onClick={() => setIsInviteOpen(true)}
            className="inline-flex w-full items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-alloro-orange px-5 py-3 text-[10px] font-black uppercase tracking-[0.12em] text-white shadow-lg transition hover:bg-alloro-orange/90 focus:outline-none focus:ring-4 focus:ring-alloro-orange/20 sm:w-auto"
          >
            <UserPlus className="h-4 w-4" />
            Invite member
          </button>
        )}
      </motion.header>

      <TeamMembersTable
        users={users}
        canManageRoles={canManageRoles}
        canRemoveUsers={canRemoveUsers}
        editingUserId={editingUserId}
        stagedRole={stagedRole}
        isSavingRole={updateRole.isPending}
        onBeginEdit={(userId, role) => {
          setEditingUserId(userId);
          setStagedRole(role);
        }}
        onRoleChange={setStagedRole}
        onSaveRole={handleSaveRole}
        onCancelEdit={() => setEditingUserId(null)}
        onRemove={setRemoveTarget}
      />
      <PendingInvitationsTable
        invitations={invitations}
        canInvite={canInvite}
        resendingInvitationId={resendInvite.isPending ? resendInvite.variables ?? null : null}
        onResend={handleResend}
      />
      <InviteMemberModal
        isOpen={isInviteOpen}
        roleOptions={roleOptions}
        isManager={currentUserRole === "manager"}
        isSubmitting={inviteUser.isPending}
        onClose={() => setIsInviteOpen(false)}
        onInvite={handleInvite}
      />
      <ConfirmModal
        isOpen={removeTarget !== null}
        isLoading={removeUser.isPending}
        onClose={() => {
          if (!removeUser.isPending) setRemoveTarget(null);
        }}
        onConfirm={() => void handleRemove()}
        title="Remove User"
        message={`Remove ${removeTarget?.name || removeTarget?.email || "this user"} from this organization?`}
        type="danger"
        confirmText="Remove"
      />
    </div>
  );
}
