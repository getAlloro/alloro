import { extractMonthEntriesFromResponse } from "./pms-normalizer.util";

const DIFFED_MONTH_FIELDS = [
  "self_referrals",
  "doctor_referrals",
  "total_referrals",
  "production_total",
  "actual_production_total",
  "attributed_production_total",
  "sources",
];

export type PmsMonthFieldChange = {
  month: string;
  field: string;
  before: unknown;
  after: unknown;
};

export function diffMonthFields(
  before: unknown,
  after: unknown
): PmsMonthFieldChange[] {
  const beforeByMonth = toMonthMap(before);
  const afterByMonth = toMonthMap(after);
  const months = new Set([...beforeByMonth.keys(), ...afterByMonth.keys()]);
  const changes: PmsMonthFieldChange[] = [];

  for (const month of months) {
    const beforeEntry = beforeByMonth.get(month) ?? {};
    const afterEntry = afterByMonth.get(month) ?? {};

    for (const field of DIFFED_MONTH_FIELDS) {
      const beforeValue = beforeEntry[field] ?? null;
      const afterValue = afterEntry[field] ?? null;
      if (JSON.stringify(beforeValue) !== JSON.stringify(afterValue)) {
        changes.push({ month, field, before: beforeValue, after: afterValue });
      }
    }
  }

  return changes;
}

function toMonthMap(responseLog: unknown) {
  const map = new Map<string, Record<string, unknown>>();
  for (const entry of extractMonthEntriesFromResponse(responseLog)) {
    if (entry.month) map.set(entry.month, entry as Record<string, unknown>);
  }
  return map;
}
