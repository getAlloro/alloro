/**
 * Pure helpers and shared constants for PMSLatestJobEditor.
 * Moved verbatim from PMSLatestJobEditor.tsx during decomposition.
 * No React, no hooks — pure data coercion plus presentational color tokens.
 */

import {
  type MonthEntryForm,
  type SourceEntryForm,
} from "./pmsDataTransform";

export const ALORO_ORANGE = "#C9765E";
export const ALORO_ORANGE_DARK = "#D66853";

export const toNumber = (value: unknown): number => {
  if (typeof value === "number" && !Number.isNaN(value)) {
    return value;
  }
  const parsed = Number((value ?? 0) as unknown);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const normaliseMonthEntries = (raw: unknown): MonthEntryForm[] => {
  let dataArray: unknown = raw;

  // Handle new canonical structure with monthly_rollup
  if (typeof raw === "object" && raw !== null && !Array.isArray(raw)) {
    const container = raw as Record<string, unknown>;

    // Check for monthly_rollup (canonical format)
    if (Array.isArray(container.monthly_rollup)) {
      dataArray = container.monthly_rollup;
    }
    // Fallback to report_data (legacy format)
    else if (Array.isArray(container.report_data)) {
      dataArray = container.report_data;
    }
  }

  if (!Array.isArray(dataArray)) {
    return [];
  }

  return dataArray.map((entry) => {
    const monthEntry = typeof entry === "object" && entry !== null ? entry : {};
    const sourcesRaw = Array.isArray(
      (monthEntry as Record<string, unknown>).sources
    )
      ? ((monthEntry as Record<string, unknown>).sources as unknown[])
      : [];

    const sources: SourceEntryForm[] = sourcesRaw.map((source) => {
      const src = typeof source === "object" && source !== null ? source : {};
      return {
        name: String((src as Record<string, unknown>).name ?? ""),
        referrals: toNumber((src as Record<string, unknown>).referrals),
        production: toNumber((src as Record<string, unknown>).production),
        inferred_referral_type: (src as Record<string, unknown>)
          .inferred_referral_type as "self" | "doctor" | undefined,
      };
    });

    return {
      month: String((monthEntry as Record<string, unknown>).month ?? ""),
      self_referrals: toNumber(
        (monthEntry as Record<string, unknown>).self_referrals
      ),
      doctor_referrals: toNumber(
        (monthEntry as Record<string, unknown>).doctor_referrals
      ),
      total_referrals: toNumber(
        (monthEntry as Record<string, unknown>).total_referrals
      ),
      production_total: toNumber(
        (monthEntry as Record<string, unknown>).production_total
      ),
      sources,
    };
  });
};
