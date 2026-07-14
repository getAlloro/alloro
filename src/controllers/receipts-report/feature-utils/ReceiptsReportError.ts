export type ReceiptsReportErrorCode =
  | "RECEIPTS_REPORT_ORGANIZATION_NOT_FOUND"
  | "RECEIPTS_REPORT_ERROR";

export class ReceiptsReportError extends Error {
  constructor(
    public code: ReceiptsReportErrorCode,
    message: string,
    public details: Record<string, unknown> | null = null
  ) {
    super(message);
  }
}
