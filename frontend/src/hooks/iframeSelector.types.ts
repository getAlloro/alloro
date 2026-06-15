/**
 * Type contracts for useIframeSelector.
 *
 * Extracted verbatim from useIframeSelector.ts during a behavior-preserving
 * decomposition — no shape changes. The hook re-exports these so existing
 * consumers (which import them from ../hooks/useIframeSelector) keep working
 * unchanged.
 */

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
  /** Rendered font size (px) at the current preview width — the size label
   *  reads this so it matches what's actually on screen rather than guessing
   *  which responsive class is active. */
  fontSizePx?: number;
  canCanvasEditText?: boolean;
  /** "plain" = textarea overlay (text-only commit); "rich" = contentEditable
   * (markup-preserving). The sidebar uses this to gate replace-text, which
   * would flatten a rich element's inline children. */
  canvasTextEditMode?: "plain" | "rich";
  textEditFallbackReason?: string;
  draftText?: string;
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
  /**
   * The alloro class of the element the edit targets, captured when the
   * session started. Lets the host apply the commit against THAT element even
   * if the selection has already moved on (committing element A while
   * re-selecting element B in the same click). Without this the deferred apply
   * resolves against the live selection and writes A's text into B.
   */
  targetAlloroClass?: string;
}

export type UseIframeSelectorOptions = {
  /**
   * Restrict selection to elements inside [data-alloro-section] — page
   * editors set this so header/footer (Layout Editor territory) can't be
   * selected. Shortcode pills are always excluded regardless.
   */
  sectionsOnly?: boolean;
  /** Fired on every canvas-text keystroke so the host can mark the editor
   *  dirty immediately (Save/Publish appear) instead of only on commit. */
  onDirty?: () => void;
};
