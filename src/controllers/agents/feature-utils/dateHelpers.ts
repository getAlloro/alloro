/**
 * Date Helpers
 *
 * Pure functions for date formatting, range calculations,
 * and monthly agent scheduling logic.
 */

import { DAILY_TRAILING_WINDOW_DAYS } from "../../../config/dailyAgents";

// PMS data availability flag (always true for now as placeholder)
const MONTH_PMS_DATA_AVAILABLE = true;

export function formatDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

/**
 * Get yesterday and day before yesterday as separate single days
 */
export function getDailyDates(referenceDate?: string): {
  yesterday: string;
  dayBeforeYesterday: string;
} {
  const base = referenceDate ? new Date(referenceDate) : new Date();
  const yesterday = new Date(base);
  yesterday.setDate(yesterday.getDate() - 1);
  const dayBeforeYesterday = new Date(base);
  dayBeforeYesterday.setDate(dayBeforeYesterday.getDate() - 2);

  return {
    yesterday: formatDate(yesterday),
    dayBeforeYesterday: formatDate(dayBeforeYesterday),
  };
}

/**
 * Trailing window of `windowDays` days ending yesterday (inclusive).
 *
 * Sits BESIDE getDailyDates rather than replacing it: getDailyDates still has
 * callers whose shape must not change (blast-radius mitigation, spec T1).
 *
 * The window exists because the GBP Performance API trails several days, so the
 * two most-recent dates are routinely absent from the response. Fetching the
 * window is only half the fix — the caller must then pick the most-recent day
 * that actually carries data (see gbpWindowSelector), never a fixed offset.
 */
export function getDailyTrailingWindow(
  referenceDate?: string,
  windowDays: number = DAILY_TRAILING_WINDOW_DAYS,
): { startDate: string; endDate: string } {
  const base = referenceDate ? new Date(referenceDate) : new Date();
  const end = new Date(base);
  end.setDate(end.getDate() - 1);
  const start = new Date(base);
  // `windowDays` days INCLUSIVE of the end date: 7 days ending yesterday spans
  // reference-7 .. reference-1.
  start.setDate(start.getDate() - windowDays);

  return {
    startDate: formatDate(start),
    endDate: formatDate(end),
  };
}

/**
 * Get previous month date range
 */
export function getPreviousMonthRange(referenceDate?: string): {
  startDate: string;
  endDate: string;
} {
  const now = referenceDate ? new Date(referenceDate) : new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const end = new Date(now.getFullYear(), now.getMonth(), 0);

  return {
    startDate: formatDate(start),
    endDate: formatDate(end),
  };
}

/**
 * Check if we should run monthly agents
 * Conditions: Today is >= 1st of month AND PMS data is available
 */
export function shouldRunMonthlyAgents(referenceDate?: string): boolean {
  const now = referenceDate ? new Date(referenceDate) : new Date();
  const dayOfMonth = now.getDate();

  // Must be 1st or later in the month
  if (dayOfMonth < 1) return false;

  // Check PMS data availability flag
  if (!MONTH_PMS_DATA_AVAILABLE) return false;

  return true;
}

/**
 * Get current month date range (1st of month to today)
 */
export function getCurrentMonthRange(): {
  startDate: string;
  endDate: string;
} {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = now;

  return {
    startDate: formatDate(start),
    endDate: formatDate(end),
  };
}
