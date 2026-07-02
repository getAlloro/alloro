/**
 * Typed domain error for location mutations (create / GBP linking).
 * Carries a machine code so controllers can map error → HTTP status without
 * string-matching messages. Mirrors gbp-automation's GbpAutomationError.
 */

export const LOCATION_ERROR_CODES = {
  GBP_ALREADY_LINKED: "GBP_ALREADY_LINKED",
  NO_GOOGLE_CONNECTION: "NO_GOOGLE_CONNECTION",
  LOCATION_NOT_FOUND: "LOCATION_NOT_FOUND",
  LOCATION_NOT_ACTIVE: "LOCATION_NOT_ACTIVE",
  LOCATION_NOT_REOPENABLE: "LOCATION_NOT_REOPENABLE",
} as const;

export type LocationErrorCode =
  (typeof LOCATION_ERROR_CODES)[keyof typeof LOCATION_ERROR_CODES];

export class LocationError extends Error {
  constructor(
    public code: LocationErrorCode,
    message: string,
    public details: Record<string, unknown> | null = null
  ) {
    super(message);
    this.name = "LocationError";
  }
}
