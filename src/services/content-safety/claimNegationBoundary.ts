/**
 * Backward negation-scope boundaries for the generated-copy honesty gate.
 *
 * Extracted from claimNegation.ts under §2.4. This file owns where a preceding
 * negator stops; claimNegation.ts owns whether a claim is negated before or
 * after the match.
 */

/**
 * Words that can open a new independent clause's subject. Bare articles stay
 * excluded because they also open coordinated object-list items.
 */
export const NEW_SUBJECT =
  "(?:we|i|you|he|she|it|they|this|that|these|those|there|our|your|his|her|its|their|alloro|" +
  "which|who|whom|whose|where|everyone|anyone|nobody)";

/**
 * Coordinators and negators across which negation carries instead of stopping.
 */
const NEGATION_CARRYING = "(?:and|or|nor|yet|but|not|never|no|neither|without)";

/** Bounded whitespace keeps the boundary matcher linear on hostile input. */
export const GAP = "\\s{0,8}";

/**
 * Dash used as a clause separator: Unicode dashes, a double hyphen, or a spaced
 * single hyphen. The spacing requirement preserves compound words.
 */
export const DASH_SEPARATOR = `(?:${GAP}(?:\\u2014|\\u2013|\\u2015|\\u2012|\\u2212|--)${GAP}|\\s{1,8}-\\s{1,8})`;

/** Symbols that set off independent blocks of page or metadata copy. */
const SYMBOL_SEPARATOR = `${GAP}[|\\uff5c\\u00a6\\u2022\\u2023\\u25aa\\u25e6\\u2192\\u27f6\\u00bb\\u203a/]{1,8}${GAP}`;

/** Comma forms that can delimit a new clause when followed by a new subject. */
export const COMMA = "[,\\uff0c\\u201a\\u3001]";

/** Line, paragraph, and list-item boundaries. */
export const LINE_BREAK = "[\\n\\r\\u2028\\u2029]";
const PARAGRAPH_BREAK = `${LINE_BREAK}${GAP}${LINE_BREAK}`;
const LIST_MARKER = `${LINE_BREAK}${GAP}(?:[-*\\u2022\\u2023\\u25aa\\u25e6\\u00b7>]{1,8}|\\d{1,9}[.)])${GAP}`;

/**
 * Clause boundaries that end the scope of a preceding negator.
 *
 * Hard boundaries close a clause outright. Soft boundaries require a new
 * subject or block marker so honest shared-auxiliary disclaimers remain intact.
 */
const NEGATION_SCOPE_BOUNDARY = new RegExp(
  [
    "[.!?;:\\u2026]",
    PARAGRAPH_BREAK,
    LIST_MARKER,
    `[\\n\\r\\u2028\\u2029\\t]${GAP}${NEW_SUBJECT}\\b`,
    `\\b(?:while|whilst|although|though|whereas)\\b[^,\\uff0c\\u201a\\u3001.;:!?\\n]*${COMMA}`,
    `(?:^|(?<=[.!?;:\\n]))${GAP}(?:no|without)\\b[^,\\uff0c\\u201a\\u3001.;:!?\\n]*${COMMA}${GAP}(?!${NEGATION_CARRYING}\\b)`,
    "\\b(?:but|however|nevertheless|nonetheless|while|whilst|although|though|whereas|" +
      "instead|rather|conversely|otherwise|regardless|therefore|thus|hence|meanwhile|" +
      "besides|additionally|furthermore|moreover|consequently|accordingly|still|anyway|" +
      "ultimately|because|since)\\b",
    `\\b(?:and|or|yet|so|then|plus)\\s{1,8}${NEW_SUBJECT}\\b`,
    `(?:${COMMA}|\\()${GAP}${NEW_SUBJECT}\\b`,
    `(?:${DASH_SEPARATOR}|${SYMBOL_SEPARATOR})(?!${GAP}${NEGATION_CARRYING}\\b)`,
  ].join("|"),
  "gi",
);

/**
 * Index just past the last negation-scope boundary in `before`, or zero.
 */
export function lastNegationScopeBoundaryEnd(before: string): number {
  const boundary = new RegExp(NEGATION_SCOPE_BOUNDARY.source, NEGATION_SCOPE_BOUNDARY.flags);
  let end = 0;
  let match: RegExpExecArray | null;
  while ((match = boundary.exec(before)) !== null) {
    end = match.index + match[0].length;
    if (match.index === boundary.lastIndex) {
      boundary.lastIndex++;
    }
  }
  return end;
}
