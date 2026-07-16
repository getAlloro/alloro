/**
 * Practice Ranking Input Validators
 *
 * Pure validation functions for all practice ranking endpoints.
 * Returns structured validation results, never throws.
 */

// GBP Location interface for type safety
interface GbpLocation {
  accountId: string;
  locationId: string;
  displayName: string;
}

interface ValidationResult {
  valid: boolean;
  error?: {
    success: false;
    error: string;
    message: string;
  };
}

export function validateTriggerRequest(body: any): ValidationResult {
  if (!body.googleAccountId) {
    return {
      valid: false,
      error: {
        success: false,
        error: "MISSING_PARAMS",
        message: "googleAccountId is required",
      },
    };
  }
  return { valid: true };
}

export function validateLocations(
  locations: any[],
  gbpLocations: GbpLocation[] | undefined,
): ValidationResult {
  for (const loc of locations) {
    if (!loc.gbpAccountId || !loc.gbpLocationId || !loc.gbpLocationName) {
      return {
        valid: false,
        error: {
          success: false,
          error: "INVALID_LOCATION",
          message:
            "Each location must have gbpAccountId, gbpLocationId, and gbpLocationName",
        },
      };
    }

    const locationExists = gbpLocations?.some(
      (gbp: GbpLocation) =>
        gbp.locationId === loc.gbpLocationId &&
        gbp.accountId === loc.gbpAccountId,
    );

    if (!locationExists) {
      return {
        valid: false,
        error: {
          success: false,
          error: "LOCATION_NOT_FOUND",
          message: `Location ${loc.gbpLocationId} not found in account`,
        },
      };
    }
  }

  return { valid: true };
}

export function validateRefreshCompetitors(body: {
  specialty?: string;
  location?: string;
}): ValidationResult {
  if (!body.specialty || !body.location) {
    return {
      valid: false,
      error: {
        success: false,
        error: "MISSING_PARAMS",
        message: "specialty and location are required",
      },
    };
  }
  return { valid: true };
}

export function validateWebhookBody(body: any): ValidationResult {
  if (!body.practice_ranking_id) {
    return {
      valid: false,
      error: {
        success: false,
        error: "MISSING_ID",
        message: "practice_ranking_id is required",
      },
    };
  }
  return { valid: true };
}

export function validateRankingId(id: string): ValidationResult {
  const rankingId = parseInt(id);
  if (isNaN(rankingId)) {
    return {
      valid: false,
      error: {
        success: false,
        error: "INVALID_ID",
        message: "Invalid ranking ID",
      },
    };
  }
  return { valid: true };
}
