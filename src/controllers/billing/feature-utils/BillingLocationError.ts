/**
 * Typed domain error for the location-billing flows (quote / purchase / sync).
 *
 * Carries a machine code so the controller can map error → HTTP status in one
 * place (see controllerResponses.handleBillingLocationError). Mirrors
 * gbp-automation/feature-utils/GbpAutomationError.
 */

export const BILLING_LOCATION_ERROR_CODES = {
  ORG_NOT_FOUND: "ORG_NOT_FOUND",
  NO_GOOGLE_CONNECTION: "NO_GOOGLE_CONNECTION",
  GBP_ALREADY_LINKED: "GBP_ALREADY_LINKED",
  PAYMENT_FAILED: "PAYMENT_FAILED",
  NO_PAYMENT_METHOD: "NO_PAYMENT_METHOD",
  QUOTE_STALE: "QUOTE_STALE",
  BILLING_OBJECTS_UNAVAILABLE: "BILLING_OBJECTS_UNAVAILABLE",
  LOCATION_BILLING_ERROR: "LOCATION_BILLING_ERROR",
} as const;

export type BillingLocationErrorCode =
  (typeof BILLING_LOCATION_ERROR_CODES)[keyof typeof BILLING_LOCATION_ERROR_CODES];

export class BillingLocationError extends Error {
  constructor(
    public code: BillingLocationErrorCode,
    message: string,
    public details: Record<string, unknown> | null = null
  ) {
    super(message);
    this.name = "BillingLocationError";
  }
}
