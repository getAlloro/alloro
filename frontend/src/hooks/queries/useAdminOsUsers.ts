import { useQuery } from "@tanstack/react-query";
import { adminOsListUsers, type AdminOsUser } from "../../api/admin-os";
import { QUERY_KEYS } from "../../lib/queryClient";

const OS_USERS_STALE_TIME_MS = 60_000;

/**
 * Internal Alloro users for OS people-pickers (owner/author — master spec D3).
 * Triad analog (§12.1): api/admin-os.ts → this hook → QUERY_KEYS.adminOsUsers.
 */
export function useAdminOsUsers() {
  return useQuery<AdminOsUser[]>({
    queryKey: QUERY_KEYS.adminOsUsers,
    queryFn: adminOsListUsers,
    staleTime: OS_USERS_STALE_TIME_MS,
  });
}
