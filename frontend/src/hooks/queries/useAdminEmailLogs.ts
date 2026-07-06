import { useQuery } from "@tanstack/react-query";
import {
  adminGetEmailLog,
  adminListEmailLogs,
  type EmailLogListData,
  type EmailLogListParams,
} from "../../api/email-logs";
import { QUERY_KEYS } from "../../lib/queryClient";

/**
 * Admin Email Logs queries (plans/07062026-email-logs-dashboard).
 * Triad analog (§12.1): api/email-logs.ts → these hooks → QUERY_KEYS.
 */

const EMAIL_LOGS_STALE_MS = 10_000;

export function useAdminEmailLogs(params: EmailLogListParams = {}) {
  return useQuery<EmailLogListData>({
    queryKey: QUERY_KEYS.adminEmailLogs(params),
    queryFn: () => adminListEmailLogs(params),
    staleTime: EMAIL_LOGS_STALE_MS,
  });
}

export function useAdminEmailLog(id: string | null) {
  return useQuery({
    queryKey: QUERY_KEYS.adminEmailLog(id),
    queryFn: () => adminGetEmailLog(id as string),
    enabled: !!id,
    staleTime: EMAIL_LOGS_STALE_MS,
  });
}
