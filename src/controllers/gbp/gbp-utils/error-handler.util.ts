import express from "express";
import logger from "../../../lib/logger";

/** Error helper */
export function handleError(res: express.Response, error: any, operation: string) {
  logger.error({ err: error?.response?.data || error?.message || error }, `${operation} Error:`);
  return res
    .status(500)
    .json({ error: `Failed to ${operation.toLowerCase()}` });
}
