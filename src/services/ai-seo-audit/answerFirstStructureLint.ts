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

/** Why the document-order scan stopped before finding a substantive answer. */
export type AnswerFirstBoundary =
  | "form"
  | "cta"
  | "section_break"
  | "next_section"
  | "paragraph_cap"
  | "element_cap";

export interface AnswerFirstLintResult {
  flags: AnswerFirstFlag[];
  passed: boolean; // true when no flags
  details: Record<string, unknown>;
}

const QUESTION_WORDS = /\b(what|how|why|when|where|which|who|can|do|does|is|are|should)\b/i;
const MIN_ANSWER_WORDS = 25;
/** Paragraphs scanned before the answer counts as buried under other copy. */
const MAX_PARAGRAPHS_SCANNED = 6;
/** Elements scanned in document order before the answer counts as far down the page. */
const MAX_ELEMENTS_SCANNED = 60;

/** Site chrome and non-rendered content — never part of the answer-first region. */
const SKIPPED_TAGS = new Set([
  "nav",
  "header",
  "footer",
  "aside",
  "menu",
  "script",
  "style",
  "template",
  "noscript",
  "svg",
  "head",
]);

/** Chrome never supplies the page's candidate answer or question heading. */
const CHROME_SELECTOR = "nav, header, footer, aside, menu";

/**
 * A candidate answer is collapsed only when it sits inside the collapsed
 * subtree. An accordion elsewhere, or an aria-expanded=false navigation trigger,
 * says nothing about the answer itself.
 */
const COLLAPSED_CONTENT_SELECTOR = [
  "details:not([open])",
  "[hidden]",
  "[aria-hidden='true']",
  "[aria-expanded='false']",
  ".collapse:not(.show)",
  ".collapsed",
  ".is-collapsed",
  ".is-hidden",
  ".is-closed",
].join(", ");

/** Bounded CTA class tokens: matches `btn`, `btn-primary`, `cta`, `cta_link`. */
const CTA_CLASS_TOKEN = /^(cta|btn|button)([-_].*)?$/;

/**
 * Minimal structural view of a parsed cheerio/domhandler node. Declared locally
 * so the lint does not depend on cheerio's transitive domhandler types.
 */
interface DomNode {
  type: string;
  data?: string;
  tagName?: string;
  attribs?: Record<string, string>;
  children?: DomNode[];
}

interface AnswerScan {
  found: boolean;
  answerWords: number;
  boundary: AnswerFirstBoundary | null;
  elementsScanned: number;
  paragraphsScanned: number;
}

interface CandidateAnswer {
  words: number;
  collapsedAncestorCount: number;
}

function wordCount(text: string): number {
  const trimmed = text.replace(/\s+/g, " ").trim();
  return trimmed ? trimmed.split(" ").length : 0;
}

function textOf(node: DomNode): string {
  if (node.type === "text") return node.data ?? "";
  return (node.children ?? []).map(textOf).join("");
}

function hasCtaClass(node: DomNode): boolean {
  const cls = node.attribs?.class ?? "";
  if (!cls) return false;
  return cls
    .toLowerCase()
    .split(/\s+/)
    .some((token) => CTA_CLASS_TOKEN.test(token));
}

/**
 * Classify an element as an answer-first boundary. The answer must appear
 * BEFORE the page turns to asking for the action (form/CTA) or moves on to the
 * next section — that is what "answer first" means.
 */
function boundaryOf(node: DomNode): AnswerFirstBoundary | null {
  const tag = node.tagName?.toLowerCase();
  if (tag === "form") return "form";
  if (tag === "hr" || tag === "footer") return "section_break";
  if (tag === "button") return "cta";
  if (tag === "input") {
    const type = (node.attribs?.type ?? "").toLowerCase();
    return type === "submit" || type === "button" ? "cta" : null;
  }
  const role = (node.attribs?.role ?? "").toLowerCase();
  if (role === "form") return "form";
  if (role === "button") return "cta";
  if (hasCtaClass(node)) return "cta";
  return null;
}

/**
 * Walk the body in document order and stop at the first boundary. A page passes
 * only when a substantive paragraph is reached before any boundary — which is
 * precisely the check the previous implementation computed but never applied.
 */
function scanForEarlyAnswer($: cheerio.CheerioAPI): AnswerScan {
  const scan: AnswerScan = {
    found: false,
    answerWords: 0,
    boundary: null,
    elementsScanned: 0,
    paragraphsScanned: 0,
  };
  let topLevelSections = 0;

  // Returns false to halt the whole walk (answer found, or boundary hit).
  function visit(node: DomNode, sectionDepth: number): boolean {
    if (node.type !== "tag") return true;
    const tag = node.tagName?.toLowerCase() ?? "";
    if (SKIPPED_TAGS.has(tag)) return true; // skip the subtree, keep walking

    scan.elementsScanned += 1;
    if (scan.elementsScanned > MAX_ELEMENTS_SCANNED) {
      scan.boundary = "element_cap";
      return false;
    }

    let nextDepth = sectionDepth;
    if (tag === "section" || tag === "article") {
      if (sectionDepth === 0) {
        topLevelSections += 1;
        // The answer region is the FIRST content section; a second top-level
        // section means the page moved on without answering.
        if (topLevelSections > 1) {
          scan.boundary = "next_section";
          return false;
        }
      }
      nextDepth = sectionDepth + 1;
    }

    const boundary = boundaryOf(node);
    if (boundary) {
      scan.boundary = boundary;
      return false;
    }

    if (tag === "p") {
      scan.paragraphsScanned += 1;
      if (scan.paragraphsScanned > MAX_PARAGRAPHS_SCANNED) {
        scan.boundary = "paragraph_cap";
        return false;
      }
      const words = wordCount(textOf(node));
      if (words >= MIN_ANSWER_WORDS) {
        scan.found = true;
        scan.answerWords = words;
        return false;
      }
    }

    for (const child of node.children ?? []) {
      if (!visit(child, nextDepth)) return false;
    }
    return true;
  }

  const body = $("body")[0] as DomNode | undefined;
  const roots: DomNode[] = body?.children ?? ($.root()[0] as DomNode).children ?? [];
  for (const node of roots) {
    if (!visit(node, 0)) break;
  }
  return scan;
}

/**
 * Find the first substantive paragraph that could be the direct answer,
 * independent of the answer-first boundary. This separate pass is required
 * because an accordion trigger may stop the early-answer walk before the
 * paragraph it hides. Chrome is excluded in both directions.
 */
function findCandidateAnswer($: cheerio.CheerioAPI): CandidateAnswer | null {
  const paragraphs = $("p").toArray();
  for (const paragraph of paragraphs) {
    const element = $(paragraph);
    if (element.closest(CHROME_SELECTOR).length > 0) {
      continue;
    }
    const words = wordCount(element.text());
    if (words < MIN_ANSWER_WORDS) {
      continue;
    }
    return {
      words,
      collapsedAncestorCount: element.closest(COLLAPSED_CONTENT_SELECTOR).length,
    };
  }
  return null;
}

export function lintAnswerFirstStructure(html: string): AnswerFirstLintResult {
  const $ = cheerio.load(html);
  const flags: AnswerFirstFlag[] = [];
  const details: Record<string, unknown> = {};

  // 1. Question-style headings — at least one heading phrased as a question.
  const headings = $("h1, h2, h3")
    .filter((_, el) => $(el).closest(CHROME_SELECTOR).length === 0)
    .map((_, el) => $(el).text().replace(/\s+/g, " ").trim())
    .get()
    .filter(Boolean);
  const hasQuestionHeading = headings.some(
    (h) => h.includes("?") || QUESTION_WORDS.test(h),
  );
  details.headingCount = headings.length;
  details.hasQuestionHeading = hasQuestionHeading;
  if (!hasQuestionHeading) flags.push("no_question_heading");

  // 2. Direct answer first — a substantive paragraph must appear in document
  //    order BEFORE the first form/CTA/section boundary, and near the top of
  //    the page. Scanning paragraphs alone let a buried answer pass.
  const scan = scanForEarlyAnswer($);
  details.earlyAnswerWords = scan.answerWords;
  details.boundary = scan.boundary;
  details.elementsScanned = scan.elementsScanned;
  details.paragraphsScanned = scan.paragraphsScanned;
  if (!scan.found) flags.push("answer_not_first");

  // 3. Answer hidden behind collapsed content. The flag belongs to the candidate
  //    answer, not to unrelated accordions or collapsed site navigation.
  const candidateAnswer = findCandidateAnswer($);
  const isAnswerInsideCollapsedContent =
    candidateAnswer !== null && candidateAnswer.collapsedAncestorCount > 0;
  details.answerCandidateWords = candidateAnswer?.words ?? 0;
  details.accordionCount = candidateAnswer?.collapsedAncestorCount ?? 0;
  details.isAnswerInsideCollapsedContent = isAnswerInsideCollapsedContent;
  if (isAnswerInsideCollapsedContent) flags.push("answer_behind_accordion");

  return { flags, passed: flags.length === 0, details };
}
