/**
 * Competitor list validators for the v2 curated-competitor flow.
 *
 * Spec: plans/04282026-no-ticket-practice-ranking-v2-user-curated-competitors/spec.md
 */

export const MAX_COMPETITORS_PER_LOCATION = 10;
export const DEFAULT_COMPETITOR_DISCOVERY_RADIUS_METERS = 40234; // 25 miles
export const COMPETITOR_DISCOVERY_RADIUS_PRESETS_METERS = [
  8047, // 5 miles
  16093, // 10 miles
  24140, // 15 miles
  DEFAULT_COMPETITOR_DISCOVERY_RADIUS_METERS,
  80467, // 50 miles
  160934, // 100 miles
] as const;

export interface ValidationOk {
  valid: true;
}

export interface ValidationError {
  valid: false;
  status: number;
  body: {
    success: false;
    error: string;
    message: string;
  };
}

export type ValidationResult = ValidationOk | ValidationError;

export function validateLocationIdParam(raw: unknown): ValidationResult {
  if (raw === undefined || raw === null || raw === "") {
    return {
      valid: false,
      status: 400,
      body: {
        success: false,
        error: "MISSING_LOCATION_ID",
        message: "locationId path param is required",
      },
    };
  }
  const id = Number(raw);
  if (!Number.isFinite(id) || id <= 0 || !Number.isInteger(id)) {
    return {
      valid: false,
      status: 400,
      body: {
        success: false,
        error: "INVALID_LOCATION_ID",
        message: "locationId must be a positive integer",
      },
    };
  }
  return { valid: true };
}

export function validatePlaceIdInput(raw: unknown): ValidationResult {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return {
      valid: false,
      status: 400,
      body: {
        success: false,
        error: "INVALID_PLACE_ID",
        message: "placeId is required and must be a non-empty string",
      },
    };
  }
  return { valid: true };
}

export function validateUnderCap(currentCount: number): ValidationResult {
  if (currentCount >= MAX_COMPETITORS_PER_LOCATION) {
    return {
      valid: false,
      status: 409,
      body: {
        success: false,
        error: "COMPETITOR_CAP_REACHED",
        message: `Cannot add more than ${MAX_COMPETITORS_PER_LOCATION} competitors per location. Remove one before adding another.`,
      },
    };
  }
  return { valid: true };
}

export interface DiscoveryRadiusValidationOk {
  valid: true;
  radiusMeters: number;
}

export type DiscoveryRadiusValidationResult =
  | DiscoveryRadiusValidationOk
  | ValidationError;

export function validateDiscoveryRadiusMeters(
  raw: unknown,
  fallback: number = DEFAULT_COMPETITOR_DISCOVERY_RADIUS_METERS
): DiscoveryRadiusValidationResult {
  if (raw === undefined || raw === null || raw === "") {
    return { valid: true, radiusMeters: fallback };
  }

  const radiusMeters = Number(raw);
  if (
    !Number.isFinite(radiusMeters) ||
    !Number.isInteger(radiusMeters) ||
    !COMPETITOR_DISCOVERY_RADIUS_PRESETS_METERS.includes(
      radiusMeters as (typeof COMPETITOR_DISCOVERY_RADIUS_PRESETS_METERS)[number]
    )
  ) {
    return {
      valid: false,
      status: 400,
      body: {
        success: false,
        error: "INVALID_DISCOVERY_RADIUS",
        message: "radiusMeters must be one of the supported radius presets.",
      },
    };
  }

  return { valid: true, radiusMeters };
}
