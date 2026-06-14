/**
 * Shortcode Parsing Utilities
 *
 * Pure helpers shared by the per-shortcode resolvers in
 * ../user-website-services/shortcode-resolvers/. Extracted verbatim from
 * shortcodeResolver.service.ts as part of a behavior-preserving
 * decomposition — escaping, regexes, attribute parsing, and the numeric /
 * ordering normalizers that gate post_block + review_block filtering.
 *
 * No DB, no logger, no side effects.
 */

// =====================================================================
// HTML Escaping
// =====================================================================

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// =====================================================================
// Shortcode Parsing
// =====================================================================

export const POST_BLOCK_RE =
  /\{\{\s*post_block\s+((?:[a-z_]+='[^']*'\s*)+)\}\}/g;
export const MENU_RE = /\{\{\s*menu\s+((?:[a-z_]+='[^']*'\s*)+)\}\}/g;
export const REVIEW_BLOCK_RE =
  /\{\{\s*review_block\s+((?:[a-z_]+='[^']*'\s*)+)\}\}/g;

export interface PostBlockShortcode {
  raw: string;
  id: string;
  items: string;
  tags?: string;
  cats?: string;
  ids?: string;
  exc_ids?: string;
  order?: string;
  order_by?: string;
  limit?: string;
  offset?: string;
  paginate?: string;
  per_page?: string;
}

export interface ReviewBlockShortcode {
  raw: string;
  id: string;
  location?: string;
  min_rating?: string;
  limit?: string;
  offset?: string;
  order?: string;
  paginate?: string;
  per_page?: string;
}

export interface MenuShortcode {
  raw: string;
  id: string;
  template?: string;
}

export function parseAttrs(attrStr: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = /([a-z_]+)='([^']*)'/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(attrStr)) !== null) {
    attrs[m[1]] = m[2];
  }
  return attrs;
}

const PAGINATION_MODES = new Set(["load-more", "numbered", "infinite"]);
const POST_ORDER_COLUMNS = new Set([
  "created_at",
  "published_at",
  "sort_order",
  "title",
]);

export function isPaginatedMode(value?: string): boolean {
  return value ? PAGINATION_MODES.has(value) : false;
}

export function parseNonNegativeInt(
  value: string | undefined,
  fallback: number
): number {
  if (value === undefined) return fallback;
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export function parsePositiveInt(
  value: string | undefined,
  fallback: number
): number {
  if (value === undefined) return fallback;
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function getPreviewPerPage(
  perPage: string | undefined,
  limit: string | undefined,
  fallback: number
): number {
  const explicitPerPage = parsePositiveInt(perPage, 0);
  if (explicitPerPage > 0) return clamp(explicitPerPage, 1, 50);

  const limitFallback = parsePositiveInt(limit, 0);
  if (limitFallback > 0) return clamp(limitFallback, 1, 50);

  return fallback;
}

export function getPostOrderColumn(orderBy?: string): string {
  return orderBy && POST_ORDER_COLUMNS.has(orderBy) ? orderBy : "created_at";
}

export function getSortOrder(
  order?: string,
  fallback: "asc" | "desc" = "asc"
): "asc" | "desc" {
  if (order === "asc" || order === "desc") return order;
  return fallback;
}
