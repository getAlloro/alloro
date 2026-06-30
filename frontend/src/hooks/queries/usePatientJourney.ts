import { useQuery } from "@tanstack/react-query";
import { getPatientJourney } from "../../api/patientJourney";
import type { PatientJourney } from "../../types/patientJourney";

/**
 * usePatientJourney — TanStack Query hook for the Patient Journey funnel
 * payload that powers `/patientJourneyInsights` and the Practice Hub summary
 * card.
 *
 * Keyed by org + location so the screen and the summary card share ONE network
 * request (same queryKey → React Query dedupes). Mirrors `usePmsKeyData`:
 * `enabled` only when both ids are present, the api/ helper's success-envelope
 * is unwrapped here, and a backend failure throws so React Query surfaces it via
 * the single error contract (§16.1).
 *
 * Spec: plans/06242026-patient-journey-insights/spec.html (T6)
 */
async function fetchPatientJourneyInner(
  locationId: number,
  period?: string,
): Promise<PatientJourney | null> {
  const response = await getPatientJourney({ locationId, period });
  if (!response?.success || !response.data) {
    if (response?.error) {
      throw new Error(response.error || "Failed to load patient journey");
    }
    return null;
  }
  return response.data;
}

export function usePatientJourney(
  organizationId: number | null,
  locationId: number | null,
  period?: string,
) {
  return useQuery<PatientJourney | null>({
    queryKey: ["patient-journey", organizationId, locationId, period ?? null],
    queryFn: () => fetchPatientJourneyInner(locationId as number, period),
    enabled: !!organizationId && locationId != null,
    staleTime: 5 * 60 * 1000,
  });
}
