/**
 * Pure data helpers for PMSDataViewer
 * Handles coercion and normalization of raw backend PMS payloads into the
 * MonthEntryForm[] shape consumed by the viewer.
 */

import type { MonthEntryForm, SourceEntryForm } from "./pmsDataTransform";

export const toNumber = (value: unknown): number => {
  if (typeof value === "number" && !Number.isNaN(value)) {
    return value;
  }
  const parsed = Number((value ?? 0) as unknown);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const normaliseMonthEntries = (raw: unknown): MonthEntryForm[] => {
  let dataArray: unknown = raw;

  if (typeof raw === "object" && raw !== null && !Array.isArray(raw)) {
    const container = raw as Record<string, unknown>;
    const nestedData =
      container.data && typeof container.data === "object"
        ? (container.data as Record<string, unknown>)
        : null;
    if (Array.isArray(container.monthly_rollup)) {
      dataArray = container.monthly_rollup;
    } else if (Array.isArray(container.monthlyRollup)) {
      dataArray = container.monthlyRollup;
    } else if (Array.isArray(container.report_data)) {
      dataArray = container.report_data;
    } else if (Array.isArray(container.reportData)) {
      dataArray = container.reportData;
    } else if (Array.isArray(nestedData?.monthly_rollup)) {
      dataArray = nestedData.monthly_rollup;
    } else if (Array.isArray(nestedData?.monthlyRollup)) {
      dataArray = nestedData.monthlyRollup;
    } else if (Array.isArray(nestedData?.report_data)) {
      dataArray = nestedData.report_data;
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
      const sourceRecord = src as Record<string, unknown>;
      return {
        name: String(
          sourceRecord.name ??
            sourceRecord.source ??
            sourceRecord.referring_practice ??
            sourceRecord.referringPractice ??
            ""
        ),
        referrals: toNumber(
          sourceRecord.referrals ??
            sourceRecord.referral_count ??
            sourceRecord.referralCount
        ),
        production: toNumber(
          sourceRecord.production ??
            sourceRecord.production_total ??
            sourceRecord.productionTotal
        ),
        inferred_referral_type: (sourceRecord.inferred_referral_type ??
          sourceRecord.type ??
          sourceRecord.referral_type) as "self" | "doctor" | undefined,
      };
    });
    const monthRecord = monthEntry as Record<string, unknown>;

    return {
      month: String(monthRecord.month ?? ""),
      self_referrals: toNumber(
        monthRecord.self_referrals ?? monthRecord.selfReferrals
      ),
      doctor_referrals: toNumber(
        monthRecord.doctor_referrals ?? monthRecord.doctorReferrals
      ),
      total_referrals: toNumber(
        monthRecord.total_referrals ?? monthRecord.totalReferrals
      ),
      production_total: toNumber(
        monthRecord.production_total ?? monthRecord.productionTotal
      ),
      sources,
    };
  });
};
