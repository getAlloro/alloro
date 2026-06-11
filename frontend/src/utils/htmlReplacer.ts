/**
 * HTML Replacement Utilities
 *
 * DOM-based replacement for alloro-tpl components.
 * Mutates the iframe DOM directly to avoid page flash,
 * then serializes back to string for persistence.
 */

import type { Section } from "../api/templates";

/**
 * Replace a component's HTML directly in the iframe DOM.
 * Returns the serialized full-page HTML string for persistence.
 *
 * This mutates the live DOM — no srcDoc re-render needed.
 */
export function replaceComponentInDom(
  iframeDoc: Document,
  alloroClass: string,
  newOuterHtml: string
): { html: string; matchCount: number } {
  const matches = iframeDoc.querySelectorAll(
    `[class*="${alloroClass}"]`
  );

  if (matches.length === 0) {
    throw new Error(`No element found with class "${alloroClass}"`);
  }

  if (matches.length > 1) {
    console.warn(
      `[htmlReplacer] Found ${matches.length} elements with class "${alloroClass}". Replacing first match.`
    );
  }

  // Replace the first match in the live DOM
  const target = matches[0] as HTMLElement;
  target.outerHTML = newOuterHtml;

  // Serialize the full document back to string
  const html = serializeDocument(iframeDoc);

  return { html, matchCount: matches.length };
}

/**
 * String-based replacement via DOMParser (for cases where we don't have iframe access).
 */
export function replaceComponentHtml(
  fullHtml: string,
  alloroClass: string,
  newOuterHtml: string
): { html: string; matchCount: number } {
  const parser = new DOMParser();
  const doc = parser.parseFromString(fullHtml, "text/html");

  const matches = doc.querySelectorAll(`[class*="${alloroClass}"]`);

  if (matches.length === 0) {
    throw new Error(`No element found with class "${alloroClass}"`);
  }

  if (matches.length > 1) {
    console.warn(
      `[htmlReplacer] Found ${matches.length} elements with class "${alloroClass}". Replacing first match.`
    );
  }

  const target = matches[0] as HTMLElement;
  target.outerHTML = newOuterHtml;

  return { html: serializeDocument(doc), matchCount: matches.length };
}

/**
 * Validate that an HTML string is parseable and doesn't contain obvious errors.
 */
export function validateHtml(html: string): { valid: boolean; error?: string } {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");

    const parseError = doc.querySelector("parsererror");
    if (parseError) {
      return {
        valid: false,
        error: `HTML parse error: ${parseError.textContent}`,
      };
    }

    // Check that there's actual content (not just empty body)
    if (!doc.body || doc.body.innerHTML.trim().length === 0) {
      return { valid: false, error: "HTML produced empty content" };
    }

    return { valid: true };
  } catch (err) {
    return {
      valid: false,
      error: err instanceof Error ? err.message : "Unknown parse error",
    };
  }
}

/**
 * Extract the alloro-tpl class from a section's stored content HTML.
 * Parses the root element and finds the first class that starts with "alloro-tpl-".
 */
function extractAlloroClass(sectionContent: string): string | null {
  const match = sectionContent.match(/class="([^"]*?)"/);
  if (!match) return null;
  const classes = match[1].split(/\s+/);
  return classes.find((c) => c.startsWith("alloro-tpl-")) ?? null;
}

/**
 * Extract updated section content from the iframe DOM after a mutation.
 *
 * Strategy: parse each section's stored content HTML to extract the actual
 * alloro-tpl class from its root element, then use that exact class to find
 * the element in the iframe DOM. This avoids relying on section.name matching
 * the DOM class — N8N-generated names can be more descriptive than the CSS
 * class identifiers (e.g., "section-legacy-software" vs "section-legacy").
 *
 * Falls back to the original section content if no matching element is found.
 */
/**
 * Restore original shortcode tokens in an HTML string.
 * Finds any element with `data-alloro-shortcode-original="ENCODED_TOKEN"`
 * and replaces the entire element (with all children) with the decoded token
 * as text. DOM-based so nested `<div>` children in the wrapper body don't
 * break the match — a regex with lazy `</div>` stops at the first closer.
 */
function restoreShortcodeTokens(html: string): string {
  if (!html.includes("data-alloro-shortcode-original")) return html;

  const parser = new DOMParser();
  const doc = parser.parseFromString(`<body>${html}</body>`, "text/html");
  const wrappers = doc.querySelectorAll("[data-alloro-shortcode-original]");
  if (wrappers.length === 0) return html;

  wrappers.forEach((el) => {
    const encoded = el.getAttribute("data-alloro-shortcode-original") ?? "";
    const token = encoded
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, "&");
    el.replaceWith(doc.createTextNode(token));
  });

  return doc.body.innerHTML;
}

/**
 * Serialize an element for persistence: clone it, strip editor-only state
 * attributes (selection/hover/editing markers leak into saved content and
 * render on the public site otherwise), and restore shortcode pills back to
 * their raw tokens.
 */
function serializeSectionElement(el: Element, stripSectionMarker: boolean): string {
  const clone = el.cloneNode(true) as Element;
  if (stripSectionMarker) {
    clone.removeAttribute("data-alloro-section");
  }
  const editorAttrs = [
    "data-alloro-hover",
    "data-alloro-selected",
    "data-alloro-editing",
  ];
  for (const attr of editorAttrs) {
    clone.removeAttribute(attr);
    clone.querySelectorAll(`[${attr}]`).forEach((child) => {
      child.removeAttribute(attr);
    });
  }
  return restoreShortcodeTokens(clone.outerHTML);
}

export function extractSectionsFromDom(
  iframeDoc: Document,
  currentSections: Section[]
): Section[] {
  return currentSections.map((section) => {
    // Strategy 1: find by data-alloro-section marker (injected by renderPage)
    const markerEl = iframeDoc.querySelector(`[data-alloro-section="${CSS.escape(section.name)}"]`);
    if (markerEl) {
      return {
        ...section,
        content: serializeSectionElement(markerEl, true),
      };
    }

    // Strategy 2: fall back to alloro-tpl-* class from stored content
    const alloroClass = extractAlloroClass(section.content);
    if (alloroClass) {
      const el = iframeDoc.querySelector(`.${CSS.escape(alloroClass)}`);
      if (el) {
        return {
          ...section,
          content: serializeSectionElement(el, false),
        };
      }
    }

    console.warn(`[extractSections] "${section.name}" → no match in DOM`);
    return section;
  });
}

/**
 * Serialize a Document back to a full HTML string.
 * Clones the document and strips editor artifacts before serializing
 * so the live iframe keeps its selector UX intact.
 */
function serializeDocument(doc: Document): string {
  const clone = doc.documentElement.cloneNode(true) as HTMLElement;

  // Strip injected editor styles
  clone.querySelector("#alloro-selector-styles")?.remove();

  // Strip injected label divs and action panel
  clone.querySelector("#alloro-hover-label")?.remove();
  clone.querySelector("#alloro-selected-label")?.remove();
  clone.querySelector("#alloro-action-panel")?.remove();

  // Strip editor data attributes from all elements
  clone
    .querySelectorAll("[data-alloro-hover]")
    .forEach((el) => el.removeAttribute("data-alloro-hover"));
  clone
    .querySelectorAll("[data-alloro-selected]")
    .forEach((el) => el.removeAttribute("data-alloro-selected"));
  clone
    .querySelectorAll("[data-alloro-section]")
    .forEach((el) => el.removeAttribute("data-alloro-section"));

  const doctype = doc.doctype;
  const doctypeStr = doctype
    ? `<!DOCTYPE ${doctype.name}${doctype.publicId ? ` PUBLIC "${doctype.publicId}"` : ""}${doctype.systemId ? ` "${doctype.systemId}"` : ""}>`
    : "<!DOCTYPE html>";

  return doctypeStr + "\n" + clone.outerHTML;
}
