/**
 * Deterministic slug helper for OS document titles (§4.2 — one helper, no
 * magic). Ported verbatim from alloro-os/backend/src/utils/slug.ts.
 * Collision suffixing lives in OsDocumentService (it needs DB reads).
 */

/** Fallback when a title slugifies to nothing (e.g. "!!!"). */
export const OS_SLUG_FALLBACK = "untitled";

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/** slugify() that never returns an empty string. */
export function slugifyTitle(title: string): string {
  return slugify(title) || OS_SLUG_FALLBACK;
}
