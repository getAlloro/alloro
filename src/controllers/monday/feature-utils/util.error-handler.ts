import type { Response } from "express";
import logger from "../../../lib/logger";

/**
 * Standardized error handler for Monday.com endpoints.
 * Preserves the original error logging and 500 response shape.
 */
export function handleError(
  res: Response,
  error: any,
  operation: string
): Response {
  logger.error({ err: error?.response?.data || error?.message || error }, `Monday.com ${operation} Error:`);
  return res
    .status(500)
    .json({ error: `Failed to ${operation.toLowerCase()}` });
}
