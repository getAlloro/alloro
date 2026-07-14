import type { MonthlyRollupForJob } from "../../../utils/pms/applyColumnMapping";
import type { PmsParsedRow } from "./pmsParserContract";

type MutableRollup = MonthlyRollupForJob[number];

function createMonth(month: string): MutableRollup {
  return {
    month,
    self_referrals: 0,
    doctor_referrals: 0,
    total_referrals: 0,
    actual_production_total: 0,
    attributed_production_total: 0,
    production_total: 0,
    sources: [],
  };
}

export function flattenMonthlyRollup(
  monthlyRollup: MonthlyRollupForJob
): PmsParsedRow[] {
  return monthlyRollup.flatMap((month) =>
    month.sources.map((source) => ({
      source: source.name,
      type: source.inferred_referral_type === "doctor" ? "doctor" : "self",
      referrals: source.referrals,
      production: source.production,
      month: month.month,
    }))
  );
}

export function buildMonthlyRollupFromParsedRows(
  rows: PmsParsedRow[]
): MonthlyRollupForJob {
  const months = new Map<string, MutableRollup>();

  for (const row of rows) {
    const month = months.get(row.month) ?? createMonth(row.month);
    const source = month.sources.find(
      (entry) =>
        entry.name === row.source && entry.inferred_referral_type === row.type
    );

    if (source) {
      source.referrals += row.referrals;
      source.production += row.production;
    } else {
      month.sources.push({
        name: row.source,
        referrals: row.referrals,
        production: row.production,
        inferred_referral_type: row.type,
      });
    }

    if (row.type === "doctor") month.doctor_referrals += row.referrals;
    else month.self_referrals += row.referrals;
    month.total_referrals += row.referrals;
    month.production_total += row.production;
    month.actual_production_total =
      (month.actual_production_total ?? 0) + row.production;
    month.attributed_production_total =
      (month.attributed_production_total ?? 0) + row.production;
    months.set(row.month, month);
  }

  return [...months.values()]
    .map(roundMonth)
    .sort((left, right) => left.month.localeCompare(right.month));
}

export function filterParserResultToMonth<T extends {
  rows: PmsParsedRow[];
  monthlyRollup: MonthlyRollupForJob;
}>(result: T, targetMonth?: string): T {
  if (!targetMonth) return result;
  return {
    ...result,
    rows: result.rows.filter((row) => row.month === targetMonth),
    monthlyRollup: result.monthlyRollup.filter(
      (month) => month.month === targetMonth
    ),
  };
}

function roundMonth(month: MutableRollup): MutableRollup {
  return {
    ...month,
    actual_production_total: Number(
      (month.actual_production_total ?? month.production_total).toFixed(2)
    ),
    attributed_production_total: Number(
      (month.attributed_production_total ?? month.production_total).toFixed(2)
    ),
    production_total: Number(month.production_total.toFixed(2)),
    sources: month.sources.map((source) => ({
      ...source,
      production: Number(source.production.toFixed(2)),
    })),
  };
}
