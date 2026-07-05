import { apiGet } from "./index";

/**
 * Admin OS knowledge base — API module (plans/07042026-alloro-os-admin-port).
 * All requests ride the shared client in api/index.ts (§12.1, §14.2); this
 * file only types and unwraps the §8.1 envelope. Analog: admin-mission-control.ts.
 */

export type AdminOsPingData = {
  pong: boolean;
  timestamp: string;
};

export type AdminOsUser = {
  id: number;
  email: string;
  name: string;
};

type ApiEnvelope<T> = {
  success: boolean;
  data: T | null;
  error: { code?: string; message?: string } | null;
};

export async function adminOsPing(): Promise<AdminOsPingData> {
  const response: ApiEnvelope<AdminOsPingData> = await apiGet({
    path: "/admin/os/ping",
  });

  if (!response.success || !response.data) {
    throw new Error(
      response.error?.message || "Failed to reach the OS knowledge base",
    );
  }

  return response.data;
}

export async function adminOsListUsers(): Promise<AdminOsUser[]> {
  const response: ApiEnvelope<{ users: AdminOsUser[] }> = await apiGet({
    path: "/admin/os/users",
  });

  if (!response.success || !response.data) {
    throw new Error(response.error?.message || "Failed to load OS users");
  }

  return response.data.users;
}
