import { Response } from "express";
import logger from "../../../lib/logger";

// Enhanced error handler for OAuth operations
export const formatOAuthError = (
  res: Response,
  error: any,
  operation: string
) => {
  const errorDetails = {
    operation,
    message: error?.message || "Unknown error",
    status: error?.response?.status || error?.status,
    data: error?.response?.data || error?.data,
    stack: error?.stack?.split("\n").slice(0, 3).join("\n"),
  };

  logger.error({ err: errorDetails }, `=== ${operation} Error ===`);

  const statusCode = error?.response?.status || error?.status || 500;
  return res.status(statusCode).json({
    error: `Failed to ${operation.toLowerCase()}`,
    details: process.env.NODE_ENV === "development" ? errorDetails : undefined,
  });
};
