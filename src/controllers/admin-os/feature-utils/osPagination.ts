/**
 * §11.6 pagination helpers for the admin OS domain — every list endpoint
 * returns the same meta shape { page, limit, total, totalPages }. Kept
 * domain-local per §6.3 so admin OS controllers do not import across domains.
 *
 * Query values are parsed here (not trusted from zod-coerced req.query):
 * Express 5's req.query is a read-only getter, so the validate() middleware
 * cannot write parsed values back — controllers parse the raw strings.
 */

export const OS_PAGE_DEFAULT = 1;
export const OS_LIMIT_DEFAULT = 20;
export const OS_LIMIT_MAX = 100;

export interface OsPaginationParams {
  page: number;
  limit: number;
  offset: number;
}

export interface OsPaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/** Parse + clamp page/limit query strings into safe integers. */
export function parseOsPagination(
  page?: unknown,
  limit?: unknown
): OsPaginationParams {
  const pageParsed = Number.parseInt(String(page ?? ""), 10);
  const limitParsed = Number.parseInt(String(limit ?? ""), 10);
  const safePage =
    Number.isInteger(pageParsed) && pageParsed >= 1 ? pageParsed : OS_PAGE_DEFAULT;
  const safeLimit =
    Number.isInteger(limitParsed) && limitParsed >= 1
      ? Math.min(limitParsed, OS_LIMIT_MAX)
      : OS_LIMIT_DEFAULT;
  return { page: safePage, limit: safeLimit, offset: (safePage - 1) * safeLimit };
}

/** Build the §11.6 meta object from a total count + current params. */
export function buildOsPaginationMeta(
  total: number,
  page: number,
  limit: number
): OsPaginationMeta {
  return { page, limit, total, totalPages: Math.ceil(total / limit) };
}
