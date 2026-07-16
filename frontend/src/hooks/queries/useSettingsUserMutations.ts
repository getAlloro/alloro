import { useMutation } from "@tanstack/react-query";
import {
  inviteSettingsUser,
  removeSettingsUser,
  resendSettingsUserInvite,
  updateSettingsUserRole,
  type UserRole,
} from "../../api/settingsUsers";
import { useInvalidateSettingsUsers } from "./useSettingsQueries";

export function useSettingsUserMutations() {
  const { invalidateAll } = useInvalidateSettingsUsers();
  const onSuccess = () => invalidateAll();

  const inviteUser = useMutation({
    mutationFn: ({ email, role }: { email: string; role: UserRole }) =>
      inviteSettingsUser(email, role),
    onSuccess,
  });
  const updateRole = useMutation({
    mutationFn: ({ userId, role }: { userId: number; role: UserRole }) =>
      updateSettingsUserRole(userId, role),
    onSuccess,
  });
  const removeUser = useMutation({
    mutationFn: removeSettingsUser,
    onSuccess,
  });
  const resendInvite = useMutation({
    mutationFn: resendSettingsUserInvite,
    onSuccess,
  });

  return { inviteUser, updateRole, removeUser, resendInvite };
}
