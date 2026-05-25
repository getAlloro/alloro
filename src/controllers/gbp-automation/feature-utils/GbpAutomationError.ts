export class GbpAutomationError extends Error {
  constructor(
    public code: string,
    message: string,
    public details: Record<string, unknown> | null = null
  ) {
    super(message);
  }
}
