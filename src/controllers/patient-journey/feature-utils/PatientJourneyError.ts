/**
 * Typed domain error for the Patient Journey domain (§8.2/§8.3). The controller
 * maps `code` to an HTTP status via `handlePatientJourneyError`; the message is
 * client-safe and `details` is an optional structured payload.
 */
export class PatientJourneyError extends Error {
  constructor(
    public code: string,
    message: string,
    public details: Record<string, unknown> | null = null
  ) {
    super(message);
    this.name = "PatientJourneyError";
  }
}
