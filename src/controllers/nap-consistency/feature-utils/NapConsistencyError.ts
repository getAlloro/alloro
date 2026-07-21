/**
 * Typed domain error for the NAP-consistency read surface (§8.3). Carries a
 * machine code that {@link handleNapError} maps to an HTTP status in one place,
 * so handlers never scatter `res.status()` calls. Mirrors
 * `gbp-automation/feature-utils/GbpAutomationError.ts` (§6.1).
 */
export class NapConsistencyError extends Error {
  constructor(
    public code: string,
    message: string,
    public details: Record<string, unknown> | null = null
  ) {
    super(message);
    this.name = "NapConsistencyError";
  }
}
