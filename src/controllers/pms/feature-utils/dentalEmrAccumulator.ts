import type { MonthlyRollupForJob } from "../../../utils/pms/applyColumnMapping";
import {
  normalizeDentalEmrSource,
  parseDentalEmrMonth,
  parseDentalEmrProduction,
} from "./dentalEmrRows";

type SourceBucket = {
  name: string;
  type: "self" | "doctor";
  patients: Set<string>;
  production: number;
};

type MonthBucket = {
  month: string;
  patients: Set<string>;
  sources: Map<string, SourceBucket>;
  production: number;
};

export interface DentalEmrAccumulationResult {
  monthlyRollup: MonthlyRollupForJob;
  warnings: string[];
  qualifyingRowCount: number;
}

export function accumulateDentalEmrRows(
  rows: Record<string, unknown>[],
  targetMonth?: string
): DentalEmrAccumulationResult {
  const months = new Map<string, MonthBucket>();
  let invalidDateCount = 0;
  let blankPatientCount = 0;
  let invalidProductionCount = 0;
  let qualifyingRowCount = 0;

  for (const row of rows) {
    if (String(row.Status ?? "").trim().toLowerCase() !== "done") continue;

    const month = parseDentalEmrMonth(row["Treatment Date"]);
    if (!month) {
      invalidDateCount += 1;
      continue;
    }
    if (targetMonth && month !== targetMonth) continue;

    qualifyingRowCount += 1;
    const monthBucket = months.get(month) ?? createMonthBucket(month);
    const patient = String(row.Patient ?? "").trim();
    const sourceName = normalizeDentalEmrSource(row["Referring Practice"]);
    const source = monthBucket.sources.get(sourceName) ??
      createSourceBucket(sourceName);
    const production = parseDentalEmrProduction(row["Ins. Adj. Fee."]);

    if (!production.isValid) invalidProductionCount += 1;
    if (patient) {
      monthBucket.patients.add(patient);
      source.patients.add(patient);
    } else {
      blankPatientCount += 1;
    }

    source.production += production.value;
    monthBucket.production += production.value;
    monthBucket.sources.set(sourceName, source);
    months.set(month, monthBucket);
  }

  return {
    monthlyRollup: [...months.values()]
      .map(finalizeMonth)
      .sort((left, right) => left.month.localeCompare(right.month)),
    warnings: buildWarnings({
      invalidDateCount,
      blankPatientCount,
      invalidProductionCount,
    }),
    qualifyingRowCount,
  };
}

function createMonthBucket(month: string): MonthBucket {
  return {
    month,
    patients: new Set(),
    sources: new Map(),
    production: 0,
  };
}

function createSourceBucket(name: string): SourceBucket {
  return {
    name,
    type: name === "Self" ? "self" : "doctor",
    patients: new Set(),
    production: 0,
  };
}

function finalizeMonth(bucket: MonthBucket): MonthlyRollupForJob[number] {
  const sources = [...bucket.sources.values()]
    .map((source) => ({
      name: source.name,
      referrals: source.patients.size,
      production: Number(source.production.toFixed(2)),
      inferred_referral_type: source.type,
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
  const selfReferrals = sources
    .filter((source) => source.inferred_referral_type === "self")
    .reduce((sum, source) => sum + source.referrals, 0);
  const doctorReferrals = sources
    .filter((source) => source.inferred_referral_type === "doctor")
    .reduce((sum, source) => sum + source.referrals, 0);
  const production = Number(bucket.production.toFixed(2));

  return {
    month: bucket.month,
    self_referrals: selfReferrals,
    doctor_referrals: doctorReferrals,
    total_referrals: bucket.patients.size,
    actual_production_total: production,
    attributed_production_total: production,
    production_total: production,
    sources,
  };
}

function buildWarnings(counts: {
  invalidDateCount: number;
  blankPatientCount: number;
  invalidProductionCount: number;
}): string[] {
  const warnings: string[] = [];
  if (counts.invalidDateCount > 0) {
    warnings.push(`${counts.invalidDateCount} Done row(s) had an invalid treatment date and were skipped.`);
  }
  if (counts.blankPatientCount > 0) {
    warnings.push(`${counts.blankPatientCount} Done row(s) had no patient and were excluded from referral counts.`);
  }
  if (counts.invalidProductionCount > 0) {
    warnings.push(`${counts.invalidProductionCount} Done row(s) had invalid adjusted insurance production and used 0.`);
  }
  return warnings;
}
