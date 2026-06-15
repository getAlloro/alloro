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
import type { DirectEditorOperation } from "../utils/editorDirectOperations";
import {
  buildSelectedInfo,
  caretCharOffsetFromPoint,
  ensureGeneratedAlloroClass,
  findAlloroElement,
  findAutoTagCandidate,
  getAlloroClass,
  getComputedFontSizePx,
  isComponent,
  isFooterChrome,
  resolveHoverTarget,
  SELECTOR_CSS,
} from "./iframeSelector.utils";

// Re-export the pure helpers, the selector CSS, and the type contracts so
// existing consumers that import them from this module keep working unchanged
// after the behavior-preserving decomposition.
export {
  getAlloroClass,
  getFriendlyName,
  getReadableLabel,
  isComponent,
  prepareHtmlForPreview,
} from "./iframeSelector.utils";
export type {
  QuickActionPayload,
  QuickActionType,
  SelectedInfo,
  UseIframeSelectorOptions,
} from "./iframeSelector.types";

import type {
  QuickActionPayload,
  QuickActionType,
  SelectedInfo,
  UseIframeSelectorOptions,
} from "./iframeSelector.types";

export function useIframeSelector(
  iframeRef: React.RefObject<HTMLIFrameElement | null>,
  onQuickAction?: (payload: QuickActionPayload) => void,
  options?: UseIframeSelectorOptions
) {
  const sectionsOnly = options?.sectionsOnly ?? false;
  const [selectedInfo, setSelectedInfo] = useState<SelectedInfo | null>(null);
  // Mirror of selectedInfo so setupListeners (a stable callback) can re-apply
  // the on-canvas selection outline after an iframe (re)load without depending
  // on selectedInfo and re-attaching listeners on every selection.
  const selectedInfoRef = useRef<SelectedInfo | null>(null);
  selectedInfoRef.current = selectedInfo;
  const [isCanvasTextEditing, setIsCanvasTextEditing] = useState(false);
  const currentHoveredComponentRef = useRef<Element | null>(null);
  const canvasTextSessionRef = useRef<CanvasTextEditSession | RichTextEditSession | null>(null);
  // Mode + target of the active canvas session so the host can flush an
  // in-progress edit synchronously on Save/Publish.
  const activeCanvasModeRef = useRef<"plain" | "rich" | null>(null);
  const activeCanvasTargetRef = useRef<string | null>(null);
  const quickActionRef = useRef(onQuickAction);
  quickActionRef.current = onQuickAction;
  const onDirtyRef = useRef(options?.onDirty);
  onDirtyRef.current = options?.onDirty;

  const clearSelection = useCallback(() => {
    canvasTextSessionRef.current?.cancel();
    canvasTextSessionRef.current = null;
    setIsCanvasTextEditing(false);
    setSelectedInfo(null);
    const doc = iframeRef.current?.contentDocument;
    if (!doc) return;
    delete doc.body.dataset.alloroCanvasEditing;
    currentHoveredComponentRef.current = null;
    doc
      .querySelectorAll("[data-alloro-selected]")
      .forEach((el) => el.removeAttribute("data-alloro-selected"));
    doc
      .querySelectorAll("[data-alloro-hover]")
      .forEach((el) => el.removeAttribute("data-alloro-hover"));
    const hoverLabel = doc.getElementById("alloro-hover-label");
    if (hoverLabel) hoverLabel.remove();
    const selectedLabel = doc.getElementById("alloro-selected-label");
    if (selectedLabel) selectedLabel.remove();
    const actionPanel = doc.getElementById("alloro-action-panel");
    if (actionPanel) actionPanel.remove();
  }, [iframeRef]);

  const beginCanvasTextEditing = useCallback(
    (element?: Element | null, caretOffset?: number | null) => {
      const doc = iframeRef.current?.contentDocument;
      const target = element || (selectedInfo
        ? doc?.querySelector(`.${CSS.escape(selectedInfo.alloroClass)}`)
        : null);
      if (!doc || !target) return false;

      const eligibility = getCanvasTextEditEligibility(target);
      if (!eligibility.canEdit) return false;

      canvasTextSessionRef.current?.cancel();
      currentHoveredComponentRef.current = null;
      doc
        .querySelectorAll("[data-alloro-hover]")
        .forEach((el) => el.removeAttribute("data-alloro-hover"));
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
        // Pin the commit to the element this session edited so the host applies
        // it there regardless of what is selected when the deferred apply runs.
        quickActionRef.current?.({
          action,
          value,
          targetAlloroClass: getAlloroClass(target) || undefined,
        });
      };
      const targetAlloroClass = getAlloroClass(target);
      activeCanvasModeRef.current = eligibility.mode ?? null;
      activeCanvasTargetRef.current = targetAlloroClass ?? null;
      const syncDraftText = (value: string) => {
        // Typing should mark the editor dirty immediately so Save/Publish
        // appear before the session commits (on blur).
        onDirtyRef.current?.();
        if (!targetAlloroClass) return;
        setSelectedInfo((prev) =>
          prev?.alloroClass === targetAlloroClass
            ? { ...prev, draftText: value }
            : prev,
        );
      };
      const sharedOptions = {
        element: target,
        caretOffset,
        onChange: syncDraftText,
        onCancel: () => {
          const freshInfo = buildSelectedInfo(target);
          if (freshInfo) setSelectedInfo(freshInfo);
        },
        onFinish: () => {
          delete doc.body.dataset.alloroCanvasEditing;
          setIsCanvasTextEditing(false);
          canvasTextSessionRef.current = null;
          activeCanvasModeRef.current = null;
          activeCanvasTargetRef.current = null;
          // Clear the session's draft mirror — a stale draftText makes the
          // sidebar Content field snap back and drop keystrokes after a
          // commit (the commit path never rebuilds selectedInfo).
          setSelectedInfo((prev) =>
            prev?.alloroClass === targetAlloroClass && prev?.draftText !== undefined
              ? { ...prev, draftText: undefined }
              : prev,
          );
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
    let ignoreNextCanvasEditClick = false;

    // Remove any existing action input panel
    function hideActionPanel() {
      const panel = doc.getElementById("alloro-action-panel");
      if (panel) panel.remove();
    }

    // Label helpers
    function showLabel(...args: [Element, string, "hover" | "selected"]) {
      void args;
      // Intentionally no-op. The sidebar owns editing controls; canvas chrome
      // is limited to hover/selected outlines so it never overlaps content.
    }

    function hideLabel(variant: "hover" | "selected") {
      const labelId =
        variant === "hover" ? "alloro-hover-label" : "alloro-selected-label";
      const label = doc.getElementById(labelId);
      if (label) label.remove();
    }

    function clearHoverState() {
      currentHoveredComponentRef.current = null;
      doc
        .querySelectorAll("[data-alloro-hover]")
        .forEach((el) => el.removeAttribute("data-alloro-hover"));
      hideLabel("hover");
    }

    function isCanvasTextEditingActive() {
      return doc.body.dataset.alloroCanvasEditing === "true";
    }

    function isEditorChromeClick(target: Element) {
      return Boolean(
        target.closest?.("#alloro-selected-label") ||
          target.closest?.("#alloro-action-panel") ||
          target.closest?.("#alloro-rich-toolbar") ||
          target.closest?.('textarea[data-alloro-canvas-editor="true"]'),
      );
    }

    function resolveEditableClickTarget(clickTarget: Element): Element | null {
      // Shortcode pills (loops) are read-only placeholders — never selectable.
      if (clickTarget.closest?.("[data-alloro-shortcode]")) return null;
      if (isFooterChrome(clickTarget)) return null;

      // Content-first: the precise element under the cursor wins over any
      // tagged ancestor — tag it on demand so the edit pipeline can key off
      // the class. Container clicks (section padding, tagged cards) fall
      // back to the nearest alloro-tagged ancestor.
      let target = findAutoTagCandidate(clickTarget);
      if (target) {
        ensureGeneratedAlloroClass(target, doc);
        return target;
      }

      target = findAlloroElement(clickTarget);
      if (!target) return null;
      // Header/footer are Layout Editor territory in page editors.
      if (sectionsOnly && !target.closest("[data-alloro-section]")) return null;
      return target;
    }

    doc.body.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;
      const clickTarget = e.target as Element;
      if (isEditorChromeClick(clickTarget)) return;
      if (isCanvasTextEditingActive()) return;

      const target = resolveEditableClickTarget(clickTarget);
      if (!target) return;
      const info = buildSelectedInfo(target);
      if (!info?.canCanvasEditText) return;

      // Start text editing before Chrome's native mousedown/click focus path
      // can put focus back on the iframe or sidebar. Starting on click is too
      // late for the sandboxed preview: the session opens and immediately loses
      // its caret, leaving only the blue selected outline.
      e.preventDefault();
      e.stopPropagation();

      doc
        .querySelectorAll("[data-alloro-selected]")
        .forEach((el) => el.removeAttribute("data-alloro-selected"));
      clearHoverState();
      target.setAttribute("data-alloro-selected", "true");
      showLabel(target, info.alloroClass, "selected");
      setSelectedInfo(info);

      const caretOffset = caretCharOffsetFromPoint(doc, target, e.clientX, e.clientY);
      if (beginCanvasTextEditing(target, caretOffset)) {
        ignoreNextCanvasEditClick = true;
      }
    }, true);

    doc.body.addEventListener("mouseup", (e) => {
      if (!ignoreNextCanvasEditClick) return;
      const clickTarget = e.target as Element;
      if (!isEditorChromeClick(clickTarget) && !clickTarget.closest?.("[data-alloro-editing='true']")) return;

      e.preventDefault();
      e.stopPropagation();
    }, true);

    // Event delegation on the body — survives DOM mutations
    doc.body.addEventListener("mouseover", (e) => {
      if (isCanvasTextEditingActive()) {
        clearHoverState();
        return;
      }
      const resolved = resolveHoverTarget(e.target as Element, sectionsOnly);
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
      if (isCanvasTextEditingActive()) {
        clearHoverState();
        return;
      }
      const resolved = resolveHoverTarget(e.target as Element, sectionsOnly);
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
      const clickTarget = e.target as Element;

      if (ignoreNextCanvasEditClick) {
        ignoreNextCanvasEditClick = false;
        if (isCanvasTextEditingActive()) {
          e.preventDefault();
          e.stopPropagation();
          return;
        }
      }

      // A click while a canvas/rich session is active must COMMIT that session
      // (pinned to its own element via makeCommitHandler) and clear the flag
      // synchronously so THIS same click can re-select — instead of being
      // swallowed. The session's blur also schedules finish() a tick later;
      // that becomes a no-op via the isFinished guard.
      if (isCanvasTextEditingActive()) {
        if (isEditorChromeClick(clickTarget) || clickTarget.closest?.("[data-alloro-editing='true']")) {
          e.stopPropagation();
          return;
        }
        canvasTextSessionRef.current?.commit();
        canvasTextSessionRef.current = null;
        delete doc.body.dataset.alloroCanvasEditing;
      }

      // Anchors are pointer-enabled inside sections — navigation must never
      // fire in the editor, whether the click lands on a selectable element
      // or not.
      if (clickTarget.closest?.("a")) e.preventDefault();

      // Ignore clicks on action buttons or the action input panel
      if (isEditorChromeClick(clickTarget)) return;

      // Dismiss action panel on any other click
      hideActionPanel();
      clearHoverState();

      const target = resolveEditableClickTarget(clickTarget);
      if (!target) return;
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
        // Capture the caret offset now (element intact, no overlay yet) so the
        // edit caret lands exactly where the user clicked. Begin SYNCHRONOUSLY
        // (within the click gesture) so the iframe caret actually paints —
        // deferring with setTimeout focused outside the gesture and showed no
        // caret.
        const caretOffset = caretCharOffsetFromPoint(doc, target, e.clientX, e.clientY);
        beginCanvasTextEditing(target, caretOffset);
      }
    });

    doc.body.addEventListener("dblclick", (e) => {
      if (isCanvasTextEditingActive()) return;
      // Same content-first resolution as click; the preceding click normally
      // tags the element already — this keeps dblclick safe on its own.
      if ((e.target as Element).closest?.("[data-alloro-shortcode]")) return;
      let target = findAutoTagCandidate(e.target as Element);
      if (target) {
        ensureGeneratedAlloroClass(target, doc);
      } else {
        target = findAlloroElement(e.target as Element);
        if (!target) return;
        if (sectionsOnly && !target.closest("[data-alloro-section]")) return;
      }

      const info = buildSelectedInfo(target);
      if (!info?.canCanvasEditText) return;

      e.preventDefault();
      e.stopPropagation();
      doc
        .querySelectorAll("[data-alloro-selected]")
        .forEach((el) => el.removeAttribute("data-alloro-selected"));
      clearHoverState();
      target.setAttribute("data-alloro-selected", "true");
      showLabel(target, info.alloroClass, "selected");
      setSelectedInfo(info);
      beginCanvasTextEditing(target);
    });

    // Keep the selected element's rect live as the page scrolls so the React
    // popover tracks the element instead of floating in the viewport. The
    // in-iframe label is absolutely positioned and already scrolls with
    // content; this is only to sync the out-of-iframe overlay.
    let scrollRaf = 0;
    const handleScroll = () => {
      if (scrollRaf) return;
      scrollRaf = window.requestAnimationFrame(() => {
        scrollRaf = 0;
        const sel = doc.querySelector("[data-alloro-selected]");
        if (!sel) return;
        const r = sel.getBoundingClientRect();
        setSelectedInfo((prev) =>
          prev
            ? {
                ...prev,
                rect: { top: r.top, left: r.left, width: r.width, height: r.height },
              }
            : prev,
        );
      });
    };
    doc.addEventListener("scroll", handleScroll, true);
    doc.defaultView?.addEventListener("scroll", handleScroll, { passive: true });

    // Re-apply the selection outline after an iframe (re)load. Switching the
    // viewport toggle remounts the iframe (or swaps to a separate desktop/
    // mobile iframe) with a fresh DOM that has lost the `data-alloro-selected`
    // marker, even though selectedInfo — and the sidebar — persist. Without
    // this the element stays selected logically but shows no outline.
    const persisted = selectedInfoRef.current;
    if (persisted) {
      const selectedEl = doc.querySelector(`.${CSS.escape(persisted.alloroClass)}`);
      if (selectedEl) {
        selectedEl.setAttribute("data-alloro-selected", "true");
        // The new iframe renders at the new viewport width, so the element's
        // computed font size changes — refresh it so the size label reflects
        // what this breakpoint actually renders.
        const px = getComputedFontSizePx(selectedEl);
        setSelectedInfo((prev) =>
          prev && prev.alloroClass === persisted.alloroClass && prev.fontSizePx !== px
            ? { ...prev, fontSizePx: px }
            : prev,
        );
      }
    }
  }, [beginCanvasTextEditing, iframeRef, sectionsOnly]);

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

  // Synchronously capture an in-progress canvas edit so Save/Publish persist
  // it without the user first clicking away (the commit-on-blur is deferred,
  // so a Save click would otherwise read the pre-edit content). Returns the
  // edit to apply through the host's direct-edit pipeline, or null when no
  // session is active. Ends the session.
  const flushCanvasTextEdit = useCallback((): {
    operation: DirectEditorOperation;
    targetAlloroClass: string;
  } | null => {
    const session = canvasTextSessionRef.current;
    const mode = activeCanvasModeRef.current;
    const targetAlloroClass = activeCanvasTargetRef.current;
    if (!session || !mode || !targetAlloroClass) return null;
    const value = session.getValue();
    // Cancel (not commit) — the captured value is applied via the host below,
    // so cancel just restores the element to its pre-session markup and tears
    // the session down without firing the deferred commit path.
    session.cancel();
    const operation: DirectEditorOperation =
      mode === "rich"
        ? { type: "replace-inline-html", html: value }
        : { type: "replace-text", value };
    return { operation, targetAlloroClass };
  }, []);

  return {
    selectedInfo,
    setSelectedInfo,
    clearSelection,
    setupListeners,
    toggleHidden,
    beginCanvasTextEditing,
    flushCanvasTextEdit,
    isCanvasTextEditing,
  };
}
