/**
 * Identity Context — slot → template-section stripper.
 *
 * Removes template subtrees tied to skipped slot keys before the markup reaches
 * the AI. Pure function over an HTML string via cheerio: no LLM, no DB.
 */

import * as cheerio from "cheerio";

/**
 * Keyword signatures for each skippable slot. Used by `stripSkippedSlotGroups`
 * when a template subtree is not explicitly annotated with `data-slot-group`.
 *
 * Rule: include the subtree if EITHER its `data-slot-group` attribute matches
 * the slot key, OR its text content contains any of these keywords (case-
 * insensitive). If neither, the subtree is untouched.
 *
 * Annotations win when present. Keywords are the pragmatic fallback until every
 * template page has been annotated via a future data migration.
 */
const SLOT_TO_SECTION_KEYWORDS: Record<string, string[]> = {
  gallery_source_url: ["gallery", "portfolio", "before-after", "before/after", "before & after", "smile gallery"],
  faq_focus_topics: ["faq", "frequently asked", "common questions"],
  certifications_credentials: ["certifications", "credentials", "awards", "board certified", "memberships"],
  unique_value_proposition: [], // baked into hero copy — never safe to strip wholesale
  practice_founding_story: ["our story", "founding story", "how we started", "our history"],
  practice_values: ["our values", "core values", "what we believe"],
  parking_directions: ["parking", "directions", "how to find"],
  insurance_accepted_list: ["insurance", "accepted plans", "payment options"],
};

/**
 * Strip template subtrees tied to skipped slot keys before the markup hits the AI.
 *
 * Resolution order per subtree candidate:
 *   1. `data-slot-group="<key>"` match — strip.
 *   2. Text content contains a keyword from `SLOT_TO_SECTION_KEYWORDS[key]` — strip.
 *   3. Neither — leave alone.
 *
 * Scans direct children of the root `<section>` only. If the entire section
 * body becomes empty, the caller should skip generation for this component.
 */
export function stripSkippedSlotGroups(
  sectionHtml: string,
  skippedSlotKeys: string[],
): { html: string; strippedGroups: string[]; bodyEmpty: boolean } {
  if (!skippedSlotKeys.length) {
    return { html: sectionHtml, strippedGroups: [], bodyEmpty: false };
  }

  const $ = cheerio.load(sectionHtml, { xmlMode: false }, false);
  const root = $("section").first();
  // If there's no root section (fragment templates), walk the top-level wrapper instead.
  const scope = root.length ? root : $.root().children().first();
  if (!scope.length) {
    return { html: sectionHtml, strippedGroups: [], bodyEmpty: false };
  }

  const strippedGroups: string[] = [];

  for (const slotKey of skippedSlotKeys) {
    const keywords = SLOT_TO_SECTION_KEYWORDS[slotKey] || [];
    const annotated = scope.find(`[data-slot-group="${slotKey}"]`);
    if (annotated.length) {
      annotated.remove();
      strippedGroups.push(`${slotKey}:annotation`);
      continue;
    }
    if (!keywords.length) continue;

    // Keyword fallback: remove any direct child whose visible text includes a keyword.
    scope.children().each((_i, el) => {
      const $el = $(el);
      const text = $el.text().toLowerCase();
      for (const kw of keywords) {
        if (text.includes(kw.toLowerCase())) {
          $el.remove();
          strippedGroups.push(`${slotKey}:keyword:${kw}`);
          return;
        }
      }
    });
  }

  const out = $.html(scope);
  const bodyText = cheerio.load(out).root().text().trim();
  return {
    html: out,
    strippedGroups,
    bodyEmpty: bodyText.length === 0 && !/\{\{|\[/.test(out),
  };
}
