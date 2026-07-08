/**
 * Request-context helpers shared by the admin-os controllers: the acting
 * user id (integer FK to public.users) and the query-string → typed filter
 * parsing for list/search endpoints. Express 5's req.query is a read-only
 * getter, so zod's parsed output cannot be written back — validation rejects
 * bad shapes at the boundary (§11.2) and these helpers do the narrowing.
 */

import { AuthRequest } from "../../../middleware/auth";
import {
  IOsDocumentListFilters,
  IOsDocumentSearchFilters,
  OsDocumentStatus,
} from "../../../models/OsDocumentModel";
import { OsError } from "./OsError";

const OS_DOCUMENT_STATUSES: ReadonlySet<string> = new Set([
  "processing",
  "indexed",
  "archived",
  "processing_failed",
]);

/** Authenticated user id — always present after authenticateToken (§11.1). */
export function osActorId(req: AuthRequest): number {
  const userId = Number(req.user?.userId);
  if (!Number.isInteger(userId) || userId <= 0) {
    throw new OsError(
      "OS_ACTOR_ACCESS_DENIED",
      "Authenticated user context is required."
    );
  }
  return userId;
}

/** First scalar out of an Express query value (string | array | nested). */
export function firstQueryValue(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return undefined;
}

function parseStatus(value: unknown): OsDocumentStatus | undefined {
  const status = firstQueryValue(value);
  return status && OS_DOCUMENT_STATUSES.has(status)
    ? (status as OsDocumentStatus)
    : undefined;
}

function parseIntegerParam(value: unknown): number | undefined {
  const parsed = Number.parseInt(firstQueryValue(value) ?? "", 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

export function parseOsListFilters(
  query: Record<string, unknown>
): IOsDocumentListFilters {
  const filters: IOsDocumentListFilters = {};
  const folderId = firstQueryValue(query.folder_id);
  if (folderId) filters.folderId = folderId;
  const status = parseStatus(query.status);
  if (status) filters.status = status;
  const ownerId = parseIntegerParam(query.owner_id);
  if (ownerId !== undefined) filters.ownerId = ownerId;
  const category = firstQueryValue(query.category);
  if (category) filters.category = category;
  const tag = firstQueryValue(query.tag);
  if (tag) filters.tag = tag;
  return filters;
}

export function parseOsSearchFilters(
  query: Record<string, unknown>
): IOsDocumentSearchFilters {
  const filters: IOsDocumentSearchFilters = {};
  const folderId = firstQueryValue(query.folder_id);
  if (folderId) filters.folderId = folderId;
  const category = firstQueryValue(query.category);
  if (category) filters.category = category;
  const tag = firstQueryValue(query.tag);
  if (tag) filters.tag = tag;
  const ownerId = parseIntegerParam(query.owner_id);
  if (ownerId !== undefined) filters.ownerId = ownerId;
  const status = parseStatus(query.status);
  if (status) filters.status = status;
  return filters;
}
