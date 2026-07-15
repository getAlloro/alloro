/**
 * Answer-first structure lint — Alloro Funnel Engine Slice 1a (get-found).
 *
 * Flags a hosted page that buries the direct answer, skips question-style
 * headings, or hides answer content behind a JS accordion. Reuses cheerio (the
 * same parser identityExtractionService already loads) — no new HTML pipeline.
 *
 * Read-only and advisory: it returns flags, never rewrites. Every flag is a
 * structure/eligibility observation, never a ranking claim.
 */

import * as cheerio from "cheerio";

export type AnswerFirstFlag =
  | "no_question_heading"
  | "answer_not_first"
  | "answer_behind_accordion";

export interface AnswerFirstLintResult {
  flags: AnswerFirstFlag[];
  passed: boolean; // true when no flags
  details: Record<string, unknown>;
}

const QUESTION_WORDS = /\b(what|how|why|when|where|which|who|can|do|does|is|are|should)\b/i;
const MIN_ANSWER_WORDS = 25;

function wordCount(text: string): number {
  const trimmed = text.replace(/\s+/g, " ").trim();
  return trimmed ? trimmed.split(" ").length : 0;
}

export function lintAnswerFirstStructure(html: string): AnswerFirstLintResult {
  const $ = cheerio.load(html);
  const flags: AnswerFirstFlag[] = [];
  const details: Record<string, unknown> = {};

  // 1. Question-style headings — at least one heading phrased as a question.
  const headings = $("h1, h2, h3")
    .map((_, el) => $(el).text().replace(/\s+/g, " ").trim())
    .get()
    .filter(Boolean);
  const hasQuestionHeading = headings.some(
    (h) => h.includes("?") || QUESTION_WORDS.test(h),
  );
  details.headingCount = headings.length;
  details.hasQuestionHeading = hasQuestionHeading;
  if (!hasQuestionHeading) flags.push("no_question_heading");

  // 2. Direct answer first — a substantive paragraph must appear before the
  //    first form/CTA/section break, not be buried below the fold. We look at
  //    the first N paragraphs and require one with >= MIN_ANSWER_WORDS words
  //    before the first <form>.
  const firstFormIndex = $("*").index($("form").first());
  const paragraphs = $("p").toArray();
  let earlyAnswerWords = 0;
  let sawEarlyAnswer = false;
  for (const p of paragraphs.slice(0, 6)) {
    const words = wordCount($(p).text());
    if (words >= MIN_ANSWER_WORDS) {
      sawEarlyAnswer = true;
      earlyAnswerWords = words;
      break;
    }
  }
  details.earlyAnswerWords = earlyAnswerWords;
  details.firstFormIndex = firstFormIndex;
  if (!sawEarlyAnswer) flags.push("answer_not_first");

  // 3. Answer hidden behind a JS accordion — content that a crawler/AI reader
  //    may not see. Bounded selectors: collapsed <details>, aria-expanded=false,
  //    or elements class-tagged accordion/collapse/toggle.
  const accordionSelectors = [
    "details:not([open])",
    "[aria-expanded='false']",
    "[class*='accordion']",
    "[class*='collapse']",
    "[class*='toggle-content']",
  ];
  const accordionCount = accordionSelectors.reduce(
    (sum, sel) => sum + $(sel).length,
    0,
  );
  details.accordionCount = accordionCount;
  if (accordionCount > 0) flags.push("answer_behind_accordion");

  return { flags, passed: flags.length === 0, details };
}
