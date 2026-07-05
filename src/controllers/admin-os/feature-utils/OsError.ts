/**
 * Typed domain error for the admin OS knowledge base (§8.3).
 * Carries a machine code; osResponses.handleOsError maps code → HTTP status
 * in one place. Shape copied from gbp-automation/feature-utils/GbpAutomationError.
 */
export class OsError extends Error {
  constructor(
    public code: string,
    message: string,
    public details: Record<string, unknown> | null = null
  ) {
    super(message);
  }
}
