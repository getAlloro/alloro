import type { EmailLogListItem } from "../../../api/email-logs";

/**
 * Email Logs — shared constants + pure helpers (plans/07082026-email-logs-ui-polish).
 * JSX-free so the sibling component files stay fast-refresh clean.
 */

export const CATEGORY_OPTIONS = [
  "auth",
  "account",
  "billing",
  "support",
  "notification",
  "leadgen",
  "website_form",
  "system",
  "uncategorized",
] as const;

export const STATUS_OPTIONS = [
  "queued",
  "sent",
  "failed",
  "delivered",
  "opened",
  "bounced",
  "complained",
] as const;

/** Tailwind classes per status pill — light admin theme. */
export const STATUS_STYLE: Record<string, string> = {
  delivered: "bg-green-100 text-green-800",
  opened: "bg-emerald-100 text-emerald-900",
  sent: "bg-blue-100 text-blue-800",
  queued: "bg-gray-100 text-gray-700",
  failed: "bg-red-100 text-red-800",
  bounced: "bg-red-100 text-red-800",
  complained: "bg-red-100 text-red-800",
};

export const PAGE_SIZE = 25;

/** Tooltip shown on the "opened" status — tracking is unreliable. */
export const OPENED_TOOLTIP = "Open tracking is best-effort (~50% accurate)";

export function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString();
}

/** Short recipient label for the list row: first address, "+N" when several. */
export function recipientLabel(row: EmailLogListItem): string {
  const list =
    row.intercepted && row.original_recipients?.length
      ? row.original_recipients
      : row.recipients;
  if (!list || list.length === 0) return "—";
  return list.length === 1 ? list[0] : `${list[0]} +${list.length - 1}`;
}
