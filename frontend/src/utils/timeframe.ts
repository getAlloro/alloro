import { parseYM } from "../components/PMS/dashboard/pmsPeriod";

/**
 * timeframe — the single source of truth for how time is represented across
 * every dashboard surface (the owner's #22 standard): rolling-window durations
 * spelled out ("3 Months", "28 Days", "30 Days") and to-date measures
 * abbreviated (MTD / QTD / YTD). Plus formatDataMonth() — the named-month
 * labeler that resolves the "latest uploaded month" anchor (#23) so no surface
 * ever shows a bare "this month".
 *
 * Spec: plans/06132026-dashboard-timeframe-foundation
 */

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** "2026-04" | "Apr 2026" → "April 2026". Empty when blank; raw key if unparseable. */
export function formatDataMonth(monthKey: string | null | undefined): string {
  if (!monthKey) return "";
  const p = parseYM(monthKey);
  if (!p || p.month < 1 || p.month > 12) return monthKey;
  return `${MONTH_NAMES[p.month - 1]} ${p.year}`;
}

/**
 * "June 2026" for the current calendar month, computed in UTC to match the
 * dashboard-metrics window — the backend bounds it to 1st-of-month..today in
 * UTC (DashboardController), so a live current-month count (e.g. reviews this
 * month) is labeled with the same month the data actually covers.
 */
export function currentMonthLabel(now: Date = new Date()): string {
  return `${MONTH_NAMES[now.getUTCMonth()]} ${now.getUTCFullYear()}`;
}

/**
 * Sortable scalar (YYYYMM) for chronological month ordering — handles both
 * "YYYY-MM" and display-label ("Apr 2026") keys. Mirrors the backend
 * src/utils/pms/monthKey.ts fix; a plain localeCompare misorders labels.
 */
export function monthSortValue(monthKey: string): number {
  const p = parseYM(monthKey);
  return p ? p.year * 100 + p.month : 0;
}

/** To-date measures — abbreviated label + full name for tooltips. */
export const TO_DATE = {
  MTD: { label: "MTD", full: "Month to Date" },
  QTD: { label: "QTD", full: "Quarter to Date" },
  YTD: { label: "YTD", full: "Year to Date" },
} as const;
export type ToDateKey = keyof typeof TO_DATE;

/** Rolling-window durations — spelled out per the standard. */
export const WINDOW_LABELS: Record<string, string> = {
  "28d": "28 Days",
  "30d": "30 Days",
  "90d": "3 Months",
  "3m": "3 Months",
  "6m": "6 Months",
  "12m": "12 Months",
};

/** Spelled-out label for a rolling-window key (falls back to the raw key). */
export function windowLabel(key: string): string {
  return WINDOW_LABELS[key.toLowerCase()] ?? key;
}
