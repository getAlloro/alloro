/**
 * Shortcode Resolver — Shared Marker Wrapper
 *
 * Extracted verbatim from shortcodeResolver.service.ts. Every resolved
 * shortcode is wrapped in a marker div so the editor can restore the
 * original shortcode token during section extraction. Shared by the
 * post_block, review_block, and menu resolvers.
 *
 * No DB, no logger, no side effects.
 */

export function wrapResolved(
  originalToken: string,
  resolvedHtml: string
): string {
  const encoded = originalToken
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return `<div data-alloro-shortcode-original="${encoded}" style="pointer-events:none">${resolvedHtml}</div>`;
}
