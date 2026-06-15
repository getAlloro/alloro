/**
 * Admin Organizations — controller response helpers
 *
 * Pure presentation helpers shared by AdminOrganizationsController handlers.
 * No DB, no business logic — error-shaping and query-param parsing only.
 */

import { Response } from "express";
import { OrganizationListView } from "../../../models/OrganizationModel";
import logger from "../../../lib/logger";

/**
 * Standard 500 error response for admin org endpoints.
 * Preserves the original handleError response shape (success/error/message/timestamp).
 */
export function handleError(
  res: Response,
  error: any,
  operation: string
): Response {
  logger.error({ err: error?.message || error }, `[Admin/Orgs] ${operation} Error:`);
  return res.status(500).json({
    success: false,
    error: `Failed to ${operation.toLowerCase()}`,
    message: error?.message || "Unknown error occurred",
    timestamp: new Date().toISOString(),
  });
}

/**
 * Parse the `view` query param for the organization list endpoint.
 * Defaults to "active"; returns null for any unrecognized value so the
 * caller can emit a 400.
 */
export function parseOrganizationListView(
  value: unknown
): OrganizationListView | null {
  if (value === undefined || value === null || value === "") return "active";
  if (value === "active" || value === "archived" || value === "all") {
    return value;
  }
  return null;
}
