/**
 * Constrained rich-text editing for mixed-content text elements.
 *
 * Elements with inline children that plain canvas editing would destroy
 * (e.g. a <p> containing an <a>) are edited contentEditable-in-place inside
 * the preview iframe with a mini toolbar. Commits sanitized inline HTML.
 *
 * Import-cycle note: this module imports normalizeEditorHref from
 * editorDirectOperations, which imports sanitizeInlineHtml from here. Both
 * imports are only referenced inside function bodies (never during module
 * evaluation), so the ESM cycle is safe and tsc-clean.
 */

import { getCanvasTextEditEligibility, isCanvasHtmlElement } from "./canvasTextEditing";
import { normalizeEditorHref } from "./editorDirectOperations";

export const RICH_TEXT_ALLOWED_TAGS = new Set([
  "strong", "em", "b", "i", "u", "small", "sup", "sub", "mark", "br", "span", "a",
]);

/** Tags removed wholesale — children included — during sanitization. */
const DROP_ENTIRELY_TAGS = new Set(["script", "style", "template", "iframe", "object", "embed", "noscript"]);

const RICH_STYLE_ID = "alloro-rich-text-styles";

export type RichTextEditSession = {
  cancel: () => void;
  commit: () => void;
  /** Current sanitized inline HTML WITHOUT ending the session — used to flush
   *  an in-progress edit into the document on Save/Publish. */
  getValue: () => string;
};

type RichTextEditOptions = {
  element: Element;
  onCommit: (html: string) => void;
  onCancel?: () => void;
  onChange?: (value: string) => void;
  onFinish?: () => void;
  /** Raw char offset into the element's text to place the caret at (else select all). */
  caretOffset?: number | null;
};

/**
 * Allowlist node-rebuild sanitizer. Parses into a detached <template> and
 * rebuilds a clean tree from scratch: nothing from the dirty tree is ever
 * cloned or adopted. Disallowed elements are unwrapped (children kept),
 * comments/CDATA/script/style are dropped, anchors keep only a normalized
 * href, and allowed tags keep only their class attribute.
 */
export function sanitizeInlineHtml(html: string, doc: Document): string {
  const dirty = doc.createElement("template");
  dirty.innerHTML = html;
  const clean = doc.createElement("template");
  appendSanitizedChildren(dirty.content, clean.content, doc);
  return clean.innerHTML;
}

function appendSanitizedChildren(source: Node, target: Node, doc: Document) {
  for (const child of Array.from(source.childNodes)) {
    appendSanitizedNode(child, target, doc);
  }
}

function appendSanitizedNode(node: Node, target: Node, doc: Document) {
  if (node.nodeType === Node.TEXT_NODE) {
    target.appendChild(doc.createTextNode(node.nodeValue || ""));
    return;
  }
  // Comments, CDATA sections, processing instructions: dropped entirely.
  if (node.nodeType !== Node.ELEMENT_NODE) return;

  const element = node as Element;
  const tagName = element.tagName.toLowerCase();
  if (DROP_ENTIRELY_TAGS.has(tagName)) return;

  if (!RICH_TEXT_ALLOWED_TAGS.has(tagName)) {
    appendSanitizedChildren(element, target, doc); // unwrap: keep children, drop tag
    return;
  }

  const rebuilt = rebuildAllowedElement(element, tagName, doc);
  if (!rebuilt) {
    appendSanitizedChildren(element, target, doc); // anchor with a bad href → unwrap
    return;
  }
  target.appendChild(rebuilt);
  appendSanitizedChildren(element, rebuilt, doc);
}

/** Recreate an allowed element fresh — class only, plus normalized href on <a>. */
function rebuildAllowedElement(source: Element, tagName: string, doc: Document): Element | null {
  const rebuilt = doc.createElement(tagName);
  if (tagName === "a") {
    try {
      rebuilt.setAttribute("href", normalizeEditorHref(source.getAttribute("href") || ""));
    } catch {
      return null;
    }
  }
  const className = source.getAttribute("class");
  if (className) rebuilt.setAttribute("class", className);
  return rebuilt;
}

export function startRichTextEdit({
  element,
  onCommit,
  onCancel,
  onChange,
  onFinish,
  caretOffset,
}: RichTextEditOptions): RichTextEditSession | null {
  if (!isCanvasHtmlElement(element)) return null;
  if (!getCanvasTextEditEligibility(element).canEdit) return null;

  const doc = element.ownerDocument;
  const originalHtml = element.innerHTML;
  const originalEditingAttr = element.getAttribute("data-alloro-editing");
  const originalContentEditableAttr = element.getAttribute("contenteditable");
  ensureRichTextStyles(doc);
  let isFinished = false;

  const cleanup = () => {
    element.removeEventListener("keydown", handleKeyDown);
    element.removeEventListener("blur", handleBlur);
    element.removeEventListener("input", handleInput);
    element.removeEventListener("paste", handlePaste);
    element.removeEventListener("drop", handleDrop);
    element.removeEventListener("click", suppressAnchorClick);
    restoreAttribute(element, "contenteditable", originalContentEditableAttr);
    restoreAttribute(element, "data-alloro-editing", originalEditingAttr);
    doc.getSelection()?.removeAllRanges();
    onFinish?.();
  };

  const finish = (shouldCommit: boolean) => {
    if (isFinished) return;
    isFinished = true;

    const editedHtml = element.innerHTML;
    cleanup();
    // Restore the original markup exactly — the authoritative apply happens
    // downstream through the operation pipeline (replace-inline-html).
    element.innerHTML = originalHtml;

    if (shouldCommit && editedHtml !== originalHtml) {
      const sanitized = sanitizeInlineHtml(editedHtml, doc);
      if (hasVisibleText(sanitized, doc) || !hasVisibleText(originalHtml, doc)) {
        onCommit(sanitized);
        return;
      }
    }
    onCancel?.();
  };

  function handleKeyDown(event: KeyboardEvent) {
    event.stopPropagation();
    if (event.key === "Escape") {
      event.preventDefault();
      finish(false);
      return;
    }
    if (event.key === "Enter") {
      // Enter never commits — multiline inline content is legal. Insert a <br>
      // instead of letting the browser split into block-level children.
      event.preventDefault();
      insertLineBreak(doc);
      handleInput();
    }
  }

  function handleBlur() {
    window.setTimeout(() => {
      if (isFinished) return;
      const active = doc.activeElement;
      if (active === element || element.contains(active)) return;
      finish(true);
    }, 0);
  }

  function handlePaste(event: ClipboardEvent) {
    event.preventDefault();
    event.stopPropagation();
    insertTextAtSelection(doc, event.clipboardData?.getData("text/plain") || "");
    handleInput();
  }

  function handleDrop(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
  }

  function handleInput() {
    onChange?.((element.textContent || "").replace(/\s+/g, " ").trim());
  }

  function suppressAnchorClick(event: MouseEvent) {
    const target = event.target as Element | null;
    if (target?.closest?.("a")) event.preventDefault();
  }

  element.setAttribute("data-alloro-editing", "true");
  element.setAttribute("contenteditable", "true");
  element.addEventListener("keydown", handleKeyDown);
  element.addEventListener("blur", handleBlur);
  element.addEventListener("input", handleInput);
  element.addEventListener("paste", handlePaste);
  element.addEventListener("drop", handleDrop);
  element.addEventListener("click", suppressAnchorClick);

  // Focus SYNCHRONOUSLY (the caller runs this inside the user click gesture).
  // Deferring via setTimeout moved focus outside the gesture, so the iframe
  // contentEditable never painted a caret. contentEditable + listeners are
  // already set above and the element is in-DOM, so synchronous focus is valid.
  element.focus({ preventScroll: true });
  // Land the caret where the user clicked; fall back to selecting all.
  if (caretOffset == null || !placeCaretAtOffset(doc, element, caretOffset)) {
    selectAllContents(doc, element);
  }

  return {
    cancel: () => finish(false),
    commit: () => finish(true),
    getValue: () => sanitizeInlineHtml(element.innerHTML, doc),
  };
}

/** Collapse the caret at a raw char offset into the element's text nodes. */
function placeCaretAtOffset(
  doc: Document,
  element: Element,
  offset: number,
): boolean {
  const walker = doc.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  let remaining = offset;
  let lastNode: Node | null = null;
  let node: Node | null;
  const selection = doc.getSelection();
  if (!selection) return false;

  while ((node = walker.nextNode())) {
    const len = (node.textContent || "").length;
    lastNode = node;
    if (remaining <= len) {
      const range = doc.createRange();
      range.setStart(node, Math.max(0, Math.min(remaining, len)));
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
      return true;
    }
    remaining -= len;
  }

  if (lastNode) {
    const range = doc.createRange();
    range.setStart(lastNode, (lastNode.textContent || "").length);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    return true;
  }
  return false;
}

function insertLineBreak(doc: Document) {
  insertNodeAtSelection(doc, doc.createElement("br"));
}

function insertTextAtSelection(doc: Document, text: string) {
  insertNodeAtSelection(doc, doc.createTextNode(text));
}

function insertNodeAtSelection(doc: Document, node: Node) {
  const selection = doc.getSelection();
  if (!selection || selection.rangeCount === 0) return;
  const range = selection.getRangeAt(0);
  range.deleteContents();
  range.insertNode(node);
  range.setStartAfter(node);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}

function selectAllContents(doc: Document, element: Element) {
  const selection = doc.getSelection();
  if (!selection) return;
  const range = doc.createRange();
  range.selectNodeContents(element);
  selection.removeAllRanges();
  selection.addRange(range);
}

function restoreAttribute(element: HTMLElement, name: string, value: string | null) {
  if (value === null) {
    element.removeAttribute(name);
    return;
  }
  element.setAttribute(name, value);
}

function hasVisibleText(html: string, doc: Document): boolean {
  const probe = doc.createElement("template");
  probe.innerHTML = html;
  return Boolean(probe.content.textContent?.trim());
}

/* The floating B/I/Link/Clear/Done toolbar was removed — rich elements now
   edit contentEditable-in-place (commit on blur, Escape to cancel) and all
   formatting controls live in the sidebar. This rule keeps the contentEditable
   subtree pointer/selectable while a session is active. */
const RICH_TEXT_CSS = `
  [data-alloro-editing="true"] * { pointer-events: auto !important; user-select: text !important; -webkit-user-select: text !important; }
`;

function ensureRichTextStyles(doc: Document) {
  if (doc.getElementById(RICH_STYLE_ID)) return;
  const style = doc.createElement("style");
  style.id = RICH_STYLE_ID;
  style.textContent = RICH_TEXT_CSS;
  doc.head.appendChild(style);
}
