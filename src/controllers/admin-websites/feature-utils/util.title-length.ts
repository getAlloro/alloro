/**
 * Deterministic title-length trim.
 *
 * Generated titles follow a "Primary Phrase | Location | Brand" pattern
 * (pipe-delimited segments, most-important-first) and a meaningful share run
 * past Google's ~60-character SERP cutoff. Rather than regenerating via the
 * LLM (cost, non-determinism, risk of losing what already works) or blindly
 * truncating mid-word (can cut off the keyword itself), this drops whole
 * trailing segments — least important first — until the title fits, always
 * keeping at least the first segment intact.
 */

const MAX_TITLE_LENGTH = 60;
const SEGMENT_SEPARATOR = " | ";

export interface TitleTrimResult {
  title: string;
  trimmed: boolean;
  /** True when the title is still over the limit after dropping every trailing segment. */
  unresolvable: boolean;
}

/**
 * Trim a title to fit MAX_TITLE_LENGTH by dropping trailing pipe-delimited
 * segments. Returns the original title unchanged (trimmed: false) when it
 * already fits or has no segments to drop. Never touches a title whose first
 * segment alone exceeds the limit — flags it instead of mid-word truncating.
 */
export function trimTitleLength(title: string): TitleTrimResult {
  if (!title || title.length <= MAX_TITLE_LENGTH) {
    return { title, trimmed: false, unresolvable: false };
  }

  const segments = title.split(SEGMENT_SEPARATOR).map((s) => s.trim());
  if (segments.length <= 1) {
    return { title, trimmed: false, unresolvable: true };
  }

  for (let keep = segments.length - 1; keep >= 1; keep--) {
    const candidate = segments.slice(0, keep).join(SEGMENT_SEPARATOR);
    if (candidate.length <= MAX_TITLE_LENGTH) {
      return { title: candidate, trimmed: true, unresolvable: false };
    }
  }

  // Every trailing segment dropped and the first segment alone still exceeds
  // the limit — leave it untouched rather than cut a keyword mid-word.
  return { title: segments[0], trimmed: segments[0] !== title, unresolvable: true };
}
