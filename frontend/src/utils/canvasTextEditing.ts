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

type CanvasTextEditEligibility = {
  canEdit: boolean;
  reason?: string;
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
};

export function getCanvasTextEditEligibility(element: Element | null): CanvasTextEditEligibility {
  if (!(element instanceof HTMLElement)) {
    return { canEdit: false, reason: "This selection is not editable text." };
  }

  const tagName = element.tagName.toLowerCase();
  if (!CANVAS_TEXT_TAGS.has(tagName)) {
    return { canEdit: false, reason: "This element does not support canvas text editing." };
  }

  if (hasUnsafeNestedContent(element)) {
    return { canEdit: false, reason: "Use fallback text editing for nested content." };
  }

  return { canEdit: true };
}

function hasUnsafeNestedContent(element: HTMLElement): boolean {
  return Array.from(element.querySelectorAll("*")).some((child) => {
    const tagName = child.tagName.toLowerCase();
    return !SAFE_INLINE_TEXT_CHILD_TAGS.has(tagName);
  });
}

export function startCanvasTextEdit({
  element,
  onCommit,
  onCancel,
  onFinish,
}: CanvasTextEditOptions): CanvasTextEditSession | null {
  if (!(element instanceof HTMLElement)) return null;
  if (!getCanvasTextEditEligibility(element).canEdit) return null;

  const doc = element.ownerDocument;
  const originalRawText = element.textContent || "";
  const originalText = normalizeElementText(originalRawText);
  const originalContentEditable = element.getAttribute("contenteditable");
  const originalSpellcheck = element.getAttribute("spellcheck");
  const originalTabIndex = element.getAttribute("tabindex");
  let isFinished = false;

  const cleanup = () => {
    element.removeEventListener("blur", handleBlur);
    element.removeEventListener("keydown", handleKeyDown);
    element.removeEventListener("paste", handlePaste);
    element.removeEventListener("drop", handleDrop);
    element.removeEventListener("beforeinput", handleBeforeInput);
    restoreAttribute(element, "contenteditable", originalContentEditable);
    restoreAttribute(element, "spellcheck", originalSpellcheck);
    restoreAttribute(element, "tabindex", originalTabIndex);
    element.removeAttribute("data-alloro-editing");
    onFinish?.();
  };

  const finish = (shouldCommit: boolean) => {
    if (isFinished) return;
    isFinished = true;

    const nextText = normalizeElementText(element.textContent || "");
    cleanup();

    if (shouldCommit && nextText !== originalText && (nextText.trim() || !originalText.trim())) {
      element.textContent = originalRawText;
      onCommit(nextText);
      return;
    }

    element.textContent = originalRawText;
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
    insertPlainText(doc, event.clipboardData?.getData("text/plain") || "");
  }

  function handleDrop(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
  }

  function handleBeforeInput(event: InputEvent) {
    if (
      event.inputType === "insertParagraph" ||
      event.inputType === "insertLineBreak" ||
      event.inputType.startsWith("format")
    ) {
      event.preventDefault();
    }
  }

  element.setAttribute("contenteditable", "plaintext-only");
  element.setAttribute("spellcheck", "true");
  element.setAttribute("tabindex", originalTabIndex || "0");
  element.setAttribute("data-alloro-editing", "true");
  element.addEventListener("blur", handleBlur);
  element.addEventListener("keydown", handleKeyDown);
  element.addEventListener("paste", handlePaste);
  element.addEventListener("drop", handleDrop);
  element.addEventListener("beforeinput", handleBeforeInput);

  window.setTimeout(() => {
    element.focus({ preventScroll: true });
    selectElementText(element);
  }, 0);

  return {
    cancel: () => finish(false),
    commit: () => finish(true),
  };
}

function normalizeElementText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function insertPlainText(doc: Document, text: string) {
  const selection = doc.getSelection();
  if (!selection || selection.rangeCount === 0) return;

  const range = selection.getRangeAt(0);
  range.deleteContents();
  const node = doc.createTextNode(text);
  range.insertNode(node);
  range.setStartAfter(node);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}

function selectElementText(element: HTMLElement) {
  const doc = element.ownerDocument;
  const selection = doc.getSelection();
  const range = doc.createRange();
  range.selectNodeContents(element);
  selection?.removeAllRanges();
  selection?.addRange(range);
}

function restoreAttribute(element: HTMLElement, name: string, value: string | null) {
  if (value === null) {
    element.removeAttribute(name);
    return;
  }
  element.setAttribute(name, value);
}
