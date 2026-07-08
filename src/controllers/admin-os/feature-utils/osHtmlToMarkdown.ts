import sanitizeHtml from "sanitize-html";
import TurndownService from "turndown";
import { gfm } from "@joplin/turndown-plugin-gfm";

/**
 * HTML → GitHub-Flavored-Markdown for the OS import pipeline (P6 T2). Ported
 * from alloro-os htmlToMarkdown. mammoth converts a .docx to HTML; this
 * sanitizes it to a strict allowlist (the primary XSS guard for untrusted file
 * content, §5.2) then turns it into markdown with turndown + the gfm plugin.
 */

// Tags we accept from a converted document. Everything else (script/style/
// iframe/…) is dropped — no raw HTML survives into stored markdown (§5.2).
const ALLOWED_TAGS = [
  "h1", "h2", "h3", "h4", "h5", "h6",
  "p", "br", "hr", "blockquote",
  "strong", "b", "em", "i", "u", "s", "strike", "del", "sup", "sub",
  "code", "pre",
  "ul", "ol", "li",
  "a", "img",
  "table", "thead", "tbody", "tfoot", "tr", "th", "td",
];

function isTableRow(line: string): boolean {
  return /^\s*\|.*\|\s*$/.test(line);
}

function isSeparatorRow(line: string): boolean {
  return /^\s*\|(?:\s*:?-{3,}:?\s*\|)+\s*$/.test(line);
}

/**
 * Word tables come through turndown with a delimiter row after EVERY row; a
 * valid GFM table has exactly one, right after the header. Keep the first
 * delimiter in each table block and drop the spurious repeats so the table
 * renders correctly.
 */
function collapseTableSeparators(md: string): string {
  const out: string[] = [];
  let inTable = false;
  let sawSeparator = false;
  for (const line of md.split("\n")) {
    if (!isTableRow(line)) {
      inTable = false;
      sawSeparator = false;
      out.push(line);
      continue;
    }
    if (isSeparatorRow(line)) {
      if (inTable && sawSeparator) continue; // spurious repeat — drop it
      sawSeparator = true;
    }
    inTable = true;
    out.push(line);
  }
  return out.join("\n");
}

/**
 * Sanitize untrusted HTML to the allowlist above, then convert to GFM markdown.
 * Image placeholders (__ALLORO_OS_IMG_…__) are scheme-free, so they read as
 * relative URLs and survive sanitizing to be rewritten later.
 */
export function osHtmlToMarkdown(html: string): string {
  const clean = sanitizeHtml(html, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: {
      a: ["href", "title"],
      img: ["src", "alt", "title"],
      td: ["colspan", "rowspan"],
      th: ["colspan", "rowspan"],
    },
    allowedSchemes: ["http", "https", "mailto"],
    allowedSchemesByTag: { img: ["http", "https"] },
    allowProtocolRelative: false,
    disallowedTagsMode: "discard",
    exclusiveFilter: (frame) => frame.tag === "script" || frame.tag === "style",
  });

  const td = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
    bulletListMarker: "-",
    emDelimiter: "*",
    hr: "---",
  });
  td.use(gfm);
  // Anything not handled above is sanitized away already; keep no raw HTML.
  td.keep([]);
  return collapseTableSeparators(td.turndown(clean).trim());
}
