import { Response } from "express";
import logger from "../../../lib/logger";

export function handleSettingsError(
  res: Response,
  error: any,
  operation: string
): Response {
  logger.error({ err: error?.message || error }, `[Settings] ${operation} Error:`);

  const statusCode = error?.statusCode || 500;

  if (statusCode === 500) {
    return res.status(500).json({
      success: false,
      error: `Failed to ${operation.toLowerCase()}`,
      message: error?.message || "Unknown error occurred",
      timestamp: new Date().toISOString(),
    });
  }

  return res.status(statusCode).json(error.body || { error: error.message });
}
