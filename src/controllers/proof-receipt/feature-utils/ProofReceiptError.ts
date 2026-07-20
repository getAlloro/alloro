/**
 * Typed domain error for the proof-receipt domain (§8.3).
 *
 * Carries a machine code so the HTTP status is decided in ONE place
 * (feature-utils/controllerResponses.ts) rather than by scattered
 * res.status() calls. Mirrors gbp-automation/feature-utils/GbpAutomationError.
 */

export type ProofReceiptErrorCode =
  | "PROOF_RECEIPT_CONTEXT_MISSING"
  | "PROOF_RECEIPT_LOCATION_SCOPE_UNAVAILABLE"
  | "PROOF_RECEIPT_LOCATION_ACCESS_DENIED"
  | "PROOF_RECEIPT_ERROR";

export class ProofReceiptError extends Error {
  constructor(
    public readonly code: ProofReceiptErrorCode,
    message: string,
    public readonly details: Record<string, unknown> | null = null
  ) {
    super(message);
    this.name = "ProofReceiptError";
  }
}
