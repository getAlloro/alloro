import { Response } from "express";
import logger from "../../../lib/logger";
import { ReceiptsReportError } from "./ReceiptsReportError";

const RECEIPTS_REPORT_FAILURE_MESSAGE = "Receipts report request failed.";

export interface ReceiptsReportLogContext {
  route: string;
  userId: number | null;
  organizationId: number | null;
}

export function ok(res: Response, data: unknown, status = 200): Response {
  return res.status(status).json({ success: true, data, error: null });
}

function fail(
  res: Response,
  status: number,
  code: string,
  message: string,
  details: unknown = null
): Response {
  return res.status(status).json({
    success: false,
    data: null,
    error: { code, message, details },
  });
}

export function handleReceiptsReportError(
  res: Response,
  error: unknown,
  context: ReceiptsReportLogContext
): Response {
  if (error instanceof ReceiptsReportError) {
    logger.warn(
      { err: error, ...context },
      "[RECEIPTS-REPORT] Request could not be completed"
    );

    if (error.code === "RECEIPTS_REPORT_ORGANIZATION_NOT_FOUND") {
      return fail(res, 404, error.code, error.message, error.details);
    }

    return fail(
      res,
      500,
      error.code,
      RECEIPTS_REPORT_FAILURE_MESSAGE
    );
  }

  logger.error(
    { err: error, ...context },
    "[RECEIPTS-REPORT] Unexpected request failure"
  );
  return fail(
    res,
    500,
    "RECEIPTS_REPORT_ERROR",
    RECEIPTS_REPORT_FAILURE_MESSAGE
  );
}
