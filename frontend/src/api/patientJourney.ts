import { apiGet } from "./index";
import type { PatientJourneyResponse } from "../types/patientJourney";

/**
 * Patient Journey Insights — frontend API module.
 *
 * Single network seam for the six-stage funnel screen. Calls `apiGet` from
 * `api/index.ts` only (never raw fetch/axios, §14.2) and returns the typed
 * success-envelope; the `usePatientJourney` hook unwraps `data`.
 *
 * Spec: plans/06242026-patient-journey-insights/spec.html (T6)
 */

export interface GetPatientJourneyParams {
  locationId: number;
  /** Optional reporting period (first day of month, YYYY-MM-01). */
  period?: string;
}

export async function getPatientJourney(
  params: GetPatientJourneyParams,
): Promise<PatientJourneyResponse> {
  const search = new URLSearchParams();
  search.set("locationId", String(params.locationId));
  if (params.period) search.set("period", params.period);
  const query = search.toString();
  return apiGet({
    path: `/patient-journey${query ? `?${query}` : ""}`,
  }) as Promise<PatientJourneyResponse>;
}
