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

/** Tags removed by "Clear formatting" (anchors and line breaks survive). */
const FORMATTING_SELECTOR = Array.from(RICH_TEXT_ALLOWED_TAGS)
  .filter((tag) => tag !== "a" && tag !== "br")
  .join(",");

const RICH_TOOLBAR_ID = "alloro-rich-toolbar";
const RICH_STYLE_ID = "alloro-rich-text-styles";

export type RichTextEditSession = {
  cancel: () => void;
  commit: () => void;
};

type RichTextEditOptions = {
  element: Element;
  onCommit: (html: string) => void;
  onCancel?: () => void;
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
  const { toolbar, linkInput, buttons } = createToolbar(doc);
  let isFinished = false;
  let savedRange: Range | null = null;

  const cleanup = () => {
    element.removeEventListener("keydown", handleKeyDown);
    element.removeEventListener("blur", handleBlur);
    element.removeEventListener("paste", handlePaste);
    element.removeEventListener("drop", handleDrop);
    element.removeEventListener("click", suppressAnchorClick);
    toolbar.remove();
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
    }
  }

  function handleBlur() {
    window.setTimeout(() => {
      if (isFinished) return;
      const active = doc.activeElement;
      if (active === element || element.contains(active) || toolbar.contains(active)) return;
      finish(true);
    }, 0);
  }

  function handlePaste(event: ClipboardEvent) {
    event.preventDefault();
    event.stopPropagation();
    insertTextAtSelection(doc, event.clipboardData?.getData("text/plain") || "");
  }

  function handleDrop(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
  }

  function suppressAnchorClick(event: MouseEvent) {
    const target = event.target as Element | null;
    if (target?.closest?.("a")) event.preventDefault();
  }

  const flashToolbarError = () => {
    toolbar.classList.add("alloro-rich-toolbar-error");
    window.setTimeout(() => toolbar.classList.remove("alloro-rich-toolbar-error"), 450);
  };

  const captureRange = (): Range | null => {
    const selection = doc.getSelection();
    if (!selection || selection.rangeCount === 0) return null;
    const range = selection.getRangeAt(0);
    if (!element.contains(range.commonAncestorContainer)) return null;
    return range.cloneRange();
  };

  const closeLinkInput = () => {
    linkInput.style.display = "none";
    savedRange = null;
  };

  const toggleLinkInput = () => {
    if (linkInput.style.display !== "none") {
      closeLinkInput();
      return;
    }
    savedRange = captureRange();
    linkInput.value = findEnclosingAnchor(savedRange?.startContainer || null, element)?.getAttribute("href") || "";
    linkInput.style.display = "";
    window.setTimeout(() => linkInput.focus(), 0);
  };

  const applyLink = (rawHref: string): boolean => {
    let href: string;
    try {
      href = normalizeEditorHref(rawHref);
    } catch {
      return false;
    }
    const range = savedRange;
    if (!range || !element.contains(range.commonAncestorContainer)) return false;

    // Selection inside an existing anchor — update its href (avoids nesting).
    const anchor = findEnclosingAnchor(range.startContainer, element);
    if (anchor) {
      anchor.setAttribute("href", href);
      return true;
    }
    if (range.collapsed) return false;

    const link = doc.createElement("a");
    link.setAttribute("href", href);
    try {
      range.surroundContents(link);
    } catch {
      return false; // partial-element selections throw — no-op by design
    }
    return true;
  };

  const submitLink = () => {
    if (!applyLink(linkInput.value)) {
      flashToolbarError();
      return;
    }
    closeLinkInput();
    element.focus({ preventScroll: true });
  };

  const clearFormatting = () => {
    const selection = doc.getSelection();
    const range = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
    const scoped =
      range && !range.collapsed && element.contains(range.commonAncestorContainer) ? range : null;
    for (const candidate of Array.from(element.querySelectorAll(FORMATTING_SELECTOR))) {
      if (!scoped || scoped.intersectsNode(candidate)) unwrapElement(candidate);
    }
    element.focus({ preventScroll: true });
  };

  toolbar.addEventListener("mousedown", (event) => {
    // Keep focus (and the selection) on the editable element for buttons;
    // the link input is the only control allowed to take focus.
    if (event.target !== linkInput) event.preventDefault();
    event.stopPropagation();
  });
  toolbar.addEventListener("click", (event) => event.stopPropagation());
  buttons.bold.addEventListener("click", () => execCommandSafe(doc, "bold"));
  buttons.italic.addEventListener("click", () => execCommandSafe(doc, "italic"));
  buttons.link.addEventListener("click", toggleLinkInput);
  buttons.clear.addEventListener("click", clearFormatting);
  buttons.done.addEventListener("click", () => finish(true));
  buttons.cancel.addEventListener("click", () => finish(false));
  linkInput.addEventListener("blur", handleBlur);
  linkInput.addEventListener("keydown", (event) => {
    event.stopPropagation();
    if (event.key === "Enter") { event.preventDefault(); submitLink(); }
    if (event.key === "Escape") { event.preventDefault(); closeLinkInput(); element.focus({ preventScroll: true }); }
  });
  linkInput.addEventListener("keyup", (event) => event.stopPropagation());
  linkInput.addEventListener("keypress", (event) => event.stopPropagation());

  element.setAttribute("data-alloro-editing", "true");
  element.setAttribute("contenteditable", "true");
  element.addEventListener("keydown", handleKeyDown);
  element.addEventListener("blur", handleBlur);
  element.addEventListener("paste", handlePaste);
  element.addEventListener("drop", handleDrop);
  element.addEventListener("click", suppressAnchorClick);
  positionToolbar(toolbar, element, doc);
  doc.body.appendChild(toolbar);

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

function execCommandSafe(doc: Document, command: string) {
  try {
    doc.execCommand(command); // deprecated but universally supported; failure is a no-op
  } catch {
    /* no-op */
  }
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

function findEnclosingAnchor(node: Node | null, boundary: Element): Element | null {
  let current: Node | null = node;
  while (current && current !== boundary) {
    if (current.nodeType === Node.ELEMENT_NODE && (current as Element).tagName.toLowerCase() === "a") {
      return current as Element;
    }
    current = current.parentNode;
  }
  return null;
}

function unwrapElement(element: Element) {
  const parent = element.parentNode;
  if (!parent) return;
  while (element.firstChild) parent.insertBefore(element.firstChild, element);
  parent.removeChild(element);
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

function positionToolbar(toolbar: HTMLElement, element: HTMLElement, doc: Document) {
  const rect = element.getBoundingClientRect();
  const scrollTop = doc.documentElement.scrollTop || doc.body.scrollTop || 0;
  const scrollLeft = doc.documentElement.scrollLeft || doc.body.scrollLeft || 0;
  // Above the element, clearing the selected label injected at rect.top - 26.
  toolbar.style.top = `${Math.max(scrollTop + 4, rect.top + scrollTop - 64)}px`;
  toolbar.style.left = `${Math.max(scrollLeft + 4, rect.left + scrollLeft)}px`;
}

type ToolbarButtons = {
  bold: HTMLButtonElement;
  italic: HTMLButtonElement;
  link: HTMLButtonElement;
  clear: HTMLButtonElement;
  done: HTMLButtonElement;
  cancel: HTMLButtonElement;
};

function createToolbar(doc: Document): { toolbar: HTMLDivElement; linkInput: HTMLInputElement; buttons: ToolbarButtons } {
  const toolbar = doc.createElement("div");
  toolbar.id = RICH_TOOLBAR_ID;

  const make = (label: string, title: string, className = "") => {
    const button = doc.createElement("button");
    button.type = "button";
    if (className) button.className = className;
    button.textContent = label;
    button.title = title;
    toolbar.appendChild(button);
    return button;
  };

  const bold = make("B", "Bold", "alloro-rich-btn-bold");
  const italic = make("I", "Italic", "alloro-rich-btn-italic");
  const link = make("Link", "Add or edit link");
  const clear = make("Clear", "Clear formatting");

  const linkInput = doc.createElement("input");
  linkInput.type = "text";
  linkInput.placeholder = "https://example.com";
  linkInput.setAttribute("aria-label", "Link URL");
  linkInput.style.display = "none";
  toolbar.appendChild(linkInput);

  const done = make("Done", "Apply changes", "alloro-rich-btn-done");
  const cancel = make("✕", "Discard changes");

  return { toolbar, linkInput, buttons: { bold, italic, link, clear, done, cancel } };
}

/** Matches the injected #alloro-action-panel aesthetic in useIframeSelector's SELECTOR_CSS. */
const RICH_TEXT_CSS = `
  #${RICH_TOOLBAR_ID} { position: absolute; z-index: 100000; display: flex; align-items: center; gap: 4px; padding: 4px; background: white; border: 1px solid #e5e7eb; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.12); transition: border-color 0.15s; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; pointer-events: auto !important; }
  #${RICH_TOOLBAR_ID} button { display: inline-flex; align-items: center; justify-content: center; min-width: 28px; height: 28px; padding: 0 8px; border: none; border-radius: 6px; background: transparent; color: #374151; font-size: 12px; font-weight: 600; cursor: pointer !important; pointer-events: auto !important; transition: background 0.15s, color 0.15s; }
  #${RICH_TOOLBAR_ID} button:hover { background: #f3f4f6; color: #111827; }
  #${RICH_TOOLBAR_ID} button.alloro-rich-btn-bold { font-weight: 800; }
  #${RICH_TOOLBAR_ID} button.alloro-rich-btn-italic { font-style: italic; font-family: Georgia, serif; }
  #${RICH_TOOLBAR_ID} button.alloro-rich-btn-done { background: #f97316; color: white; }
  #${RICH_TOOLBAR_ID} button.alloro-rich-btn-done:hover { background: #ea580c; color: white; }
  #${RICH_TOOLBAR_ID} input[type="text"] { pointer-events: auto !important; cursor: text !important; width: 180px; height: 28px; border: 1px solid #e5e7eb; border-radius: 6px; padding: 0 8px; font-size: 12px; color: #111827; background: #f9fafb; outline: none; transition: border-color 0.15s; }
  #${RICH_TOOLBAR_ID} input[type="text"]:focus { border-color: #f97316; box-shadow: 0 0 0 2px rgba(249, 115, 22, 0.15); }
  #${RICH_TOOLBAR_ID}.alloro-rich-toolbar-error { border-color: #dc2626; animation: alloro-rich-shake 0.3s ease-in-out; }
  @keyframes alloro-rich-shake { 25% { transform: translateX(-3px); } 75% { transform: translateX(3px); } }
  [data-alloro-editing="true"] * { pointer-events: auto !important; user-select: text !important; -webkit-user-select: text !important; }
`;

function ensureRichTextStyles(doc: Document) {
  if (doc.getElementById(RICH_STYLE_ID)) return;
  const style = doc.createElement("style");
  style.id = RICH_STYLE_ID;
  style.textContent = RICH_TEXT_CSS;
  doc.head.appendChild(style);
}
