const CANVAS_TEXT_TAGS = new Set([
  "p",
  "span",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "a",
  "button",
  "li",
  "blockquote",
  "figcaption",
]);

const SAFE_INLINE_TEXT_CHILD_TAGS = new Set([
  "span",
  "br",
  "strong",
  "em",
  "b",
  "i",
  "u",
  "small",
  "sup",
  "sub",
  "mark",
  "wbr",
]);
const SAFE_INLINE_TEXT_CHILD_TAGS_SELECTOR = Array.from(SAFE_INLINE_TEXT_CHILD_TAGS).join(",");

export type CanvasTextEditEligibility = {
  canEdit: boolean;
  reason?: string;
  /** "plain" → textarea overlay (text-only commit); "rich" → contentEditable session (inline HTML commit). */
  mode?: "plain" | "rich";
};

export type CanvasTextEditSession = {
  cancel: () => void;
  commit: () => void;
};

type CanvasTextEditOptions = {
  element: Element;
  onCommit: (value: string) => void;
  onCancel?: () => void;
  onFinish?: () => void;
  /** Raw char offset into the element's text to place the caret at (else select all). */
  caretOffset?: number | null;
};

type StyleSnapshot = Array<{
  name: string;
  value: string;
  priority: string;
}>;

type ElementStyleSnapshot = {
  element: HTMLElement;
  styles: StyleSnapshot;
};

const CANVAS_EDITOR_ATTR = "data-alloro-canvas-editor";
const ELEMENT_STYLE_PROPS_TO_HIDE_TEXT = ["color", "-webkit-text-fill-color", "text-shadow"];

export function getCanvasTextEditEligibility(element: Element | null): CanvasTextEditEligibility {
  if (!(element instanceof HTMLElement)) {
    return { canEdit: false, reason: "This selection is not editable text." };
  }

  const tagName = element.tagName.toLowerCase();
  if (!CANVAS_TEXT_TAGS.has(tagName)) {
    return { canEdit: false, reason: "This element does not support canvas text editing." };
  }

  const childTags = Array.from(element.querySelectorAll("*")).map((child) =>
    child.tagName.toLowerCase(),
  );

  // Anything beyond plain-safe inline children (anchors, or any other nested
  // markup) routes to the contentEditable "rich" path: it edits the element
  // in place with a native caret and preserves structure, and the commit
  // sanitizer is the safety net for unsupported markup. Previously this
  // returned canEdit:false, which silently disabled inline editing for common
  // headings/paragraphs that carry a stray nested element.
  if (childTags.some((tagName) => !SAFE_INLINE_TEXT_CHILD_TAGS.has(tagName))) {
    return { canEdit: true, mode: "rich" };
  }

  return { canEdit: true, mode: "plain" };
}

export function startCanvasTextEdit({
  element,
  onCommit,
  onCancel,
  onFinish,
  caretOffset,
}: CanvasTextEditOptions): CanvasTextEditSession | null {
  if (!(element instanceof HTMLElement)) return null;
  // Plain mode only — rich-eligible elements (inline anchors) must go through
  // startRichTextEdit, otherwise replace-text would destroy their markup.
  if (getCanvasTextEditEligibility(element).mode !== "plain") return null;

  const doc = element.ownerDocument;
  const computed = doc.defaultView?.getComputedStyle(element);
  const originalText = normalizeElementText(element.textContent || "");
  const originalEditingAttr = element.getAttribute("data-alloro-editing");
  const textStyleTargets = getTextStyleTargets(element);
  const originalStyles = captureElementStyles(textStyleTargets);
  const textarea = createCanvasTextarea(doc, element, computed, originalText);
  let isFinished = false;

  const cleanup = () => {
    textarea.removeEventListener("blur", handleBlur);
    textarea.removeEventListener("keydown", handleKeyDown);
    textarea.removeEventListener("paste", handlePaste);
    textarea.removeEventListener("drop", handleDrop);
    textarea.removeEventListener("input", handleInput);
    textarea.remove();
    restoreAttribute(element, "data-alloro-editing", originalEditingAttr);
    restoreElementStyles(originalStyles);
    onFinish?.();
  };

  const finish = (shouldCommit: boolean) => {
    if (isFinished) return;
    isFinished = true;

    const nextText = normalizeElementText(textarea.value);
    cleanup();

    if (shouldCommit && nextText !== originalText && (nextText.trim() || !originalText.trim())) {
      onCommit(nextText);
      return;
    }

    onCancel?.();
  };

  function handleBlur() {
    window.setTimeout(() => finish(true), 0);
  }

  function handleKeyDown(event: KeyboardEvent) {
    event.stopPropagation();
    if (event.key === "Escape") {
      event.preventDefault();
      finish(false);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      finish(true);
    }
  }

  function handlePaste(event: ClipboardEvent) {
    event.preventDefault();
    event.stopPropagation();
    insertPlainText(textarea, event.clipboardData?.getData("text/plain") || "");
    resizeCanvasTextarea(textarea);
  }

  function handleDrop(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
  }

  function handleInput() {
    resizeCanvasTextarea(textarea);
  }

  element.setAttribute("data-alloro-editing", "true");
  hideElementText(textStyleTargets);

  textarea.addEventListener("blur", handleBlur);
  textarea.addEventListener("keydown", handleKeyDown);
  textarea.addEventListener("paste", handlePaste);
  textarea.addEventListener("drop", handleDrop);
  textarea.addEventListener("input", handleInput);
  doc.body.appendChild(textarea);

  window.setTimeout(() => {
    textarea.focus({ preventScroll: true });
    // Land the caret where the user clicked, mapping the raw DOM offset onto
    // the whitespace-collapsed textarea value. No offset → select all.
    if (caretOffset != null) {
      const prefix = (element.textContent || "")
        .slice(0, caretOffset)
        .replace(/\s+/g, " ")
        .replace(/^\s/, "");
      const pos = Math.max(0, Math.min(prefix.length, textarea.value.length));
      textarea.setSelectionRange(pos, pos);
    } else {
      textarea.select();
    }
    resizeCanvasTextarea(textarea);
  }, 0);

  return {
    cancel: () => finish(false),
    commit: () => finish(true),
  };
}

function normalizeElementText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function createCanvasTextarea(
  doc: Document,
  element: HTMLElement,
  computed: CSSStyleDeclaration | undefined,
  value: string,
) {
  const rect = element.getBoundingClientRect();
  const scrollTop = doc.documentElement.scrollTop || doc.body.scrollTop || 0;
  const scrollLeft = doc.documentElement.scrollLeft || doc.body.scrollLeft || 0;
  const textarea = doc.createElement("textarea");
  const lineHeight = parsePixelValue(computed?.lineHeight) || parsePixelValue(computed?.fontSize) * 1.2 || 24;

  textarea.setAttribute(CANVAS_EDITOR_ATTR, "true");
  textarea.setAttribute("aria-label", "Edit selected text");
  textarea.spellcheck = true;
  textarea.value = value;

  textarea.style.position = "absolute";
  textarea.style.zIndex = "100000";
  textarea.style.boxSizing = "border-box";
  textarea.style.top = `${rect.top + scrollTop}px`;
  textarea.style.left = `${rect.left + scrollLeft}px`;
  textarea.style.width = `${Math.max(rect.width, 96)}px`;
  textarea.style.minHeight = `${Math.max(rect.height, lineHeight, 36)}px`;
  textarea.style.margin = "0";
  textarea.style.resize = "none";
  textarea.style.overflow = "hidden";
  textarea.style.background = "rgba(255, 255, 255, 0.08)";
  textarea.style.border = "2px solid #d66853";
  textarea.style.outline = "none";
  textarea.style.boxShadow = "0 0 0 4px rgba(214, 104, 83, 0.2)";
  textarea.style.borderRadius = computed?.borderRadius && computed.borderRadius !== "0px"
    ? computed.borderRadius
    : "8px";
  textarea.style.color = computed?.color || "#111827";
  textarea.style.fontFamily = computed?.fontFamily || "inherit";
  textarea.style.fontSize = computed?.fontSize || "16px";
  textarea.style.fontWeight = computed?.fontWeight || "400";
  textarea.style.fontStyle = computed?.fontStyle || "normal";
  textarea.style.lineHeight = computed?.lineHeight || "1.4";
  textarea.style.letterSpacing = computed?.letterSpacing || "normal";
  textarea.style.textAlign = computed?.textAlign || "left";
  textarea.style.textTransform = computed?.textTransform || "none";
  textarea.style.padding = computed
    ? `${computed.paddingTop} ${computed.paddingRight} ${computed.paddingBottom} ${computed.paddingLeft}`
    : "0";

  return textarea;
}

function resizeCanvasTextarea(textarea: HTMLTextAreaElement) {
  textarea.style.height = "auto";
  textarea.style.height = `${Math.max(textarea.scrollHeight, parsePixelValue(textarea.style.minHeight))}px`;
}

function insertPlainText(textarea: HTMLTextAreaElement, text: string) {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  textarea.setRangeText(text, start, end, "end");
}

function getTextStyleTargets(element: HTMLElement): HTMLElement[] {
  return [
    element,
    ...Array.from(element.querySelectorAll(SAFE_INLINE_TEXT_CHILD_TAGS_SELECTOR))
      .filter((child): child is HTMLElement => child instanceof HTMLElement),
  ];
}

function restoreAttribute(element: HTMLElement, name: string, value: string | null) {
  if (value === null) {
    element.removeAttribute(name);
    return;
  }
  element.setAttribute(name, value);
}

function captureStyleProperties(element: HTMLElement, names: string[]): StyleSnapshot {
  return names.map((name) => ({
    name,
    value: element.style.getPropertyValue(name),
    priority: element.style.getPropertyPriority(name),
  }));
}

function captureElementStyles(elements: HTMLElement[]): ElementStyleSnapshot[] {
  return elements.map((element) => ({
    element,
    styles: captureStyleProperties(element, ELEMENT_STYLE_PROPS_TO_HIDE_TEXT),
  }));
}

function hideElementText(elements: HTMLElement[]) {
  for (const element of elements) {
    element.style.setProperty("color", "transparent", "important");
    element.style.setProperty("-webkit-text-fill-color", "transparent", "important");
    element.style.setProperty("text-shadow", "none", "important");
  }
}

function restoreElementStyles(snapshots: ElementStyleSnapshot[]) {
  for (const { element, styles } of snapshots) {
    restoreStyleProperties(element, styles);
  }
}

function restoreStyleProperties(element: HTMLElement, snapshot: StyleSnapshot) {
  for (const item of snapshot) {
    if (item.value) {
      element.style.setProperty(item.name, item.value, item.priority);
    } else {
      element.style.removeProperty(item.name);
    }
  }
}

function parsePixelValue(value: string | undefined): number {
  const parsed = Number.parseFloat(value || "");
  return Number.isFinite(parsed) ? parsed : 0;
}
