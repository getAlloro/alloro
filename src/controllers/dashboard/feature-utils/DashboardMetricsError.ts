export class DashboardMetricsError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details: Record<string, unknown> | null = null
  ) {
    super(message);
    this.name = "DashboardMetricsError";
  }
}
