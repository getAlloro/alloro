import type { MediaItem } from "../api/websiteMedia";
import { getFriendlyName } from "../hooks/useIframeSelector";
import type { SelectedInfo } from "../hooks/useIframeSelector";

export const EDITOR_TEXT_TAGS = new Set([
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

export const EDITOR_MEDIA_TAGS = new Set(["img", "video"]);
export const EDITOR_LINK_TAGS = new Set(["a"]);

const TEXT_SIZE_SCALE = [
  "text-xs",
  "text-sm",
  "text-base",
  "text-lg",
  "text-xl",
  "text-2xl",
  "text-3xl",
  "text-4xl",
  "text-5xl",
  "text-6xl",
];

export type DirectEditorOperation =
  | { type: "replace-text"; value: string }
  | { type: "update-link"; href: string }
  | { type: "replace-media"; media: MediaItem }
  | { type: "step-font-size"; direction: "up" | "down" }
  | { type: "toggle-hidden" };

export type DirectOperationAvailability = {
  canEditText: boolean;
  canChangeMedia: boolean;
  canChangeLink: boolean;
  canAdjustTextSize: boolean;
  canToggleHidden: boolean;
};

export type DirectEditorOperationResult = {
  element: Element;
  selectedInfo: SelectedInfo;
};

export function getDirectOperationAvailability(
  selectedInfo: SelectedInfo | null,
  hasMediaApi: boolean,
): DirectOperationAvailability {
  const tag = selectedInfo?.tagName || "";
  const canEditText = EDITOR_TEXT_TAGS.has(tag);

  return {
    canEditText,
    canChangeMedia: EDITOR_MEDIA_TAGS.has(tag) && hasMediaApi,
    canChangeLink: EDITOR_LINK_TAGS.has(tag),
    canAdjustTextSize: canEditText,
    canToggleHidden: Boolean(selectedInfo),
  };
}

export function getSelectedTextValue(selectedInfo: SelectedInfo | null): string {
  if (!selectedInfo || !EDITOR_TEXT_TAGS.has(selectedInfo.tagName)) return "";

  const template = document.createElement("template");
  template.innerHTML = selectedInfo.outerHtml;
  const text = template.content.firstElementChild?.textContent || "";
  return text.replace(/\s+/g, " ").trim();
}

export function normalizeEditorHref(rawHref: string): string {
  const href = rawHref.trim();
  if (!href) {
    throw new Error("Enter a URL before applying the link edit.");
  }

  if (hasControlCharacter(href)) {
    throw new Error("Link URLs cannot contain control characters.");
  }

  const compactHref = href.replace(/\s+/g, "");
  if (/^(javascript|data|vbscript|file|blob):/i.test(compactHref)) {
    throw new Error("That link protocol is not allowed.");
  }

  if (/^(https?:|mailto:|tel:)/i.test(href)) return href;
  if (/^(#|\/|\?|\.\/|\.\.\/)/.test(href)) return href;

  if (/^[a-z][a-z0-9+.-]*:/i.test(href)) {
    throw new Error("That link protocol is not allowed.");
  }

  if (/^[\w.-]+\.[a-z]{2,}([/:?#].*)?$/i.test(href)) {
    return `https://${href}`;
  }

  return href;
}

export function applyDirectEditorOperation(
  doc: Document,
  selectedInfo: SelectedInfo,
  operation: DirectEditorOperation,
): DirectEditorOperationResult {
  const element = findSelectedElement(doc, selectedInfo);
  const tagName = element.tagName.toLowerCase();

  switch (operation.type) {
    case "replace-text":
      assertTag(EDITOR_TEXT_TAGS, tagName, "Text replacement is not available for this element.");
      element.textContent = operation.value;
      break;
    case "update-link":
      assertTag(EDITOR_LINK_TAGS, tagName, "Link editing is only available for links.");
      element.setAttribute("href", normalizeEditorHref(operation.href));
      break;
    case "replace-media":
      assertTag(EDITOR_MEDIA_TAGS, tagName, "Media replacement is only available for images and videos.");
      replaceMediaElement(element, operation.media);
      break;
    case "step-font-size":
      assertTag(EDITOR_TEXT_TAGS, tagName, "Font size controls are not available for this element.");
      stepFontSize(element, operation.direction);
      break;
    case "toggle-hidden":
      toggleHiddenAttribute(element);
      break;
  }

  return {
    element,
    selectedInfo: buildSelectedInfo(selectedInfo, element),
  };
}

function findSelectedElement(doc: Document, selectedInfo: SelectedInfo): Element {
  const element = doc.querySelector(`.${CSS.escape(selectedInfo.alloroClass)}`);
  if (!element) {
    throw new Error("The selected element could not be found in the editor preview.");
  }
  return element;
}

function assertTag(allowedTags: Set<string>, tagName: string, message: string) {
  if (!allowedTags.has(tagName)) {
    throw new Error(message);
  }
}

function hasControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 31 || code === 127) return true;
  }
  return false;
}

function replaceMediaElement(element: Element, media: MediaItem) {
  if (!media.s3_url) {
    throw new Error("Selected media is missing a usable URL.");
  }

  const tagName = element.tagName.toLowerCase();

  if (tagName === "img") {
    if (!media.mime_type.startsWith("image/")) {
      throw new Error("Choose an image file for this element.");
    }

    element.setAttribute("src", media.s3_url);
    element.removeAttribute("srcset");
    element.removeAttribute("sizes");
    element.setAttribute("alt", media.alt_text || media.display_name || "");

    const picture = element.closest("picture");
    picture?.querySelectorAll("source").forEach((source) => {
      source.removeAttribute("srcset");
      source.removeAttribute("sizes");
    });
    return;
  }

  if (tagName === "video") {
    if (!media.mime_type.startsWith("video/")) {
      throw new Error("Choose a video file for this element.");
    }

    element.setAttribute("src", media.s3_url);
    element.querySelectorAll("source").forEach((source) => {
      source.setAttribute("src", media.s3_url);
      source.setAttribute("type", media.mime_type);
    });
    return;
  }

  throw new Error("Selected element is not a replaceable media element.");
}

function stepFontSize(element: Element, direction: "up" | "down") {
  const currentSizeClass = TEXT_SIZE_SCALE.find((cls) =>
    element.classList.contains(cls),
  );
  const currentIndex = currentSizeClass ? TEXT_SIZE_SCALE.indexOf(currentSizeClass) : 2;
  const nextIndex =
    direction === "up"
      ? Math.min(currentIndex + 1, TEXT_SIZE_SCALE.length - 1)
      : Math.max(currentIndex - 1, 0);

  if (currentSizeClass) element.classList.remove(currentSizeClass);
  element.classList.add(TEXT_SIZE_SCALE[nextIndex]);
}

function toggleHiddenAttribute(element: Element) {
  if (element.getAttribute("data-alloro-hidden") === "true") {
    element.removeAttribute("data-alloro-hidden");
    return;
  }

  element.setAttribute("data-alloro-hidden", "true");
}

function buildSelectedInfo(
  previous: SelectedInfo,
  element: Element,
): SelectedInfo {
  const tagName = element.tagName.toLowerCase();
  const href =
    tagName === "a" ? element.getAttribute("href") || undefined : undefined;

  return {
    ...previous,
    friendlyName: getFriendlyName(tagName),
    tagName,
    outerHtml: element.outerHTML,
    isHidden: element.getAttribute("data-alloro-hidden") === "true",
    href,
  };
}
