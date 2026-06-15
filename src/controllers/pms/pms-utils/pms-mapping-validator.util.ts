import type { MonthlyRollupForJob } from "../../../utils/pms/applyColumnMapping";
import type { ColumnMapping } from "../../../types/pmsMapping";

/**
 * Parse + validate a monthly-rollup payload that may arrive as a JSON string
 * or an already-parsed array. Throws a plain `Error` (callers map to 400) when
 * the value is not valid JSON or not a non-empty array of month entries.
 */
export function parseMonthlyRollupPayload(
  value: unknown,
  fieldName: string
): MonthlyRollupForJob {
  let parsed = value;
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      throw new Error(`Invalid ${fieldName} format - must be valid JSON`);
    }
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error(`${fieldName} must be a non-empty array of month entries`);
  }

  return parsed as MonthlyRollupForJob;
}

/**
 * Parse a monthly-rollup payload, returning a discriminated result instead of
 * throwing. Lets a controller branch into a 400 response without a try/catch.
 */
export function tryParseMonthlyRollupPayload(
  value: unknown,
  fieldName: string
):
  | { ok: true; value: MonthlyRollupForJob }
  | { ok: false; error: string } {
  try {
    return { ok: true, value: parseMonthlyRollupPayload(value, fieldName) };
  } catch (parseError) {
    return {
      ok: false,
      error:
        parseError instanceof Error
          ? parseError.message
          : `Invalid ${fieldName} format`,
    };
  }
}

/**
 * Type-narrow a `ColumnMapping`-shaped value coming off the wire.
 * We trust the structural shape (the resolver / applyMapping layer
 * surface their own errors) but require the two non-negotiable fields
 * — `headers` and `assignments` — to be arrays.
 */
export function isColumnMappingShape(value: unknown): value is ColumnMapping {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return Array.isArray(v.headers) && Array.isArray(v.assignments);
}
