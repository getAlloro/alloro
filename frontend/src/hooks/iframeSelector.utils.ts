/**
 * Pure helpers, constants, and the selector CSS for useIframeSelector.
 *
 * Extracted verbatim from useIframeSelector.ts during a behavior-preserving
 * decomposition. Everything here is module-scope and stateless: each function
 * operates only on the element/document/values passed to it and never touches
 * the hook's React state or refs. The hook imports these back and re-exports
 * the public ones (getFriendlyName, prepareHtmlForPreview) so existing
 * consumers stay unchanged.
 */

import { getCanvasTextEditEligibility, hasDirectText } from "../utils/canvasTextEditing";
import type { SelectedInfo } from "./iframeSelector.types";

export const ALLORO_PREFIX = "alloro-tpl-";

/** Map HTML tag names to friendly display names. */
const TAG_LABELS: Record<string, string> = {
  h1: "Heading",
  h2: "Heading",
  h3: "Heading",
  h4: "Heading",
  h5: "Heading",
  h6: "Heading",
  p: "Paragraph",
  a: "Link",
  img: "Image",
  button: "Button",
  section: "Section",
  div: "Container",
  span: "Text",
  nav: "Navigation",
  form: "Form",
  ul: "List",
  ol: "List",
  li: "List Item",
  video: "Video",
  header: "Header",
  footer: "Footer",
  main: "Main",
  article: "Article",
  aside: "Aside",
  figure: "Figure",
  figcaption: "Caption",
  blockquote: "Quote",
  table: "Table",
  svg: "Icon",
};

export function getFriendlyName(tagName: string): string {
  return TAG_LABELS[tagName.toLowerCase()] || tagName.charAt(0).toUpperCase() + tagName.slice(1).toLowerCase();
}

/**
 * Raw character offset into `element`'s text at the given viewport point —
 * used to land the edit caret where the user clicked. Returns null when the
 * point doesn't resolve to a text position inside the element.
 */
export function caretCharOffsetFromPoint(
  doc: Document,
  element: Element,
  x: number,
  y: number,
): number | null {
  // Pure best-effort: a caret-positioning nicety must NEVER throw out of the
  // click handler (that would abort the edit and leave only a selection).
  try {
    let node: Node | null = null;
    let offset = 0;
    const anyDoc = doc as Document & {
      caretRangeFromPoint?: (x: number, y: number) => Range | null;
      caretPositionFromPoint?: (
        x: number,
        y: number,
      ) => { offsetNode: Node; offset: number } | null;
    };
    if (typeof anyDoc.caretRangeFromPoint === "function") {
      const range = anyDoc.caretRangeFromPoint(x, y);
      if (range) {
        node = range.startContainer;
        offset = range.startOffset;
      }
    } else if (typeof anyDoc.caretPositionFromPoint === "function") {
      const pos = anyDoc.caretPositionFromPoint(x, y);
      if (pos) {
        node = pos.offsetNode;
        offset = pos.offset;
      }
    }
    if (!node || !element.contains(node)) {
      return estimateCaretOffsetFromPoint(element, x);
    }

    let raw = 0;
    const walker = doc.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let textNode: Node | null;
    while ((textNode = walker.nextNode())) {
      if (textNode === node) return raw + offset;
      raw += (textNode.textContent || "").length;
    }
    return raw || estimateCaretOffsetFromPoint(element, x);
  } catch {
    return estimateCaretOffsetFromPoint(element, x);
  }
}

function estimateCaretOffsetFromPoint(element: Element, x: number): number | null {
  const textLength = (element.textContent || "").length;
  if (!textLength) return null;

  const rect = element.getBoundingClientRect();
  if (!Number.isFinite(rect.width) || rect.width <= 0) return null;

  const ratio = Math.max(0, Math.min(1, (x - rect.left) / rect.width));
  return Math.max(0, Math.min(textLength, Math.round(textLength * ratio)));
}

/** Walk up from a target element to find the nearest alloro-classed ancestor (or self). */
export function findAlloroElement(el: Element | null): Element | null {
  while (el) {
    if (getAlloroClass(el)) return el;
    el = el.parentElement;
  }
  return null;
}

/** Tags eligible for auto-tagging when untagged content is hovered/clicked inside a section. */
const AUTO_TAG_ELIGIBLE_TAGS = new Set([
  "p", "span", "a", "h1", "h2", "h3", "h4", "h5", "h6",
  "li", "button", "blockquote", "figcaption", "img", "video",
]);

/**
 * Walk up from a target to find the nearest auto-taggable content element.
 * Only elements inside a [data-alloro-section] wrapper qualify — header/footer
 * content (LayoutEditor) has no section wrappers and stays untouched.
 */
/** The site footer is chrome (consistent across pages, edited elsewhere) — it
 *  must never hover/select in the page editor, whether it's a semantic
 *  `<footer>` or a section named "footer". */
export function isFooterChrome(el: Element | null): boolean {
  if (!el) return false;
  if (el.closest("footer")) return true;
  const section = el.closest("[data-alloro-section]");
  return (section?.getAttribute("data-alloro-section")?.toLowerCase() || "").includes(
    "footer",
  );
}

export function findAutoTagCandidate(el: Element | null): Element | null {
  while (el) {
    if (
      (AUTO_TAG_ELIGIBLE_TAGS.has(el.tagName.toLowerCase()) || hasDirectText(el)) &&
      el.closest("[data-alloro-section]")
    ) {
      return el;
    }
    el = el.parentElement;
  }
  return null;
}

/**
 * Resolve the effective hover target — CONTENT-FIRST: the precise basic
 * element under the cursor (text, link, image) wins over any alloro-tagged
 * ancestor, so users always preview/edit exactly what they point at. Tagged
 * ancestors (sections, component cards) are the fallback for container
 * hovers. Untagged candidates get a synthetic component class for label
 * styling and precedence only — never written to the DOM on hover (hover
 * must not mutate content that later gets persisted).
 */
export function resolveHoverTarget(
  origin: Element,
  sectionsOnly: boolean,
): { target: Element; cls: string } | null {
  // Shortcode pills (post/review/menu loops) are read-only placeholders —
  // their content is server-resolved and never directly editable.
  if (origin.closest("[data-alloro-shortcode]")) return null;
  if (isFooterChrome(origin)) return null;

  const candidate = findAutoTagCandidate(origin);
  if (candidate) {
    const existing = getAlloroClass(candidate);
    return {
      target: candidate,
      cls:
        existing ||
        `${ALLORO_PREFIX}m-component-${candidate.tagName.toLowerCase()}`,
    };
  }
  const tagged = findAlloroElement(origin);
  if (tagged) {
    // Page editors restrict selection to page content — header/footer live
    // on the project and are edited in the Layout Editor.
    if (sectionsOnly && !tagged.closest("[data-alloro-section]")) return null;
    return { target: tagged, cls: getAlloroClass(tagged)! };
  }
  return null;
}

/**
 * Assign a generated component class to an untagged element so the existing
 * selection/edit pipeline (which queries `.${alloroClass}`) can drive it.
 * Idempotent — returns the existing alloro class when one is already present.
 * The "-component-" segment is load-bearing: isComponent() keys off it.
 */
export function ensureGeneratedAlloroClass(el: Element, doc: Document): string {
  const existing = getAlloroClass(el);
  if (existing) return existing;
  const tag = el.tagName.toLowerCase();
  let n = 1;
  let cls = `${ALLORO_PREFIX}m-component-${tag}-${n}`;
  while (doc.querySelector(`.${CSS.escape(cls)}`)) {
    n += 1;
    cls = `${ALLORO_PREFIX}m-component-${tag}-${n}`;
  }
  el.classList.add(cls);
  return cls;
}

export function getAlloroClass(el: Element): string | null {
  for (const cls of el.classList) {
    if (cls.startsWith(ALLORO_PREFIX)) return cls;
  }
  return null;
}

export function isComponent(alloroClass: string): boolean {
  return alloroClass.includes("-component-");
}

export function getReadableLabel(alloroClass: string): string {
  return alloroClass.replace(/^alloro-tpl-[a-f0-9]+-/, "");
}

function getElementRect(el: Element) {
  const rect = el.getBoundingClientRect();
  return {
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
  };
}

function getElementBackground(el: Element) {
  const style = (el as HTMLElement).style;
  return {
    backgroundColor: style.backgroundColor || "",
    backgroundImage: style.backgroundImage || "",
    backgroundSize: style.backgroundSize || "",
    backgroundPosition: style.backgroundPosition || "",
  };
}

/** Rendered font size in px at the iframe's current width (responsive classes
 *  resolved by the browser), or undefined when unavailable. */
export function getComputedFontSizePx(el: Element): number | undefined {
  const win = el.ownerDocument.defaultView;
  if (!win) return undefined;
  const px = parseFloat(win.getComputedStyle(el).fontSize);
  return Number.isFinite(px) ? px : undefined;
}

export function buildSelectedInfo(el: Element): SelectedInfo | null {
  const cls = getAlloroClass(el);
  if (!cls) return null;

  const tagName = el.tagName.toLowerCase();
  const eligibility = getCanvasTextEditEligibility(el);
  return {
    alloroClass: cls,
    label: getReadableLabel(cls),
    friendlyName: getFriendlyName(tagName),
    tagName,
    type: isComponent(cls) ? "component" : "section",
    outerHtml: (el as HTMLElement).outerHTML,
    isHidden: el.getAttribute("data-alloro-hidden") === "true",
    href: tagName === "a" ? (el as HTMLAnchorElement).getAttribute("href") || undefined : undefined,
    rect: getElementRect(el),
    ...getElementBackground(el),
    fontSizePx: getComputedFontSizePx(el),
    canCanvasEditText: eligibility.canEdit,
    canvasTextEditMode: eligibility.mode,
    textEditFallbackReason: eligibility.reason,
  };
}

/** Strip CSP meta tags so external resources (fonts, CSS, images) load in the iframe. */
export function prepareHtmlForPreview(html: string): string {
  return html.replace(
    /<meta[^>]*http-equiv=["']Content-Security-Policy["'][^>]*>/gi,
    ""
  );
}

/** CSS injected into the iframe to enable the selector UX. */
export const SELECTOR_CSS = `
  /* Kill native interactivity */
  a, button, form, input, select, textarea {
    pointer-events: none !important;
    cursor: default !important;
  }

  /* Untagged links/buttons inside sections must stay clickable so they can be
     selected — navigation is suppressed in the click handler instead. Form
     controls stay dead. */
  [data-alloro-section] a,
  [data-alloro-section] button {
    pointer-events: auto !important;
    cursor: pointer !important;
  }

  textarea[data-alloro-canvas-editor="true"] {
    pointer-events: auto !important;
    cursor: text !important;
    user-select: text !important;
    -webkit-user-select: text !important;
  }

  /* Allow alloro-labeled elements to receive pointer events */
  [class*="${ALLORO_PREFIX}"] {
    pointer-events: auto !important;
    cursor: pointer !important;
  }

  [data-alloro-editing="true"] {
    cursor: text !important;
    caret-color: #d66853 !important;
    outline: 2px solid #d66853 !important;
    outline-offset: 4px !important;
    box-shadow: none !important;
    user-select: text !important;
    -webkit-user-select: text !important;
  }

  [data-alloro-editing="true"]:focus,
  [data-alloro-editing="true"]:focus-visible,
  [data-alloro-editing="true"]:active {
    outline: 2px solid #d66853 !important;
    outline-offset: 4px !important;
    box-shadow: none !important;
  }

  /* Keep hidden/invisible overlays from intercepting events */
  [class*="${ALLORO_PREFIX}"].pointer-events-none,
  [class*="${ALLORO_PREFIX}"][style*="display: none"],
  [class*="${ALLORO_PREFIX}"][style*="display:none"] {
    pointer-events: none !important;
  }

  /* Re-enable navigation toggle buttons (hamburger menus) */
  button[aria-expanded],
  button[aria-controls],
  button[data-collapse-toggle],
  button[data-drawer-toggle],
  [data-mobile-menu-toggle] {
    pointer-events: auto !important;
    cursor: pointer !important;
  }

  /* Hover highlight */
  [data-alloro-hover="true"]:not([data-alloro-selected="true"]):not([data-alloro-editing="true"]),
  [class*="${ALLORO_PREFIX}"]:hover:not([data-alloro-selected="true"]):not([data-alloro-editing="true"]) {
    outline: 2px dashed #3b82f6 !important;
    outline-offset: 5px !important;
  }

  /* Selected/focused/active highlight */
  [data-alloro-selected="true"] {
    outline: 2px solid #d66853 !important;
    outline-offset: 4px !important;
    box-shadow: none !important;
  }

  [data-alloro-selected="true"]:focus,
  [data-alloro-selected="true"]:focus-visible,
  [data-alloro-selected="true"]:active,
  [data-alloro-selected="true"][data-alloro-hover="true"],
  [data-alloro-selected="true"][data-alloro-editing="true"] {
    outline: 2px solid #d66853 !important;
    outline-offset: 4px !important;
    box-shadow: none !important;
  }

  /* Label injected into the DOM */
  .alloro-label {
    position: absolute;
    top: -26px;
    left: 0;
    z-index: 99999;
    padding: 2px 8px;
    border-radius: 4px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    font-size: 11px;
    font-weight: 500;
    white-space: nowrap;
    pointer-events: none;
    line-height: 20px;
    display: flex;
    align-items: center;
    gap: 0;
  }
  .alloro-label--section { background: #7c3aed; color: white; }
  .alloro-label--component { background: #2563eb; color: white; }
  .alloro-label--selected-section { background: #5b21b6; color: white; }
  .alloro-label--selected-component { background: #1d4ed8; color: white; }

  /* Selected label — re-enable pointer events so action icons are clickable */
  #alloro-selected-label {
    pointer-events: auto !important;
    cursor: default !important;
  }

  /* Action icon buttons inside the selected label */
  #alloro-selected-label button.alloro-action-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    border: none;
    background: transparent;
    color: rgba(255, 255, 255, 0.6);
    cursor: pointer !important;
    pointer-events: auto !important;
    padding: 0;
    margin: 0;
    border-radius: 3px;
    transition: color 0.15s, background 0.15s;
  }
  #alloro-selected-label button.alloro-action-btn:hover {
    color: white;
    background: rgba(255, 255, 255, 0.2);
  }

  /* Separator between label text and action icons */
  .alloro-label-sep {
    width: 1px;
    height: 12px;
    background: rgba(255, 255, 255, 0.3);
    margin: 0 6px;
  }

  /* Inline action input panel — re-enable pointer events with high specificity */
  #alloro-action-panel {
    position: absolute;
    z-index: 99999;
    pointer-events: auto !important;
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px;
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.12);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  }
  #alloro-action-panel input[type="text"] {
    pointer-events: auto !important;
    cursor: text !important;
    width: 200px;
    height: 28px;
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    padding: 0 8px;
    font-size: 12px;
    color: #111827;
    background: #f9fafb;
    outline: none;
    transition: border-color 0.15s;
  }
  #alloro-action-panel input[type="text"]:focus {
    border-color: #f97316;
    box-shadow: 0 0 0 2px rgba(249, 115, 22, 0.15);
  }
  #alloro-action-panel input[type="text"]::placeholder {
    color: #9ca3af;
  }
  #alloro-action-panel button.alloro-action-submit {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border: none;
    border-radius: 6px;
    background: #f97316;
    color: white;
    cursor: pointer !important;
    pointer-events: auto !important;
    padding: 0;
    transition: background 0.15s;
  }
  #alloro-action-panel button.alloro-action-submit:hover {
    background: #ea580c;
  }

  /* Hidden elements — reduced opacity in editor */
  [data-alloro-hidden="true"] {
    opacity: 0.3 !important;
  }
`;
