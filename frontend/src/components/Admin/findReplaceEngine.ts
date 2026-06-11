/**
 * Pure scan/apply logic for the admin site-wide Find & Replace tool.
 *
 * Addressing scheme: every match is identified by
 *   { sectionIndex, kind, nodeOrdinal, occurrenceIndex }
 * - kind "text": nodeOrdinal = index of the text node in TreeWalker
 *   (SHOW_TEXT) document order over the parsed section fragment.
 * - kind "href": nodeOrdinal = index of the anchor in querySelectorAll("a")
 *   document order (only tel:/mailto: hrefs are matched).
 * - occurrenceIndex = nth plain-text occurrence within that node's string
 *   (text node value or href attribute value).
 * Scan and apply walk fragments with identical rules, so ordinals are stable
 * as long as the section content is unchanged.
 */
import type { Section } from "../../api/templates";
import type { WebsitePage } from "../../api/websites";

export type MatchKind = "text" | "href";

/**
 * Picks one row per path to scan: the latest draft if any, else the latest
 * published. Artifact pages and inactive rows are skipped.
 */
export const pickScanTargets = (pages: WebsitePage[]): WebsitePage[] => {
  const byPath = new Map<string, WebsitePage[]>();
  pages.forEach((page) => {
    if (page.page_type === "artifact" || page.status === "inactive") return;
    const rows = byPath.get(page.path) ?? [];
    rows.push(page);
    byPath.set(page.path, rows);
  });
  const targets: WebsitePage[] = [];
  byPath.forEach((rows) => {
    const latest = (status: string) =>
      rows
        .filter((row) => row.status === status)
        .sort((a, b) => b.version - a.version)[0];
    const pick = latest("draft") ?? latest("published");
    if (pick) targets.push(pick);
  });
  return targets.sort((a, b) => a.path.localeCompare(b.path));
};

export type MatchRef = {
  sectionIndex: number;
  kind: MatchKind;
  nodeOrdinal: number;
  occurrenceIndex: number;
};

export type FindMatch = MatchRef & {
  pageId: string;
  pagePath: string;
  contextBefore: string;
  matchText: string;
  contextAfter: string;
};

export const matchKey = (m: MatchRef & { pageId: string }): string =>
  [m.pageId, m.sectionIndex, m.kind, m.nodeOrdinal, m.occurrenceIndex].join("|");

const CONTEXT_RADIUS = 40;
const SKIPPED_PARENT_TAGS = new Set(["SCRIPT", "STYLE"]);

const findOccurrences = (
  haystack: string,
  needle: string,
  caseSensitive: boolean,
): number[] => {
  if (!needle) return [];
  const h = caseSensitive ? haystack : haystack.toLowerCase();
  const n = caseSensitive ? needle : needle.toLowerCase();
  const positions: number[] = [];
  let idx = h.indexOf(n);
  while (idx !== -1) {
    positions.push(idx);
    idx = h.indexOf(n, idx + n.length);
  }
  return positions;
};

const buildFragment = (html: string): HTMLTemplateElement => {
  const tpl = document.createElement("template");
  tpl.innerHTML = html;
  return tpl;
};

type FragmentVisitor = {
  onTextNode?: (node: Text, ordinal: number) => void;
  onTelMailtoAnchor?: (el: Element, ordinal: number) => void;
};

/** Walks a parsed section fragment with stable ordinal numbering. */
const walkFragment = (root: DocumentFragment, visitor: FragmentVisitor): void => {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let ordinal = 0;
  let node = walker.nextNode();
  while (node) {
    const parentTag = node.parentElement?.tagName ?? "";
    if (!SKIPPED_PARENT_TAGS.has(parentTag)) {
      visitor.onTextNode?.(node as Text, ordinal);
    }
    ordinal += 1;
    node = walker.nextNode();
  }
  root.querySelectorAll("a").forEach((el, anchorOrdinal) => {
    const href = el.getAttribute("href") ?? "";
    if (href.startsWith("tel:") || href.startsWith("mailto:")) {
      visitor.onTelMailtoAnchor?.(el, anchorOrdinal);
    }
  });
};

const scanSectionContent = (
  pageId: string,
  pagePath: string,
  sectionIndex: number,
  html: string,
  find: string,
  caseSensitive: boolean,
): FindMatch[] => {
  const matches: FindMatch[] = [];
  const collect = (value: string, kind: MatchKind, nodeOrdinal: number) => {
    findOccurrences(value, find, caseSensitive).forEach((pos, occurrenceIndex) => {
      const start = Math.max(0, pos - CONTEXT_RADIUS);
      const end = Math.min(value.length, pos + find.length + CONTEXT_RADIUS);
      matches.push({
        pageId,
        pagePath,
        sectionIndex,
        kind,
        nodeOrdinal,
        occurrenceIndex,
        contextBefore: (start > 0 ? "…" : "") + value.slice(start, pos),
        matchText: value.slice(pos, pos + find.length),
        contextAfter:
          value.slice(pos + find.length, end) + (end < value.length ? "…" : ""),
      });
    });
  };
  walkFragment(buildFragment(html).content, {
    onTextNode: (node, ordinal) => collect(node.nodeValue ?? "", "text", ordinal),
    onTelMailtoAnchor: (el, ordinal) =>
      collect(el.getAttribute("href") ?? "", "href", ordinal),
  });
  return matches;
};

export const scanPageSections = (
  pageId: string,
  pagePath: string,
  sections: Section[],
  find: string,
  caseSensitive: boolean,
): FindMatch[] =>
  sections.flatMap((section, index) =>
    scanSectionContent(pageId, pagePath, index, section.content, find, caseSensitive),
  );

/** Per-section match counts — used to verify a fresh draft mirrors the scanned row. */
export const countSectionMatches = (
  sections: Section[],
  find: string,
  caseSensitive: boolean,
): number[] =>
  sections.map(
    (section, index) =>
      scanSectionContent("", "", index, section.content, find, caseSensitive).length,
  );

const replaceOccurrences = (
  haystack: string,
  needle: string,
  replacement: string,
  caseSensitive: boolean,
  selectedOccurrences: Set<number>,
): { result: string; replaced: number } => {
  const positions = findOccurrences(haystack, needle, caseSensitive);
  let result = "";
  let cursor = 0;
  let replaced = 0;
  positions.forEach((pos, occurrenceIndex) => {
    if (!selectedOccurrences.has(occurrenceIndex)) return;
    result += haystack.slice(cursor, pos) + replacement;
    cursor = pos + needle.length;
    replaced += 1;
  });
  return { result: result + haystack.slice(cursor), replaced };
};

/**
 * Applies the selected replacements to a page's sections. Sections without a
 * selected match are returned untouched (original string, no re-serialization).
 */
export const applyReplacements = (
  sections: Section[],
  refs: MatchRef[],
  find: string,
  replace: string,
  caseSensitive: boolean,
): { sections: Section[]; replaced: number } => {
  const bySection = new Map<number, MatchRef[]>();
  refs.forEach((ref) => {
    const list = bySection.get(ref.sectionIndex) ?? [];
    list.push(ref);
    bySection.set(ref.sectionIndex, list);
  });

  let replaced = 0;
  const nextSections = sections.map((section, sectionIndex) => {
    const sectionRefs = bySection.get(sectionIndex);
    if (!sectionRefs?.length) return section;

    const selectionFor = (kind: MatchKind) => {
      const selection = new Map<number, Set<number>>();
      sectionRefs
        .filter((ref) => ref.kind === kind)
        .forEach((ref) => {
          const set = selection.get(ref.nodeOrdinal) ?? new Set<number>();
          set.add(ref.occurrenceIndex);
          selection.set(ref.nodeOrdinal, set);
        });
      return selection;
    };
    const textSelection = selectionFor("text");
    const hrefSelection = selectionFor("href");

    const tpl = buildFragment(section.content);
    walkFragment(tpl.content, {
      onTextNode: (node, ordinal) => {
        const selected = textSelection.get(ordinal);
        if (!selected) return;
        const outcome = replaceOccurrences(
          node.nodeValue ?? "",
          find,
          replace,
          caseSensitive,
          selected,
        );
        node.nodeValue = outcome.result;
        replaced += outcome.replaced;
      },
      onTelMailtoAnchor: (el, ordinal) => {
        const selected = hrefSelection.get(ordinal);
        if (!selected) return;
        const outcome = replaceOccurrences(
          el.getAttribute("href") ?? "",
          find,
          replace,
          caseSensitive,
          selected,
        );
        el.setAttribute("href", outcome.result);
        replaced += outcome.replaced;
      },
    });
    return { ...section, content: tpl.innerHTML };
  });

  return { sections: nextSections, replaced };
};
