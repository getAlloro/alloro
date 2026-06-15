/**
 * Identity Warmup — token-conservative text helpers.
 *
 * Pure functions shared across the warmup orchestrator, auto-discovery, and
 * content-distillation modules: HTML cleaning + length capping before content
 * is fed to Claude. No LLM, no DB.
 *
 * Extracted from service.identity-warmup.ts during a behavior-preserving
 * decomposition — logic is identical to the originals.
 */

// Cap applied to cleaned text (post-HTML-strip), not raw HTML. At 100k of
// readable content we have plenty of signal without bloating the JSONB.
export const MAX_SOURCE_CHARS = 100_000;

export function capString(s: string, max: number = MAX_SOURCE_CHARS): string {
  if (!s) return "";
  return s.length > max ? s.slice(0, max) : s;
}

/**
 * Token-conservative cleaner for scraped HTML. Strips scripts, styles, tags,
 * special characters, and URLs before the content is fed to Claude.
 */
export function cleanForClaude(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-zA-Z0-9#]+;/g, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^a-zA-Z0-9.,!?'\-\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
