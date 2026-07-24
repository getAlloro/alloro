/**
 * Typed domain error for the owner-receipt domain (§8.3).
 *
 * Carries a machine code so the HTTP status is decided in ONE place
 * (feature-utils/controllerResponses.ts) rather than by scattered res.status()
 * calls. Mirrors proof-receipt/feature-utils/ProofReceiptError.
 */

export type OwnerReceiptErrorCode =
  | "OWNER_RECEIPT_CONTEXT_MISSING"
  | "OWNER_RECEIPT_LOCATION_SCOPE_UNAVAILABLE"
  | "OWNER_RECEIPT_LOCATION_ACCESS_DENIED"
  | "OWNER_RECEIPT_WINDOW_INVALID"
  | "OWNER_RECEIPT_ERROR";

export class OwnerReceiptError extends Error {
  constructor(
    public readonly code: OwnerReceiptErrorCode,
    message: string,
    public readonly details: Record<string, unknown> | null = null
  ) {
    super(message);
    this.name = "OwnerReceiptError";
  }
}
