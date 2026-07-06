import { apiGet, unwrap } from "./index";

/**
 * Admin Email Logs — API module (plans/07062026-email-logs-dashboard).
 * Rides the shared client in api/index.ts (§12.1, §14.2); types the §8.1
 * envelope payloads and unwraps them via the shared `unwrap` helper (§16.1).
 * Analog: api/admin-os.ts.
 */

export type EmailLogStatus =
  | "queued"
  | "sent"
  | "failed"
  | "delivered"
  | "opened"
  | "bounced"
  | "complained";

export type EmailLogCategory =
  | "auth"
  | "account"
  | "billing"
  | "support"
  | "notification"
  | "leadgen"
  | "website_form"
  | "system"
  | "uncategorized";

/** List row — dates are ISO strings over JSON; body_html omitted from list. */
export interface EmailLogListItem {
  id: string;
  category: EmailLogCategory | string;
  status: EmailLogStatus | string;
  from_email: string | null;
  from_name: string | null;
  recipients: string[];
  cc: string[];
  bcc: string[];
  subject: string | null;
  provider_message_id: string | null;
  intercepted: boolean;
  original_recipients: string[] | null;
  error: string | null;
  created_at: string;
  updated_at: string;
  delivered_at: string | null;
  opened_at: string | null;
}

/** Detail row includes the full rendered HTML body. */
export interface EmailLog extends EmailLogListItem {
  body_html: string | null;
}

export interface EmailLogPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export type EmailLogListParams = {
  category?: string;
  status?: string;
  from?: string;
  to?: string;
  search?: string;
  page?: number;
  limit?: number;
};

export interface EmailLogListData {
  logs: EmailLogListItem[];
  pagination: EmailLogPagination;
}

function buildQuery(params: EmailLogListParams): string {
  const qs = new URLSearchParams();
  if (params.category) qs.set("category", params.category);
  if (params.status) qs.set("status", params.status);
  if (params.from) qs.set("from", params.from);
  if (params.to) qs.set("to", params.to);
  if (params.search) qs.set("search", params.search);
  if (params.page) qs.set("page", String(params.page));
  if (params.limit) qs.set("limit", String(params.limit));
  const s = qs.toString();
  return s ? `?${s}` : "";
}

export async function adminListEmailLogs(
  params: EmailLogListParams = {}
): Promise<EmailLogListData> {
  const res = await apiGet({ path: `/admin/email-logs${buildQuery(params)}` });
  return unwrap<EmailLogListData>(res);
}

export async function adminGetEmailLog(id: string): Promise<{ log: EmailLog }> {
  const res = await apiGet({ path: `/admin/email-logs/${id}` });
  return unwrap<{ log: EmailLog }>(res);
}
