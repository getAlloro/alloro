import { apiDelete, apiPost, apiPut, unwrap } from "./index";

export type UserRole = "admin" | "manager" | "viewer";

export type SettingsUser = {
  id: number;
  email: string;
  name: string;
  role: UserRole;
  joined_at: string;
};

export type PendingInvitation = {
  id: number;
  email: string;
  role: UserRole;
  created_at: string;
  expires_at: string;
};

export type SettingsUserMutationResponse = {
  success: true;
  message?: string;
};

export async function inviteSettingsUser(
  email: string,
  role: UserRole,
): Promise<SettingsUserMutationResponse> {
  return unwrap(
    await apiPost({
      path: "/settings/users/invite",
      passedData: { email, role },
    }),
  );
}

export async function updateSettingsUserRole(
  userId: number,
  role: UserRole,
): Promise<SettingsUserMutationResponse> {
  return unwrap(
    await apiPut({
      path: `/settings/users/${userId}/role`,
      passedData: { role },
    }),
  );
}

export async function removeSettingsUser(
  userId: number,
): Promise<SettingsUserMutationResponse> {
  return unwrap(await apiDelete({ path: `/settings/users/${userId}` }));
}

export async function resendSettingsUserInvite(
  invitationId: number,
): Promise<SettingsUserMutationResponse> {
  return unwrap(
    await apiPost({
      path: `/settings/users/invite/${invitationId}/resend`,
      passedData: {},
    }),
  );
}
