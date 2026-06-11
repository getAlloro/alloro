import type { MediaItem } from "../api/websiteMedia";
import { getFriendlyName } from "../hooks/useIframeSelector";
import type { SelectedInfo } from "../hooks/useIframeSelector";
import { getCanvasTextEditEligibility } from "./canvasTextEditing";
// Import-cycle note: richTextEditing imports normalizeEditorHref from this
// module. Both sides only call the other inside function bodies (no module-
// evaluation-time usage), so the ESM cycle is safe and tsc-clean.
import { sanitizeInlineHtml } from "./richTextEditing";

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
const IMAGE_ONLY_TAGS = new Set(["img"]);

export const BACKGROUND_SIZE_PRESETS = ["cover", "contain", "auto"] as const;
export const BACKGROUND_POSITION_PRESETS = [
  "center center",
  "top center",
  "bottom center",
  "center left",
  "center right",
] as const;

export type BackgroundSizePreset = (typeof BACKGROUND_SIZE_PRESETS)[number];
export type BackgroundPositionPreset = (typeof BACKGROUND_POSITION_PRESETS)[number];

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
  | { type: "replace-inline-html"; html: string }
  | { type: "update-link"; href: string }
  | { type: "replace-media"; media: MediaItem }
  | { type: "set-alt-text"; value: string }
  | { type: "step-font-size"; direction: "up" | "down" }
  | { type: "set-text-color"; color: string }
  | { type: "clear-text-color" }
  | { type: "set-font-family"; family: "serif" | "sans" | "reset" }
  | { type: "toggle-hidden" }
  | { type: "set-background-color"; color: string }
  | { type: "clear-background-color" }
  | { type: "set-background-image"; media: MediaItem }
  | { type: "clear-background-image" }
  | { type: "set-background-size"; size: BackgroundSizePreset }
  | { type: "set-background-position"; position: BackgroundPositionPreset };

export type DirectOperationAvailability = {
  canEditText: boolean;
  canEditCanvasText: boolean;
  canChangeMedia: boolean;
  canChangeLink: boolean;
  canAdjustTextSize: boolean;
  canToggleHidden: boolean;
  canEditBackground: boolean;
  canEditAltText: boolean;
  canStyleText: boolean;
};

export type DirectEditorOperationResult = {
  element: Element;
  selectedInfo: SelectedInfo;
  changed: boolean;
};

export function getDirectOperationAvailability(
  selectedInfo: SelectedInfo | null,
  hasMediaApi: boolean,
): DirectOperationAvailability {
  const tag = selectedInfo?.tagName || "";
  const canEditText = EDITOR_TEXT_TAGS.has(tag);

  return {
    canEditText,
    canEditCanvasText: Boolean(selectedInfo?.canCanvasEditText),
    canChangeMedia: EDITOR_MEDIA_TAGS.has(tag) && hasMediaApi,
    canChangeLink: EDITOR_LINK_TAGS.has(tag),
    canAdjustTextSize: canEditText,
    canToggleHidden: Boolean(selectedInfo),
    canEditBackground: selectedInfo?.type === "section",
    canEditAltText: tag === "img",
    canStyleText: canEditText,
  };
}

/** Current inline text color (hex) parsed from the selection's outerHTML. */
export function getSelectedTextColor(selectedInfo: SelectedInfo | null): string | null {
  if (!selectedInfo || !EDITOR_TEXT_TAGS.has(selectedInfo.tagName)) return null;

  const template = document.createElement("template");
  template.innerHTML = selectedInfo.outerHtml;
  const el = template.content.firstElementChild as HTMLElement | null;
  if (!el?.style.color) return null;
  return normalizeColorForInput(el.style.color);
}

/** Human-readable current text size (e.g. "Large") or "Default". */
export function getSelectedFontSizeLabel(selectedInfo: SelectedInfo | null): string {
  if (!selectedInfo || !EDITOR_TEXT_TAGS.has(selectedInfo.tagName)) return "Default";

  const template = document.createElement("template");
  template.innerHTML = selectedInfo.outerHtml;
  const el = template.content.firstElementChild;
  if (!el) return "Default";

  const cls = TEXT_SIZE_SCALE.find((c) => el.classList.contains(c));
  if (!cls) return "Default";
  return TEXT_SIZE_LABELS[cls] || cls.replace("text-", "");
}

const TEXT_SIZE_LABELS: Record<string, string> = {
  "text-xs": "XS",
  "text-sm": "Small",
  "text-base": "Base",
  "text-lg": "Large",
  "text-xl": "XL",
  "text-2xl": "2XL",
  "text-3xl": "3XL",
  "text-4xl": "4XL",
  "text-5xl": "5XL",
  "text-6xl": "6XL",
};

/** Current font-family override ("serif" | "sans") or null for theme default. */
export function getSelectedFontFamily(
  selectedInfo: SelectedInfo | null,
): "serif" | "sans" | null {
  if (!selectedInfo || !EDITOR_TEXT_TAGS.has(selectedInfo.tagName)) return null;

  const template = document.createElement("template");
  template.innerHTML = selectedInfo.outerHtml;
  const el = template.content.firstElementChild;
  if (!el) return null;
  if (el.classList.contains("font-serif")) return "serif";
  if (el.classList.contains("font-sans")) return "sans";
  return null;
}

/** Current alt attribute value parsed from the selection's outerHTML. */
export function getSelectedAltText(selectedInfo: SelectedInfo | null): string {
  if (!selectedInfo || selectedInfo.tagName !== "img") return "";

  const template = document.createElement("template");
  template.innerHTML = selectedInfo.outerHtml;
  return template.content.firstElementChild?.getAttribute("alt") || "";
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

export function getSelectedBackgroundColorValue(
  selectedInfo: SelectedInfo | null,
): string {
  return normalizeColorForInput(selectedInfo?.backgroundColor || "") || "#ffffff";
}

export function applyDirectEditorOperation(
  doc: Document,
  selectedInfo: SelectedInfo,
  operation: DirectEditorOperation,
): DirectEditorOperationResult {
  const element = findSelectedElement(doc, selectedInfo);
  const tagName = element.tagName.toLowerCase();
  const previousOuterHtml = element.outerHTML;

  switch (operation.type) {
    case "replace-text":
      assertTag(EDITOR_TEXT_TAGS, tagName, "Text replacement is not available for this element.");
      element.textContent = operation.value;
      break;
    case "replace-inline-html":
      assertTag(EDITOR_TEXT_TAGS, tagName, "Rich text replacement is not available for this element.");
      // Defense in depth — never trust the caller's markup; re-sanitize here.
      element.innerHTML = sanitizeInlineHtml(operation.html, element.ownerDocument);
      break;
    case "update-link":
      assertTag(EDITOR_LINK_TAGS, tagName, "Link editing is only available for links.");
      element.setAttribute("href", normalizeEditorHref(operation.href));
      break;
    case "replace-media":
      assertTag(EDITOR_MEDIA_TAGS, tagName, "Media replacement is only available for images and videos.");
      replaceMediaElement(element, operation.media);
      break;
    case "set-alt-text":
      assertTag(IMAGE_ONLY_TAGS, tagName, "Alt text is only available for images.");
      element.setAttribute("alt", operation.value.trim());
      break;
    case "step-font-size":
      assertTag(EDITOR_TEXT_TAGS, tagName, "Font size controls are not available for this element.");
      stepFontSize(element, operation.direction);
      break;
    case "set-text-color":
      assertTag(EDITOR_TEXT_TAGS, tagName, "Text color is not available for this element.");
      (element as HTMLElement).style.color = normalizeBackgroundColor(operation.color);
      break;
    case "clear-text-color":
      assertTag(EDITOR_TEXT_TAGS, tagName, "Text color is not available for this element.");
      (element as HTMLElement).style.removeProperty("color");
      break;
    case "set-font-family":
      assertTag(EDITOR_TEXT_TAGS, tagName, "Font family controls are not available for this element.");
      element.classList.remove("font-serif", "font-sans");
      if (operation.family !== "reset") {
        element.classList.add(`font-${operation.family}`);
      }
      break;
    case "toggle-hidden":
      toggleHiddenAttribute(element);
      break;
    case "set-background-color":
      assertSection(selectedInfo, "Background color is only available for sections.");
      setBackgroundColor(element, operation.color);
      break;
    case "clear-background-color":
      assertSection(selectedInfo, "Background color is only available for sections.");
      (element as HTMLElement).style.removeProperty("background-color");
      break;
    case "set-background-image":
      assertSection(selectedInfo, "Background image is only available for sections.");
      setBackgroundImage(element, operation.media);
      break;
    case "clear-background-image":
      assertSection(selectedInfo, "Background image is only available for sections.");
      clearBackgroundImage(element);
      break;
    case "set-background-size":
      assertSection(selectedInfo, "Background image controls are only available for sections.");
      setBackgroundSize(element, operation.size);
      break;
    case "set-background-position":
      assertSection(selectedInfo, "Background image controls are only available for sections.");
      setBackgroundPosition(element, operation.position);
      break;
  }

  return {
    element,
    selectedInfo: buildSelectedInfo(selectedInfo, element),
    changed: element.outerHTML !== previousOuterHtml,
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

function assertSection(selectedInfo: SelectedInfo, message: string) {
  if (selectedInfo.type !== "section") {
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

function setBackgroundColor(element: Element, color: string) {
  const normalized = normalizeBackgroundColor(color);
  (element as HTMLElement).style.backgroundColor = normalized;
}

function setBackgroundImage(element: Element, media: MediaItem) {
  if (!media.s3_url || !media.mime_type.startsWith("image/")) {
    throw new Error("Choose an image file for the section background.");
  }

  const style = (element as HTMLElement).style;
  style.backgroundImage = `url("${media.s3_url.replace(/"/g, "%22")}")`;
  if (!style.backgroundSize) style.backgroundSize = "cover";
  if (!style.backgroundPosition) style.backgroundPosition = "center center";
}

function clearBackgroundImage(element: Element) {
  const style = (element as HTMLElement).style;
  style.removeProperty("background-image");
  style.removeProperty("background-size");
  style.removeProperty("background-position");
}

function setBackgroundSize(element: Element, size: BackgroundSizePreset) {
  if (!BACKGROUND_SIZE_PRESETS.includes(size)) {
    throw new Error("That background size is not allowed.");
  }
  (element as HTMLElement).style.backgroundSize = size;
}

function setBackgroundPosition(element: Element, position: BackgroundPositionPreset) {
  if (!BACKGROUND_POSITION_PRESETS.includes(position)) {
    throw new Error("That background position is not allowed.");
  }
  (element as HTMLElement).style.backgroundPosition = position;
}

function normalizeBackgroundColor(color: string): string {
  const trimmed = color.trim();
  if (trimmed === "transparent") return trimmed;
  if (/^#[0-9a-f]{6}$/i.test(trimmed)) return trimmed;
  if (/^#[0-9a-f]{3}$/i.test(trimmed)) {
    return `#${trimmed[1]}${trimmed[1]}${trimmed[2]}${trimmed[2]}${trimmed[3]}${trimmed[3]}`;
  }
  throw new Error("Use a hex color or clear the background.");
}

function normalizeColorForInput(color: string): string | null {
  const trimmed = color.trim();
  if (/^#[0-9a-f]{6}$/i.test(trimmed)) return trimmed;
  if (/^#[0-9a-f]{3}$/i.test(trimmed)) {
    return `#${trimmed[1]}${trimmed[1]}${trimmed[2]}${trimmed[2]}${trimmed[3]}${trimmed[3]}`;
  }

  const rgbMatch = trimmed.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (!rgbMatch) return null;

  const [, red, green, blue] = rgbMatch;
  return `#${toHex(Number(red))}${toHex(Number(green))}${toHex(Number(blue))}`;
}

function toHex(value: number): string {
  return Math.max(0, Math.min(255, value)).toString(16).padStart(2, "0");
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
  const rect = element.getBoundingClientRect();
  const style = (element as HTMLElement).style;
  const canvasEligibility = getCanvasTextEditEligibility(element);
  const href =
    tagName === "a" ? element.getAttribute("href") || undefined : undefined;

  return {
    ...previous,
    friendlyName: getFriendlyName(tagName),
    tagName,
    outerHtml: element.outerHTML,
    isHidden: element.getAttribute("data-alloro-hidden") === "true",
    href,
    rect: {
      top: rect.top,
      left: rect.left,
      width: rect.width,
      height: rect.height,
    },
    backgroundColor: style.backgroundColor || "",
    backgroundImage: style.backgroundImage || "",
    backgroundSize: style.backgroundSize || "",
    backgroundPosition: style.backgroundPosition || "",
    canCanvasEditText: canvasEligibility.canEdit,
    textEditFallbackReason: canvasEligibility.reason,
  };
}
