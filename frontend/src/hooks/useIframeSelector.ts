/**
 * useIframeSelector
 *
 * Extracted from ~/Desktop/dentist-landing-page/components/HtmlPreview.tsx.
 * Provides hover/click selection of alloro-tpl-* elements inside an iframe.
 *
 * Untagged basic content elements (headings, paragraphs, links, images, …)
 * inside a [data-alloro-section] wrapper are also selectable — they receive a
 * generated alloro-tpl-m-component-* class on click so the existing edit
 * pipeline (which keys off alloroClass) can drive them. Hover never assigns
 * a class. Header/footer content (LayoutEditor) has no section wrappers, so
 * its behavior is unchanged.
 *
 * Uses event delegation on the iframe body so listeners survive DOM mutations
 * (critical for live editing — we mutate the iframe DOM directly after LLM edits).
 */

import { useCallback, useRef, useState } from "react";
import {
  getCanvasTextEditEligibility,
  startCanvasTextEdit,
  type CanvasTextEditSession,
} from "../utils/canvasTextEditing";
import { startRichTextEdit, type RichTextEditSession } from "../utils/richTextEditing";

const ALLORO_PREFIX = "alloro-tpl-";

export interface SelectedInfo {
  alloroClass: string;
  label: string;
  friendlyName: string;
  tagName: string;
  type: "section" | "component";
  outerHtml: string;
  isHidden: boolean;
  href?: string;
  rect?: {
    top: number;
    left: number;
    width: number;
    height: number;
  };
  backgroundColor?: string;
  backgroundImage?: string;
  backgroundSize?: string;
  backgroundPosition?: string;
  canCanvasEditText?: boolean;
  textEditFallbackReason?: string;
}

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

/** Walk up from a target element to find the nearest alloro-classed ancestor (or self). */
function findAlloroElement(el: Element | null): Element | null {
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
function findAutoTagCandidate(el: Element | null): Element | null {
  while (el) {
    if (
      AUTO_TAG_ELIGIBLE_TAGS.has(el.tagName.toLowerCase()) &&
      el.closest("[data-alloro-section]")
    ) {
      return el;
    }
    el = el.parentElement;
  }
  return null;
}

/**
 * Resolve the effective hover target: alloro-classed ancestor first, then an
 * untagged auto-tag candidate. The candidate gets a synthetic component class
 * for label styling and precedence only — it is never written to the DOM
 * (hover must not mutate content that later gets persisted).
 */
function resolveHoverTarget(origin: Element): { target: Element; cls: string } | null {
  const tagged = findAlloroElement(origin);
  if (tagged) return { target: tagged, cls: getAlloroClass(tagged)! };
  const candidate = findAutoTagCandidate(origin);
  if (!candidate) return null;
  return {
    target: candidate,
    cls: `${ALLORO_PREFIX}m-component-${candidate.tagName.toLowerCase()}`,
  };
}

/**
 * Assign a generated component class to an untagged element so the existing
 * selection/edit pipeline (which queries `.${alloroClass}`) can drive it.
 * Idempotent — returns the existing alloro class when one is already present.
 * The "-component-" segment is load-bearing: isComponent() keys off it.
 */
function ensureGeneratedAlloroClass(el: Element, doc: Document): string {
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

function buildSelectedInfo(el: Element): SelectedInfo | null {
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
    canCanvasEditText: eligibility.canEdit,
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

/**
 * Quick action types that can be triggered from the iframe label.
 * "rich-text" is dispatched only from a rich edit session commit (sanitized
 * inline HTML) — it is never rendered as a label icon.
 */
export type QuickActionType = "text" | "rich-text" | "link" | "media" | "hide" | "text-up" | "text-down";

/** Payload emitted when a quick action with user input is submitted. */
export interface QuickActionPayload {
  action: QuickActionType;
  value?: string; // For text/link — the user-entered value; for rich-text — sanitized inline HTML
}

/** Inline SVG icons for quick action buttons (white stroke). */
const ACTION_ICONS: Record<string, string> = {
  text: `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/></svg>`,
  media: `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7"/><line x1="16" x2="22" y1="5" y2="5"/><line x1="19" x2="19" y1="2" y2="8"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>`,
  link: `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`,
  hide: `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49"/><path d="M14.084 14.158a3 3 0 0 1-4.242-4.242"/><path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143"/><path d="m2 2 20 20"/></svg>`,
  "text-up": `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><text x="2" y="16" font-size="14" font-weight="bold" fill="currentColor" stroke="none" font-family="sans-serif">A</text><line x1="18" y1="7" x2="18" y2="17"/><line x1="14" y1="12" x2="22" y2="12"/></svg>`,
  "text-down": `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><text x="2" y="16" font-size="14" font-weight="bold" fill="currentColor" stroke="none" font-family="sans-serif">A</text><line x1="14" y1="12" x2="22" y2="12"/></svg>`,
};

/** Arrow-right SVG for the submit button inside the inline input. */
const SUBMIT_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>`;

const TEXT_TAGS = new Set(["p", "span", "h1", "h2", "h3", "h4", "h5", "h6", "a", "button", "li", "blockquote", "figcaption"]);
const IMAGE_TAGS = new Set(["img", "video"]);
const LINK_TAGS = new Set(["a"]);

/** Build the list of quick action types available for a given tag. */
function getActionsForTag(tagName: string): QuickActionType[] {
  const actions: QuickActionType[] = [];
  if (TEXT_TAGS.has(tagName)) actions.push("text");
  if (TEXT_TAGS.has(tagName)) actions.push("text-up", "text-down");
  if (IMAGE_TAGS.has(tagName)) actions.push("media");
  if (LINK_TAGS.has(tagName)) actions.push("link");
  actions.push("hide");
  return actions;
}

/** CSS injected into the iframe to enable the selector UX. */
const SELECTOR_CSS = `
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
    outline-offset: 6px !important;
    user-select: text !important;
    -webkit-user-select: text !important;
  }

  [data-alloro-editing="true"]:focus {
    box-shadow: 0 0 0 4px rgba(214, 104, 83, 0.2) !important;
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
  [data-alloro-hover="true"] {
    outline: 2px dashed #3b82f6 !important;
    outline-offset: 6px !important;
  }

  /* Selected highlight */
  [data-alloro-selected="true"] {
    outline: 2px solid #2563eb !important;
    outline-offset: 6px !important;
  }

  /* Both hover and selected — selected wins */
  [data-alloro-selected="true"][data-alloro-hover="true"] {
    outline: 2px solid #2563eb !important;
  }

  [data-alloro-selected="true"][data-alloro-editing="true"] {
    outline-color: #d66853 !important;
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

export function useIframeSelector(
  iframeRef: React.RefObject<HTMLIFrameElement | null>,
  onQuickAction?: (payload: QuickActionPayload) => void
) {
  const [selectedInfo, setSelectedInfo] = useState<SelectedInfo | null>(null);
  const [isCanvasTextEditing, setIsCanvasTextEditing] = useState(false);
  const currentHoveredComponentRef = useRef<Element | null>(null);
  const canvasTextSessionRef = useRef<CanvasTextEditSession | RichTextEditSession | null>(null);
  const quickActionRef = useRef(onQuickAction);
  quickActionRef.current = onQuickAction;

  const clearSelection = useCallback(() => {
    canvasTextSessionRef.current?.cancel();
    canvasTextSessionRef.current = null;
    setIsCanvasTextEditing(false);
    setSelectedInfo(null);
    const doc = iframeRef.current?.contentDocument;
    if (!doc) return;
    delete doc.body.dataset.alloroCanvasEditing;
    doc
      .querySelectorAll("[data-alloro-selected]")
      .forEach((el) => el.removeAttribute("data-alloro-selected"));
    const selectedLabel = doc.getElementById("alloro-selected-label");
    if (selectedLabel) selectedLabel.remove();
    const actionPanel = doc.getElementById("alloro-action-panel");
    if (actionPanel) actionPanel.remove();
  }, [iframeRef]);

  const beginCanvasTextEditing = useCallback(
    (element?: Element | null) => {
      const doc = iframeRef.current?.contentDocument;
      const target = element || (selectedInfo
        ? doc?.querySelector(`.${CSS.escape(selectedInfo.alloroClass)}`)
        : null);
      if (!doc || !target) return false;

      const eligibility = getCanvasTextEditEligibility(target);
      if (!eligibility.canEdit) return false;

      canvasTextSessionRef.current?.cancel();
      doc.getElementById("alloro-hover-label")?.remove();
      doc.getElementById("alloro-action-panel")?.remove();
      doc.body.dataset.alloroCanvasEditing = "true";
      setIsCanvasTextEditing(true);

      const info = buildSelectedInfo(target);
      if (info) setSelectedInfo(info);

      const makeCommitHandler = (action: QuickActionType) => (value: string) => {
        delete doc.body.dataset.alloroCanvasEditing;
        setIsCanvasTextEditing(false);
        canvasTextSessionRef.current = null;
        quickActionRef.current?.({ action, value });
      };
      const sharedOptions = {
        element: target,
        onCancel: () => {
          const freshInfo = buildSelectedInfo(target);
          if (freshInfo) setSelectedInfo(freshInfo);
        },
        onFinish: () => {
          delete doc.body.dataset.alloroCanvasEditing;
          setIsCanvasTextEditing(false);
          canvasTextSessionRef.current = null;
        },
      };

      const session = eligibility.mode === "rich"
        ? startRichTextEdit({ ...sharedOptions, onCommit: makeCommitHandler("rich-text") })
        : startCanvasTextEdit({ ...sharedOptions, onCommit: makeCommitHandler("text") });

      canvasTextSessionRef.current = session;
      if (!session) {
        delete doc.body.dataset.alloroCanvasEditing;
        setIsCanvasTextEditing(false);
      }
      return Boolean(session);
    },
    [iframeRef, selectedInfo],
  );

  const setupListeners = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe?.contentDocument) return;
    const doc = iframe.contentDocument;

    // Inject selector CSS once per iframe document.
    if (!doc.getElementById("alloro-selector-styles")) {
      const style = doc.createElement("style");
      style.id = "alloro-selector-styles";
      style.textContent = SELECTOR_CSS;
      doc.head.appendChild(style);
    }

    if (doc.body.dataset.alloroSelectorReady === "true") return;
    doc.body.dataset.alloroSelectorReady = "true";

    // Remove any existing action input panel
    function hideActionPanel() {
      const panel = doc.getElementById("alloro-action-panel");
      if (panel) panel.remove();
    }

    // Show an inline text input panel below the selected label
    function showActionPanel(action: "text" | "link", labelEl: HTMLElement, href?: string) {
      hideActionPanel();

      const panel = doc.createElement("div");
      panel.id = "alloro-action-panel";

      const input = doc.createElement("input");
      input.type = "text";
      input.placeholder = action === "text" ? "Enter new text..." : "Enter URL...";
      if (action === "link" && href) input.value = href;

      const submitBtn = doc.createElement("button");
      submitBtn.className = "alloro-action-submit";
      submitBtn.innerHTML = SUBMIT_ICON;
      submitBtn.title = "Apply";

      const submit = () => {
        const val = input.value.trim();
        if (!val) return;
        quickActionRef.current?.({ action, value: val });
        hideActionPanel();
      };

      input.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter") { ev.preventDefault(); submit(); }
        if (ev.key === "Escape") { ev.preventDefault(); hideActionPanel(); }
        ev.stopPropagation();
      });
      // Prevent all key events from bubbling to the page
      input.addEventListener("keyup", (ev) => ev.stopPropagation());
      input.addEventListener("keypress", (ev) => ev.stopPropagation());
      submitBtn.addEventListener("click", (ev) => { ev.stopPropagation(); ev.preventDefault(); submit(); });

      panel.appendChild(input);
      panel.appendChild(submitBtn);
      doc.body.appendChild(panel);

      // Position below the label
      const labelRect = labelEl.getBoundingClientRect();
      const scrollTop = doc.documentElement.scrollTop || doc.body.scrollTop;
      const scrollLeft = doc.documentElement.scrollLeft || doc.body.scrollLeft;
      panel.style.top = (labelRect.bottom + scrollTop + 4) + "px";
      panel.style.left = (labelRect.left + scrollLeft) + "px";

      // Focus the input
      setTimeout(() => input.focus(), 0);
    }

    // Label helpers
    function showLabel(
      el: Element,
      cls: string,
      variant: "hover" | "selected"
    ) {
      const labelId =
        variant === "hover" ? "alloro-hover-label" : "alloro-selected-label";
      let label = doc.getElementById(labelId);
      if (!label) {
        label = doc.createElement("div");
        label.id = labelId;
        label.className = "alloro-label";
        doc.body.appendChild(label);
      }

      const elType = isComponent(cls) ? "component" : "section";
      const tagName = el.tagName.toLowerCase();

      // Build label content
      label.innerHTML = "";
      label.className =
        "alloro-label alloro-label--" +
        (variant === "selected" ? "selected-" : "") +
        elType;

      // Text span for the friendly name
      const textSpan = doc.createElement("span");
      textSpan.textContent = getFriendlyName(tagName);
      label.appendChild(textSpan);

      // Add action icons only for selected labels
      if (variant === "selected") {
        const actions = getActionsForTag(tagName);
        if (actions.length > 0) {
          const sep = doc.createElement("span");
          sep.className = "alloro-label-sep";
          label.appendChild(sep);

          const currentLabel = label; // capture for closure
          for (const action of actions) {
            const btn = doc.createElement("button");
            btn.className = "alloro-action-btn";
            btn.setAttribute("data-alloro-action", action);
            btn.innerHTML = ACTION_ICONS[action] || "";
            btn.title = action === "text" ? "Edit text"
              : action === "media" ? "Change image"
              : action === "link" ? "Change link"
              : action === "text-up" ? "Increase text size"
              : action === "text-down" ? "Decrease text size"
              : "Toggle visibility";
            btn.addEventListener("click", (ev) => {
              ev.stopPropagation();
              ev.preventDefault();
              if (action === "text-up" || action === "text-down") {
                quickActionRef.current?.({ action });
              } else if (action === "text") {
                if (!beginCanvasTextEditing(el)) {
                  showActionPanel(action, currentLabel);
                }
              } else if (action === "link") {
                // Show inline input below the label
                const hrefVal = action === "link"
                  ? (el.tagName.toLowerCase() === "a" ? (el as HTMLAnchorElement).getAttribute("href") || "" : "")
                  : undefined;
                showActionPanel(action, currentLabel, hrefVal || undefined);
              } else {
                // Media and hide — dispatch directly to parent
                quickActionRef.current?.({ action });
              }
            });
            label.appendChild(btn);
          }
        }
      }

      const rect = el.getBoundingClientRect();
      const scrollTop =
        doc.documentElement.scrollTop || doc.body.scrollTop;
      const scrollLeft =
        doc.documentElement.scrollLeft || doc.body.scrollLeft;
      label.style.position = "absolute";
      label.style.top = rect.top + scrollTop - 26 + "px";
      label.style.left = rect.left + scrollLeft + "px";
    }

    function hideLabel(variant: "hover" | "selected") {
      const labelId =
        variant === "hover" ? "alloro-hover-label" : "alloro-selected-label";
      const label = doc.getElementById(labelId);
      if (label) label.remove();
    }

    function isCanvasTextEditingActive() {
      return doc.body.dataset.alloroCanvasEditing === "true";
    }

    // Event delegation on the body — survives DOM mutations
    doc.body.addEventListener("mouseover", (e) => {
      if (isCanvasTextEditingActive()) return;
      const resolved = resolveHoverTarget(e.target as Element);
      if (!resolved) return;
      const { target, cls } = resolved;
      const elIsComponent = isComponent(cls);

      if (elIsComponent) {
        currentHoveredComponentRef.current = target;
        doc
          .querySelectorAll("[data-alloro-hover]")
          .forEach((el) => el.removeAttribute("data-alloro-hover"));
        target.setAttribute("data-alloro-hover", "true");
        showLabel(target, cls, "hover");
      } else {
        if (!currentHoveredComponentRef.current) {
          doc
            .querySelectorAll("[data-alloro-hover]")
            .forEach((el) => el.removeAttribute("data-alloro-hover"));
          target.setAttribute("data-alloro-hover", "true");
          showLabel(target, cls, "hover");
        }
      }
    });

    doc.body.addEventListener("mouseout", (e) => {
      if (isCanvasTextEditingActive()) return;
      const resolved = resolveHoverTarget(e.target as Element);
      if (!resolved) return;
      const { target, cls } = resolved;

      target.removeAttribute("data-alloro-hover");
      if (isComponent(cls)) {
        currentHoveredComponentRef.current = null;
        hideLabel("hover");
      } else {
        if (!currentHoveredComponentRef.current) {
          hideLabel("hover");
        }
      }
    });

    doc.body.addEventListener("click", (e) => {
      if (isCanvasTextEditingActive()) return;
      const clickTarget = e.target as Element;

      // Anchors are pointer-enabled inside sections — navigation must never
      // fire in the editor, whether the click lands on a selectable element
      // or not.
      if (clickTarget.closest?.("a")) e.preventDefault();

      // Ignore clicks on action buttons or the action input panel
      if (
        clickTarget.closest?.("#alloro-selected-label") ||
        clickTarget.closest?.("#alloro-action-panel")
      ) return;

      // Dismiss action panel on any other click
      hideActionPanel();

      let target = findAlloroElement(clickTarget);
      if (!target) {
        // Untagged content inside a section — tag it now so the existing
        // selection/edit pipeline can key off the class.
        const candidate = findAutoTagCandidate(clickTarget);
        if (!candidate) return;
        ensureGeneratedAlloroClass(candidate, doc);
        target = candidate;
      }
      const cls = getAlloroClass(target)!;
      const elIsComponent = isComponent(cls);

      if (elIsComponent) {
        e.stopPropagation();
      }
      e.preventDefault();

      // Clear previous selection
      doc
        .querySelectorAll("[data-alloro-selected]")
        .forEach((el) => el.removeAttribute("data-alloro-selected"));

      target.setAttribute("data-alloro-selected", "true");
      showLabel(target, cls, "selected");

      const info = buildSelectedInfo(target);
      if (info) setSelectedInfo(info);
      if (info?.canCanvasEditText) {
        window.setTimeout(() => beginCanvasTextEditing(target), 0);
      }
    });

    doc.body.addEventListener("dblclick", (e) => {
      if (isCanvasTextEditingActive()) return;
      let target = findAlloroElement(e.target as Element);
      if (!target) {
        // Untagged content inside a section — the preceding click normally
        // tags it already; this keeps dblclick safe on its own.
        const candidate = findAutoTagCandidate(e.target as Element);
        if (!candidate) return;
        ensureGeneratedAlloroClass(candidate, doc);
        target = candidate;
      }

      const info = buildSelectedInfo(target);
      if (!info?.canCanvasEditText) return;

      e.preventDefault();
      e.stopPropagation();
      doc
        .querySelectorAll("[data-alloro-selected]")
        .forEach((el) => el.removeAttribute("data-alloro-selected"));
      target.setAttribute("data-alloro-selected", "true");
      showLabel(target, info.alloroClass, "selected");
      setSelectedInfo(info);
      beginCanvasTextEditing(target);
    });
  }, [beginCanvasTextEditing, iframeRef]);

  const toggleHidden = useCallback(() => {
    if (!selectedInfo) return;
    const doc = iframeRef.current?.contentDocument;
    if (!doc) return;

    const el = doc.querySelector(`.${CSS.escape(selectedInfo.alloroClass)}`);
    if (!el) return;

    const isCurrentlyHidden = el.getAttribute("data-alloro-hidden") === "true";

    if (isCurrentlyHidden) {
      el.removeAttribute("data-alloro-hidden");
    } else {
      el.setAttribute("data-alloro-hidden", "true");
    }

    const info = buildSelectedInfo(el);
    setSelectedInfo(info ? { ...info, isHidden: !isCurrentlyHidden } : {
      ...selectedInfo,
      isHidden: !isCurrentlyHidden,
      outerHtml: (el as HTMLElement).outerHTML,
    });
  }, [iframeRef, selectedInfo]);

  return {
    selectedInfo,
    setSelectedInfo,
    clearSelection,
    setupListeners,
    toggleHidden,
    beginCanvasTextEditing,
    isCanvasTextEditing,
  };
}
