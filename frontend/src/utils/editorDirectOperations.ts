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

// Block-level containers that can carry a background. Sections always
// qualify (by type); plain containers qualify by tag so a selected
// "Container" div gets the same background controls.
export const EDITOR_CONTAINER_TAGS = new Set([
  "div",
  "section",
  "header",
  "footer",
  "main",
  "article",
  "aside",
  "nav",
  "figure",
]);

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
  "text-7xl",
  "text-8xl",
  "text-9xl",
];

/** Approx rendered px for each scale step (Tailwind defaults at 16px root). */
const TEXT_SIZE_PX = [12, 14, 16, 18, 20, 24, 30, 36, 48, 60, 72, 96, 128];

function nearestScaleIndex(px: number): number {
  let best = 0;
  let bestDiff = Infinity;
  for (let i = 0; i < TEXT_SIZE_PX.length; i += 1) {
    const diff = Math.abs(TEXT_SIZE_PX[i] - px);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = i;
    }
  }
  return best;
}

/** Which breakpoint tier an edit targets. "mobile" writes the base (unprefixed)
 *  Tailwind class; "desktop" writes the `md:` variant — Tailwind is mobile-first,
 *  so base applies everywhere until a `md:` class overrides it ≥768px. The editor's
 *  375px mobile preview never triggers `md:`, so this is WYSIWYG. */
export type EditViewport = "mobile" | "desktop";

const TEXT_ALIGN_SCALE = ["text-left", "text-center", "text-right", "text-justify"];

// Every Tailwind responsive prefix, largest breakpoint first. Templates size
// text with whichever prefix they like (`sm:`/`lg:`/`xl:`…), so a desktop edit
// must consider ALL of them — handling only `md:` lets an existing `lg:text-*`
// silently override the change (the "font change not working" bug).
const RESPONSIVE_PREFIXES = ["2xl:", "xl:", "lg:", "md:", "sm:"];

/** The class from `group` that's effective for this tier. Desktop returns the
 *  highest-breakpoint responsive variant present (what actually wins on a wide
 *  screen), falling back to the base class; mobile (375px preview shows only
 *  base utilities) returns the base class. */
function readTierClass(
  el: Element,
  group: string[],
  viewport: EditViewport,
): string | null {
  if (viewport === "desktop") {
    for (const prefix of RESPONSIVE_PREFIXES) {
      const found = group.find((c) => el.classList.contains(`${prefix}${c}`));
      if (found) return found;
    }
  }
  return group.find((c) => el.classList.contains(c)) || null;
}

/** Set the active tier's class within `group`. Desktop edits collapse EVERY
 *  responsive variant in the group into a single `md:` class so it is the sole
 *  desktop override (no leftover `lg:`/`xl:` can win), while the base class —
 *  the mobile tier — is preserved. Mobile edits write the base class and clear
 *  only the base, leaving the desktop (`md:`) value intact. */
function setTierClass(
  el: Element,
  group: string[],
  value: string | null,
  viewport: EditViewport,
): void {
  if (viewport === "desktop") {
    group.forEach((c) =>
      RESPONSIVE_PREFIXES.forEach((p) => el.classList.remove(`${p}${c}`)),
    );
    if (value) el.classList.add(`md:${value}`);
    return;
  }
  group.forEach((c) => el.classList.remove(c));
  if (value) el.classList.add(value);
}

export type DirectEditorOperation =
  | { type: "replace-text"; value: string }
  | { type: "replace-inline-html"; html: string }
  | { type: "update-link"; href: string }
  | { type: "replace-media"; media: MediaItem }
  | { type: "set-alt-text"; value: string }
  | { type: "step-font-size"; direction: "up" | "down"; viewport?: EditViewport }
  | { type: "set-text-align"; align: "left" | "center" | "right" | "justify"; viewport?: EditViewport }
  | { type: "set-responsive-visibility"; visible: boolean; viewport?: EditViewport }
  | { type: "set-text-color"; color: string }
  | { type: "clear-text-color" }
  | { type: "set-font-family"; family: "serif" | "sans" | "reset" }
  | { type: "toggle-bold" }
  | { type: "toggle-italic" }
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
  canEditAlign: boolean;
  canEditResponsiveVisibility: boolean;
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
    canEditBackground:
      selectedInfo?.type === "section" || EDITOR_CONTAINER_TAGS.has(tag),
    canEditAltText: tag === "img",
    canStyleText: canEditText,
    canEditAlign: canEditText || EDITOR_CONTAINER_TAGS.has(tag),
    canEditResponsiveVisibility: Boolean(selectedInfo),
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
export function getSelectedFontSizeLabel(
  selectedInfo: SelectedInfo | null,
): string {
  if (!selectedInfo || !EDITOR_TEXT_TAGS.has(selectedInfo.tagName)) return "Default";

  // Use the size THAT'S ACTUALLY RENDERED at the current preview width — the
  // browser has already resolved which responsive class (base/md:/lg:/xl:) is
  // active, so the label matches what's on screen instead of guessing a
  // breakpoint that may not apply at the preview's width.
  if (selectedInfo.fontSizePx == null) return "Default";
  const token = TEXT_SIZE_SCALE[nearestScaleIndex(selectedInfo.fontSizePx)];
  return TEXT_SIZE_LABELS[token] || token.replace("text-", "").toUpperCase();
}

/** Active-tier text alignment ("left" | "center" | "right" | "justify") or
 *  null when none is set for that breakpoint. */
export function getSelectedTextAlign(
  selectedInfo: SelectedInfo | null,
  viewport: EditViewport = "desktop",
): "left" | "center" | "right" | "justify" | null {
  if (!selectedInfo) return null;
  const tag = selectedInfo.tagName;
  if (!EDITOR_TEXT_TAGS.has(tag) && !EDITOR_CONTAINER_TAGS.has(tag)) return null;

  const template = document.createElement("template");
  template.innerHTML = selectedInfo.outerHtml;
  const el = template.content.firstElementChild as HTMLElement | null;
  if (!el) return null;
  const cls = readTierClass(el, TEXT_ALIGN_SCALE, viewport);
  return cls ? (cls.replace("text-", "") as "left" | "center" | "right" | "justify") : null;
}

/** Whether the element is visible in the given tier (false = hidden there). */
export function getSelectedResponsiveVisibility(
  selectedInfo: SelectedInfo | null,
  viewport: EditViewport = "desktop",
): boolean {
  if (!selectedInfo) return true;
  const template = document.createElement("template");
  template.innerHTML = selectedInfo.outerHtml;
  const el = template.content.firstElementChild as HTMLElement | null;
  if (!el) return true;
  const cls = viewport === "desktop" ? "md:hidden" : "max-md:hidden";
  // A plain `hidden` (hidden everywhere) also reads as hidden in both tiers.
  return !el.classList.contains(cls) && !el.classList.contains("hidden");
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
  "text-7xl": "7XL",
  "text-8xl": "8XL",
  "text-9xl": "9XL",
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

function parseSelectedTextElement(
  selectedInfo: SelectedInfo | null,
): HTMLElement | null {
  if (!selectedInfo || !EDITOR_TEXT_TAGS.has(selectedInfo.tagName)) return null;
  const template = document.createElement("template");
  template.innerHTML = selectedInfo.outerHtml;
  return (template.content.firstElementChild as HTMLElement | null) || null;
}

/** Whether the selected text element renders bold (inline style or class). */
export function getSelectedBold(selectedInfo: SelectedInfo | null): boolean {
  const el = parseSelectedTextElement(selectedInfo);
  if (!el) return false;
  const weight = el.style.fontWeight;
  return weight === "bold" || weight === "700" || el.classList.contains("font-bold");
}

/** Whether the selected text element renders italic (inline style or class). */
export function getSelectedItalic(selectedInfo: SelectedInfo | null): boolean {
  const el = parseSelectedTextElement(selectedInfo);
  if (!el) return false;
  return el.style.fontStyle === "italic" || el.classList.contains("italic");
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
  if (selectedInfo.draftText !== undefined) return selectedInfo.draftText;

  const template = document.createElement("template");
  template.innerHTML = selectedInfo.outerHtml;
  const text = template.content.firstElementChild?.textContent || "";
  return text.replace(/\s+/g, " ").replace(/^\s+/, "");
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
      stepFontSize(element, operation.direction, operation.viewport ?? "desktop");
      break;
    case "set-text-align": {
      const alignable =
        EDITOR_TEXT_TAGS.has(tagName) || EDITOR_CONTAINER_TAGS.has(tagName);
      if (!alignable) {
        throw new Error("Text alignment is not available for this element.");
      }
      setTierClass(
        element,
        TEXT_ALIGN_SCALE,
        `text-${operation.align}`,
        operation.viewport ?? "desktop",
      );
      break;
    }
    case "set-responsive-visibility":
      setResponsiveVisibility(
        element,
        operation.visible,
        operation.viewport ?? "desktop",
      );
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
    case "toggle-bold":
      assertTag(EDITOR_TEXT_TAGS, tagName, "Bold is not available for this element.");
      toggleBold(element as HTMLElement);
      break;
    case "toggle-italic":
      assertTag(EDITOR_TEXT_TAGS, tagName, "Italic is not available for this element.");
      toggleItalic(element as HTMLElement);
      break;
    case "toggle-hidden":
      toggleHiddenAttribute(element);
      break;
    case "set-background-color":
      assertBackgroundEligible(selectedInfo, tagName, "Background color is only available for sections and containers.");
      setBackgroundColor(element, operation.color);
      break;
    case "clear-background-color":
      assertBackgroundEligible(selectedInfo, tagName, "Background color is only available for sections and containers.");
      (element as HTMLElement).style.removeProperty("background-color");
      break;
    case "set-background-image":
      assertBackgroundEligible(selectedInfo, tagName, "Background image is only available for sections and containers.");
      setBackgroundImage(element, operation.media);
      break;
    case "clear-background-image":
      assertBackgroundEligible(selectedInfo, tagName, "Background image is only available for sections and containers.");
      clearBackgroundImage(element);
      break;
    case "set-background-size":
      assertBackgroundEligible(selectedInfo, tagName, "Background image controls are only available for sections and containers.");
      setBackgroundSize(element, operation.size);
      break;
    case "set-background-position":
      assertBackgroundEligible(selectedInfo, tagName, "Background image controls are only available for sections and containers.");
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

function assertBackgroundEligible(
  selectedInfo: SelectedInfo,
  tagName: string,
  message: string,
) {
  if (selectedInfo.type !== "section" && !EDITOR_CONTAINER_TAGS.has(tagName)) {
    throw new Error(message);
  }
}

const FONT_WEIGHT_CLASSES = [
  "font-thin", "font-extralight", "font-light", "font-normal",
  "font-medium", "font-semibold", "font-bold", "font-extrabold", "font-black",
];

/** Toggle bold via inline style (robust against Tailwind purge), normalizing
 *  any pre-existing weight class so the result is unambiguous. */
function toggleBold(element: HTMLElement) {
  const isBold =
    element.style.fontWeight === "bold" ||
    element.style.fontWeight === "700" ||
    element.classList.contains("font-bold");
  FONT_WEIGHT_CLASSES.forEach((cls) => element.classList.remove(cls));
  if (isBold) element.style.removeProperty("font-weight");
  else element.style.fontWeight = "bold";
}

/** Toggle italic via inline style, clearing any italic/not-italic class. */
function toggleItalic(element: HTMLElement) {
  const isItalic =
    element.style.fontStyle === "italic" || element.classList.contains("italic");
  element.classList.remove("italic", "not-italic");
  if (isItalic) element.style.removeProperty("font-style");
  else element.style.fontStyle = "italic";
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

function stepFontSize(
  element: Element,
  direction: "up" | "down",
  viewport: EditViewport,
) {
  // Step from the size THAT'S ACTUALLY RENDERED at the current preview width
  // (computed), not from a guessed responsive class — so the step matches the
  // label and what's on screen. mobile writes the base class, desktop writes
  // `md:text-*` (setTierClass collapses any other responsive variant into it),
  // so the two breakpoints keep independent, unambiguous sizes.
  const el = element as HTMLElement;
  const win = el.ownerDocument.defaultView;
  const px = win ? parseFloat(win.getComputedStyle(el).fontSize) : NaN;
  const index = nearestScaleIndex(Number.isFinite(px) ? px : 16);
  const nextIndex =
    direction === "up"
      ? Math.min(index + 1, TEXT_SIZE_SCALE.length - 1)
      : Math.max(index - 1, 0);

  // An inline font-size from an earlier session overrides classes at every
  // breakpoint — drop it so the chosen class actually renders.
  el.style.removeProperty("font-size");
  setTierClass(el, TEXT_SIZE_SCALE, TEXT_SIZE_SCALE[nextIndex], viewport);
}

/** Responsive show/hide for the active tier. Mobile → `max-md:hidden` (hidden
 *  below 768px); desktop → `md:hidden` (hidden at/above 768px). Independent
 *  classes, so each breakpoint toggles without disturbing the other or the
 *  element's natural display. */
function setResponsiveVisibility(
  element: Element,
  visible: boolean,
  viewport: EditViewport,
) {
  const cls = viewport === "desktop" ? "md:hidden" : "max-md:hidden";
  if (visible) element.classList.remove(cls);
  else element.classList.add(cls);
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
  const win = element.ownerDocument.defaultView;
  const computedPx = win
    ? parseFloat(win.getComputedStyle(element).fontSize)
    : NaN;

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
    fontSizePx: Number.isFinite(computedPx) ? computedPx : undefined,
    canCanvasEditText: canvasEligibility.canEdit,
    canvasTextEditMode: canvasEligibility.mode,
    textEditFallbackReason: canvasEligibility.reason,
  };
}
