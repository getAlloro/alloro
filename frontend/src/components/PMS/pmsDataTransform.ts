/**
 * Data transformation utilities for PMSLatestJobEditor
 * Handles bidirectional conversion between backend and UI formats
 */

import type { MonthBucket, SourceRow, MonthSummary } from "./types";

/**
 * Backend format - same as sent to/from API
 */
export interface SourceEntryForm {
  name: string;
  referrals: number;
  production: number;
  inferred_referral_type?: "self" | "doctor";
}

export interface MonthEntryForm {
  month: string;
  self_referrals: number;
  doctor_referrals: number;
  total_referrals: number;
  production_total: number;
  sources: SourceEntryForm[];
}

/**
 * Transform normalized backend data (MonthEntryForm[]) to UI state (MonthBucket[])
 *
 * ASSUMES: Each source in monthEntry.sources has inferred_referral_type field
 * FALLBACK: If inferred_referral_type is missing, defaults to "self"
 */
export function transformBackendToUI(
  normalizedMonths: MonthEntryForm[],
): MonthBucket[] {
  return normalizedMonths.map((monthEntry, monthIdx) => ({
    id: Date.now() + monthIdx,
    month: monthEntry.month,
    authoritativeTotalReferrals: monthEntry.total_referrals,
    referralTotalMode: "authoritative",
    rows: monthEntry.sources.map((source, srcIdx) => ({
      id: Date.now() + srcIdx,
      source: source.name,
      type:
        (source.inferred_referral_type as "self" | "doctor" | undefined) ||
        "self",
      referrals: String(source.referrals || 0),
      production: String(source.production || 0),
    })),
  }));
}

/**
 * Transform UI state (MonthBucket[]) back to backend format (MonthEntryForm[])
 *
 * Recalculates aggregate totals based on row types and includes
 * the inferred_referral_type in the sources for backend tracking.
 */
export function transformUIToBackend(months: MonthBucket[]): MonthEntryForm[] {
  return months.map((monthBucket) => {
    const selfRows = monthBucket.rows.filter((r) => r.type === "self");
    const doctorRows = monthBucket.rows.filter((r) => r.type === "doctor");

    return {
      month: monthBucket.month,
      self_referrals: selfRows.reduce(
        (sum, r) => sum + (Number(r.referrals) || 0),
        0,
      ),
      doctor_referrals: doctorRows.reduce(
        (sum, r) => sum + (Number(r.referrals) || 0),
        0,
      ),
      total_referrals:
        monthBucket.referralTotalMode === "authoritative" &&
        typeof monthBucket.authoritativeTotalReferrals === "number"
          ? monthBucket.authoritativeTotalReferrals
          : monthBucket.rows.reduce(
              (sum, r) => sum + (Number(r.referrals) || 0),
              0,
            ),
      production_total: monthBucket.rows.reduce(
        (sum, r) => sum + (Number(r.production) || 0),
        0,
      ),
      sources: monthBucket.rows.map((row) => ({
        name: row.source,
        referrals: Number(row.referrals) || 0,
        production: Number(row.production) || 0,
        inferred_referral_type: row.type,
      })),
    };
  });
}

/**
 * Calculate totals for a set of rows
 * Used for real-time summary card updates
 */
export function calculateTotals(
  rows: SourceRow[],
  authoritativeTotalReferrals?: number,
): MonthSummary {
  const selfReferrals = rows
    .filter((r) => r.type === "self")
    .reduce((s, r) => s + (Number(r.referrals) || 0), 0);

  const doctorReferrals = rows
    .filter((r) => r.type === "doctor")
    .reduce((s, r) => s + (Number(r.referrals) || 0), 0);

  const productionTotal = rows.reduce(
    (s, r) => s + (Number(r.production) || 0),
    0,
  );

  return {
    selfReferrals,
    doctorReferrals,
    totalReferrals:
      authoritativeTotalReferrals ?? selfReferrals + doctorReferrals,
    productionTotal,
  };
}

export function invalidateAuthoritativeReferralTotal(
  monthBucket: MonthBucket,
): MonthBucket {
  if (monthBucket.referralTotalMode !== "authoritative") return monthBucket;
  return {
    ...monthBucket,
    authoritativeTotalReferrals: undefined,
    referralTotalMode: "derived",
  };
}

/**
 * Parse YYYY-MM format into numeric year and month
 */
export function parseYm(ym: string): { y: number; m: number } {
  const [y, m] = ym.split("-").map(Number);
  return { y, m };
}

/**
 * Convert numeric year/month into YYYY-MM string format
 */
export function toYm(y: number, m: number): string {
  return `${y}-${String(m).padStart(2, "0")}`;
}

/**
 * Increment/decrement a YYYY-MM date by N months
 * Handles year rollover correctly
 */
export function addMonths(ym: string, delta: number): string {
  const { y, m } = parseYm(ym);
  const totalMonths = y * 12 + (m - 1) + delta;
  const newYear = Math.floor(totalMonths / 12);
  const newMonth = (totalMonths % 12) + 1;
  return toYm(newYear, newMonth);
}

/**
 * Format a number as currency string with thousands separator
 */
export function formatMoney(v: string): string {
  if (v === "") return "";
  return Number(v).toLocaleString();
}

/**
 * Sanitize string input to contain only numeric characters
 */
export function sanitizeNumber(v: string): string {
  return v.replace(/[^0-9]/g, "");
}
