/**
 * Copy normalization — the pass that runs BEFORE the honesty gate matches
 * anything (§6.2 top-level shared service, consumed by both the generated-copy
 * gate and the GBP review-reply gate).
 *
 * WHY THIS EXISTS. Every pattern in the honesty gate is written in ASCII. Copy
 * that a human reads as "guarantee" need not be ASCII "guarantee": it can carry
 * a zero-width space, a soft hyphen, an inline `<b>` tag, an HTML entity, a
 * fullwidth or mathematical letter form, or a Cyrillic homoglyph. Each renders
 * identically and each defeats every ASCII pattern. The answer is NOT more
 * patterns — a pattern set has to be re-widened for every encoding, which is
 * unbounded. It is to fold the encoding away ONCE, here, so the gate sees the
 * text the reader sees.
 *
 * The same pass fixes the mirror failure, which matters more: a boundary the
 * gate cannot see makes an honest disclaimer BLOCK. `"We don't guarantee a
 * higher ranking."` written with the curly apostrophe every LLM and word
 * processor emits was a MEASURED false positive — the negator did not match, so
 * the most honest sentence a practice can publish could not ship. A blocked
 * disclaimer is silent; a missed boast still meets owner approval.
 *
 * DIRECTION OF SAFETY. Two rules govern every choice below:
 *   - An INLINE tag renders to nothing, so it is removed, not spaced. Spacing it
 *     would split a word and MISS a claim.
 *   - An UNKNOWN tag is treated as inline, not as a break. Treating it as a
 *     break could cut a negator off from the claim it governs and over-block an
 *     honest disclaimer, which is the worse failure.
 *
 * NOT EXHAUSTIVE, and cannot be. Normalization closes the encodings a renderer
 * treats as equivalent. It does not close a claim written in words the gate has
 * no pattern for. See the residuals on GeneratedCopySafetyService.
 */

/**
 * `<br>` renders as ONE line break, so it becomes one — NOT a paragraph break.
 *
 * The distinction is load-bearing and was a MEASURED over-block when this file
 * first mapped `<br>` to a paragraph break. The gate treats a paragraph break as
 * a HARD clause end but a lone line break as a soft wrap, precisely because "we
 * do not\nguarantee a higher ranking" is one negated verb phrase. `<br>` IS the
 * HTML soft wrap, so mapping it to `\n\n` cut the negator off its claim and
 * blocked the disclaimer.
 *
 * Mapping it to `\n` still ends the scope where it should: the boundary set
 * already treats a line break FOLLOWED BY A NEW SUBJECT as a clause end, so
 * "…claims<br>We guarantee…" splits (new subject "We") while "we do not<br>
 * guarantee…" does not (no new subject). One rule, both cases, no over-block.
 */
const LINE_BREAK_TAGS = new Set(["br"]);

/**
 * Tags that render as a visible break between two BLOCKS of copy. Unlike `<br>`,
 * these are paragraph-level, so they become a paragraph break — the hard clause
 * end the negation-scope boundary already recognizes.
 */
const BREAK_TAGS = new Set([
  "p",
  "div",
  "li",
  "ul",
  "ol",
  "dl",
  "dt",
  "dd",
  "tr",
  "td",
  "th",
  "table",
  "thead",
  "tbody",
  "tfoot",
  "caption",
  "colgroup",
  "section",
  "article",
  "header",
  "footer",
  "main",
  "aside",
  "nav",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "blockquote",
  "hr",
  "pre",
  "figure",
  "figcaption",
  "form",
  "fieldset",
  "legend",
  "address",
  "details",
  "summary",
  "dialog",
  "hgroup",
  "menu",
  "body",
  "html",
  "head",
  "title",
]);

/** `<script>`/`<style>` render as nothing at all — element AND content. */
const SCRIPT_OR_STYLE_ELEMENT = /<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;

/** An HTML comment renders as nothing. */
const HTML_COMMENT = /<!--[\s\S]*?-->/g;

/** Any HTML tag. The tag NAME decides whether it breaks a clause or vanishes. */
const HTML_TAG = /<\/?([a-zA-Z][a-zA-Z0-9-]*)\b[^>]*>/g;

/** A paragraph break — what the negation-scope boundary reads as a hard end. */
const RENDERED_BREAK = "\n\n";

/** A single rendered line break — a soft wrap, not a hard clause end. */
const RENDERED_LINE_BREAK = "\n";

/**
 * Named HTML entities worth decoding. Bounded deliberately: this is the set that
 * appears in generated copy, not the full HTML5 table (§4.4 — no dependency for
 * one helper).
 */
const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ensp: " ",
  emsp: " ",
  thinsp: " ",
  hairsp: " ",
  shy: "\u00AD",
  zwj: "\u200D",
  zwnj: "\u200C",
  lrm: "\u200E",
  rlm: "\u200F",
  hellip: "…",
  mdash: "—",
  ndash: "–",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
  sbquo: "‚",
  bull: "•",
  middot: "·",
  laquo: "«",
  raquo: "»",
  lsaquo: "‹",
  rsaquo: "›",
  minus: "−",
  times: "×",
  copy: "©",
  reg: "®",
  trade: "™",
  deg: "°",
  period: ".",
  excl: "!",
  quest: "?",
  semi: ";",
  colon: ":",
  comma: ",",
  sol: "/",
  verbar: "|",
  num: "#",
  lpar: "(",
  rpar: ")",
};

/** A numeric (decimal or hex) or named entity reference. */
const HTML_ENTITY = /&(#[xX][0-9a-fA-F]{1,6}|#\d{1,7}|[a-zA-Z][a-zA-Z0-9]{1,31});/g;

/** The highest valid Unicode code point. */
const MAX_CODE_POINT = 0x10ffff;
/** The UTF-16 surrogate range — never a standalone character. */
const SURROGATE_START = 0xd800;
const SURROGATE_END = 0xdfff;

/**
 * Characters that render as NOTHING but sit inside a word and break an ASCII
 * pattern: the zero-width set, the soft hyphen, the word joiner, the BOM (all
 * Unicode category Cf), plus the variation selectors and the combining grapheme
 * joiner (category Mn). Bidi controls are also Cf, but both service callers MUST
 * reject them through hasUnsafeBidiControl before this normalization removes
 * them: directional overrides and isolates can reorder what a reader sees, so
 * stripping them does not safely recover display order.
 */
const INVISIBLE_FORMATTING = /[\p{Cf}\u034F\uFE00-\uFE0F]/gu;

/**
 * Confusable letters that a reader cannot distinguish from ASCII Latin. Folded
 * to their Latin skeleton so a homoglyph cannot carry a claim past an ASCII
 * pattern.
 *
 * The fullwidth, mathematical, circled, and ligature letter forms are NOT here —
 * NFKC already folds every one of them, which is most of this space for free.
 * What NFKC does not touch is a letter that merely LOOKS Latin; those are
 * enumerated here: Latin Extended/IPA, Cyrillic, Greek, Armenian, and Cherokee.
 *
 * NOT the full Unicode confusables table, which runs to thousands of entries and
 * would be a dependency rather than a helper (§4.4). The scripts above were
 * chosen because each was CONFIRMED reachable against this fold — an adversary
 * carried claims through Latin-IPA, Armenian and Cherokee when only Cyrillic and
 * Greek were folded. RESIDUAL, named rather than papered over: a confusable from
 * a script not listed here still passes. This is a conservative filter, not a
 * proof, and a determined adversary has more alphabets than this map has rows.
 *
 * Folding cannot realistically over-block: a false positive would need genuine
 * text in one of these scripts that folds into an English ranking claim.
 */
const CONFUSABLE_TO_LATIN: Record<string, string> = {
  // Cyrillic lowercase.
  "а": "a",
  "е": "e",
  "о": "o",
  "р": "p",
  "с": "c",
  "у": "y",
  "х": "x",
  "ѕ": "s",
  "і": "i",
  "ј": "j",
  "һ": "h",
  "қ": "k",
  "ԛ": "q",
  "ԝ": "w",
  "м": "m",
  "н": "h",
  "т": "t",
  "в": "b",
  "г": "r",
  // Cyrillic uppercase.
  "А": "A",
  "В": "B",
  "Е": "E",
  "К": "K",
  "М": "M",
  "Н": "H",
  "О": "O",
  "Р": "P",
  "С": "C",
  "Т": "T",
  "У": "Y",
  "Х": "X",
  "Ѕ": "S",
  "І": "I",
  "Ј": "J",
  "Ү": "Y",
  "Ԛ": "Q",
  "Ԝ": "W",
  // Greek lowercase.
  "ο": "o",
  "α": "a",
  "ε": "e",
  "ρ": "p",
  "ν": "v",
  "υ": "u",
  "ι": "i",
  "κ": "k",
  "τ": "t",
  "χ": "x",
  "γ": "y",
  // Greek uppercase.
  "Α": "A",
  "Β": "B",
  "Ε": "E",
  "Ζ": "Z",
  "Η": "H",
  "Ι": "I",
  "Κ": "K",
  "Μ": "M",
  "Ν": "N",
  "Ο": "O",
  "Ρ": "P",
  "Τ": "T",
  "Υ": "Y",
  "Χ": "X",
  // Latin Extended / IPA. These are the most reachable of all the non-ASCII
  // Latin look-alikes — they sit in ordinary IPA keyboard layouts and well
  // inside a language model's output space, so they are folded despite not being
  // another script.
  "ɡ": "g",
  "ɑ": "a",
  "ɒ": "a",
  "ı": "i",
  "ɩ": "i",
  "ɪ": "i",
  "ɔ": "c",
  "ɛ": "e",
  "ʏ": "y",
  "ʙ": "b",
  "ʜ": "h",
  "ᴋ": "k",
  "ᴍ": "m",
  "ɴ": "n",
  "ᴏ": "o",
  "ᴘ": "p",
  "ʀ": "r",
  "ᴛ": "t",
  "ᴜ": "u",
  "ᴠ": "v",
  "ᴡ": "w",
  "ᴢ": "z",
  "ǀ": "l",
  "‐": "-",
  "‑": "-",
  // Armenian. Confirmed reachable by an adversary against this fold.
  "ո": "n",
  "ա": "w",
  "ս": "u",
  "օ": "o",
  "հ": "h",
  "ց": "g",
  "ք": "p",
  "յ": "j",
  "ր": "r",
  "Օ": "O",
  "Տ": "S",
  "Ց": "G",
  "Ի": "I",
  "Լ": "L",
  // Cherokee.
  "Ꭺ": "A",
  "Ꭼ": "E",
  "Ꮋ": "H",
  "Ꮖ": "P",
  "Ꮮ": "L",
  "Ꮯ": "C",
  "Ꮢ": "R",
  "Ꮪ": "S",
  "Ꮤ": "W",
  "Ꮩ": "V",
  "Ꮕ": "Z",
  "Ꮏ": "t",
  "Ᏸ": "B",
  "Ꮐ": "G",
  "Ꮶ": "K",
  "Ꮷ": "J",
};

/**
 * Every key must be a SINGLE character: the keys are joined into one character
 * class, so a multi-character key would silently corrupt it. Asserted at module
 * load rather than trusted — this map is the part of the file most likely to be
 * appended to by hand.
 */
const MULTI_CHARACTER_CONFUSABLE = Object.keys(CONFUSABLE_TO_LATIN).find((key) => [...key].length !== 1);
if (MULTI_CHARACTER_CONFUSABLE !== undefined) {
  throw new Error(
    `CONFUSABLE_TO_LATIN keys must be single characters; received ${JSON.stringify(MULTI_CHARACTER_CONFUSABLE)}.`,
  );
}

const CONFUSABLE_PATTERN = new RegExp(`[${Object.keys(CONFUSABLE_TO_LATIN).join("")}]`, "g");

/**
 * Apostrophes and quotation marks that NFKC leaves alone. The apostrophe fold is
 * the one that matters: the negator inventory spells `don't` with an ASCII
 * apostrophe, and generated copy spells it with U+2019, so without this fold an
 * honest disclaimer's negator silently fails to match and the disclaimer BLOCKS.
 */
const APOSTROPHE_VARIANTS = /[‘’‛ʼʹʻ´`′＇]/g;
const QUOTE_VARIANTS = /[“”‟″«»＂]/g;

/**
 * A sentence terminator from any script — `。`, `।`, `۔`, `؟` and the rest.
 * Matched by the Unicode SENTENCE_TERMINAL property rather than by an
 * enumerated list, so the class is covered rather than the examples. Restricted
 * to non-ASCII because the ASCII terminators are already the gate's boundary
 * set, and folded to `.` so they reuse that verified boundary rather than
 * growing a parallel one.
 *
 * Sentence_Terminal deliberately EXCLUDES the comma forms (`、`, `，`), which is
 * exactly right: the gate treats a bare comma as NOT a clause end, because an
 * honest disclaimer coordinates its object list with commas.
 */
const NON_ASCII_SENTENCE_TERMINAL = /(?![\x00-\x7f])\p{Sentence_Terminal}/gu;

/** Decode one HTML entity reference. Returns the source text when invalid. */
function decodeEntity(source: string, body: string): string {
  if (body.startsWith("#")) {
    const isHex = body[1] === "x" || body[1] === "X";
    const codePoint = Number.parseInt(isHex ? body.slice(2) : body.slice(1), isHex ? 16 : 10);
    if (!Number.isFinite(codePoint) || codePoint < 0 || codePoint > MAX_CODE_POINT) {
      return source;
    }
    if (codePoint >= SURROGATE_START && codePoint <= SURROGATE_END) {
      return source;
    }
    return String.fromCodePoint(codePoint);
  }
  const named = NAMED_ENTITIES[body.toLowerCase()];
  return named === undefined ? source : named;
}

/**
 * Bidi formatting controls can reorder visible text. Stripping them before
 * matching is unsafe because the remaining logical-order string may not be what
 * a reader saw. Reject the entire Bidi_Control Unicode property as a class,
 * including entity-encoded controls after the same single decode a browser gives
 * generated copy.
 */
const UNSAFE_BIDI_CONTROL = /\p{Bidi_Control}/u;

export function hasUnsafeBidiControl(text: string): boolean {
  const decoded = text.replace(HTML_ENTITY, decodeEntity);
  return UNSAFE_BIDI_CONTROL.test(decoded);
}

/**
 * Fold generated copy to the text a reader actually sees, so the honesty gate's
 * ASCII patterns match what is on the page rather than one encoding of it.
 *
 * Idempotent, and ORDER-SENSITIVE:
 *   1. `<script>`/`<style>` elements and comments — they render as nothing.
 *   2. HTML tags — a break tag becomes a paragraph break, any other tag is
 *      removed. BEFORE entity decoding on purpose: `&lt;br&gt;` renders as the
 *      literal text "<br>", not as a line break, so it must not become one.
 *   3. HTML entities — a single pass. Never re-run: double decoding would let
 *      `&amp;lt;` become a tag, which is its own bypass.
 *   4. Invisible formatting characters — removed, after callers have rejected
 *      bidi controls, so an entity-encoded zero-width space is caught too.
 *   5. NFKC — folds fullwidth, mathematical, circled, ligature, and superscript
 *      letter forms, the non-breaking space, and `；`/`！`/`？` to ASCII.
 *   6. Cross-script confusables, apostrophes, quotes — what NFKC leaves behind.
 *   7. Non-ASCII sentence terminators — folded to `.`.
 */
export function normalizeForMatching(text: string): string {
  if (!text) {
    return "";
  }
  const withoutHiddenElements = text.replace(SCRIPT_OR_STYLE_ELEMENT, "").replace(HTML_COMMENT, "");
  const withoutTags = withoutHiddenElements.replace(HTML_TAG, (tag, name: string) => {
    const tagName = name.toLowerCase();
    if (LINE_BREAK_TAGS.has(tagName)) {
      return RENDERED_LINE_BREAK;
    }
    return BREAK_TAGS.has(tagName) ? RENDERED_BREAK : "";
  });
  const decoded = withoutTags.replace(HTML_ENTITY, decodeEntity);
  const visible = decoded.replace(INVISIBLE_FORMATTING, "");
  const composed = visible.normalize("NFKC");
  return composed
    .replace(CONFUSABLE_PATTERN, (character) => CONFUSABLE_TO_LATIN[character] ?? character)
    .replace(APOSTROPHE_VARIANTS, "'")
    .replace(QUOTE_VARIANTS, '"')
    .replace(NON_ASCII_SENTENCE_TERMINAL, ".");
}
