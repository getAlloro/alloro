import { useEffect, useRef, useState } from "react";
import { Eye, EyeOff, ImagePlus, Minus, Plus } from "lucide-react";
import type { SelectedInfo, QuickActionType } from "../../hooks/useIframeSelector";
import {
  getDirectOperationAvailability,
  getSelectedTextValue,
  getSelectedAltText,
  getSelectedFontSizeLabel,
  type DirectEditorOperation,
} from "../../utils/editorDirectOperations";
import MediaBrowser from "./MediaBrowser";
import TextStyleControls from "./TextStyleControls";
import type { MediaApi, MediaItem } from "./MediaBrowser";

export type SelectedElementEditorPanelProps = {
  selectedInfo: SelectedInfo;
  isEditing: boolean;
  mediaApi?: MediaApi;
  externalAction?: QuickActionType | null;
  onExternalActionHandled?: () => void;
  onApplyDirectEdit: (operation: DirectEditorOperation) => void;
  onToggleHidden?: () => void;
  /** True while an in-canvas text session is active — the sidebar must not steal focus. */
  isCanvasTextEditing?: boolean;
  /** Deprecated: text edits are now applied immediately through onApplyDirectEdit. */
  onLiveTextPreview?: (value: string) => void;
  /** Deprecated: text edits are now applied immediately and are not reverted on unmount. */
  onLiveTextRevert?: () => void;
  /** Brand colors for the text-style swatches. */
  primaryColor?: string | null;
  accentColor?: string | null;
};

const LABEL_CLS = "text-[10px] font-bold uppercase tracking-wider text-gray-400";
const FIELD_CLS =
  "w-full rounded-lg border border-gray-200 bg-[var(--ec-raised)] px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-alloro-orange focus:ring-2 focus:ring-alloro-orange/20 disabled:opacity-50";
const APPLY_CLS =
  "inline-flex items-center justify-center gap-1.5 rounded-lg bg-alloro-orange px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-alloro-orange/90 disabled:opacity-30";
const STEP_CLS =
  "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-600 transition hover:bg-gray-200 disabled:opacity-40";

export default function SelectedElementEditorPanel({
  selectedInfo,
  isEditing,
  mediaApi,
  externalAction,
  onExternalActionHandled,
  onApplyDirectEdit,
  onToggleHidden,
  isCanvasTextEditing = false,
  primaryColor,
  accentColor,
}: SelectedElementEditorPanelProps) {
  const [textValue, setTextValue] = useState("");
  const [linkValue, setLinkValue] = useState("");
  const [altValue, setAltValue] = useState("");
  const [showMedia, setShowMedia] = useState(false);
  const textAreaRef = useRef<HTMLTextAreaElement>(null);
  const linkInputRef = useRef<HTMLInputElement>(null);

  const {
    canEditText,
    canChangeMedia,
    canChangeLink,
    canAdjustTextSize,
    canEditAltText,
    canStyleText,
  } = getDirectOperationAvailability(selectedInfo, Boolean(mediaApi));

  // Hydrate every field from the freshly-selected element.
  useEffect(() => {
    setTextValue(getSelectedTextValue(selectedInfo));
    setLinkValue(selectedInfo.href || "");
    setAltValue(getSelectedAltText(selectedInfo));
    setShowMedia(false);
  }, [selectedInfo]);

  // The sidebar Content field must never grab focus when the element can be
  // edited directly on the page — focusing here blurs (and ends) that on-page
  // caret session. Only auto-focus the sidebar for text that can't be edited
  // in-canvas (e.g. nested-content elements that fall back to the sidebar).
  const isCanvasEditingRef = useRef(isCanvasTextEditing);
  isCanvasEditingRef.current = isCanvasTextEditing;
  useEffect(() => {
    if (
      isCanvasTextEditing ||
      selectedInfo.canCanvasEditText ||
      !canEditText
    ) {
      return;
    }
    const id = window.setTimeout(() => {
      if (isCanvasEditingRef.current) return;
      textAreaRef.current?.focus();
    }, 50);
    return () => window.clearTimeout(id);
  }, [
    selectedInfo.alloroClass,
    selectedInfo.canCanvasEditText,
    canEditText,
    isCanvasTextEditing,
  ]);

  // Quick-actions dispatched from the iframe label icons.
  useEffect(() => {
    if (!externalAction) return;
    if (externalAction === "hide") {
      if (onToggleHidden) onToggleHidden();
      else onApplyDirectEdit({ type: "toggle-hidden" });
    } else if (externalAction === "text-up" || externalAction === "text-down") {
      onApplyDirectEdit({
        type: "step-font-size",
        direction: externalAction === "text-up" ? "up" : "down",
      });
    } else if (externalAction === "text") {
      textAreaRef.current?.focus();
    } else if (externalAction === "link") {
      linkInputRef.current?.focus();
    } else if (externalAction === "media") {
      setShowMedia(true);
    }
    onExternalActionHandled?.();
  }, [externalAction, onApplyDirectEdit, onExternalActionHandled, onToggleHidden]);

  const handleTextInput = (value: string) => {
    setTextValue(value);
    onApplyDirectEdit({ type: "replace-text", value });
  };
  const applyLink = () => {
    const href = linkValue.trim();
    if (!href) return;
    onApplyDirectEdit({ type: "update-link", href });
  };
  const applyAlt = () => onApplyDirectEdit({ type: "set-alt-text", value: altValue });
  const handleMediaSelect = (media: MediaItem) => {
    onApplyDirectEdit({ type: "replace-media", media });
    setShowMedia(false);
  };
  const stepFontSize = (direction: "up" | "down") =>
    onApplyDirectEdit({ type: "step-font-size", direction });

  return (
    <div className="flex flex-col gap-5 border-b border-gray-200 bg-gray-50 px-5 py-4">
      {/* Element header */}
      <div className="flex items-center justify-between">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={`h-2 w-2 shrink-0 rounded-full ${selectedInfo.type === "section" ? "bg-purple-400" : "bg-[var(--ec-cobalt)]"}`}
          />
          <span className="text-sm font-semibold text-gray-900">
            {selectedInfo.friendlyName}
          </span>
          {selectedInfo.isHidden && (
            <span className="shrink-0 rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-600">
              Hidden
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() =>
            onToggleHidden
              ? onToggleHidden()
              : onApplyDirectEdit({ type: "toggle-hidden" })
          }
          aria-label={selectedInfo.isHidden ? "Show element" : "Hide element"}
          title={selectedInfo.isHidden ? "Show element" : "Hide element"}
          className="flex h-9 items-center gap-1.5 rounded-lg bg-gray-100 px-3 text-xs font-semibold text-gray-600 transition hover:bg-gray-200"
        >
          {selectedInfo.isHidden ? (
            <Eye className="h-3.5 w-3.5" />
          ) : (
            <EyeOff className="h-3.5 w-3.5" />
          )}
          {selectedInfo.isHidden ? "Show" : "Hide"}
        </button>
      </div>

      {/* Content (editable text) */}
      {canEditText && (
        <section className="space-y-1.5">
          <p className={LABEL_CLS}>Content</p>
          <textarea
            ref={textAreaRef}
            value={textValue}
            onChange={(e) => handleTextInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setTextValue(getSelectedTextValue(selectedInfo));
            }}
            disabled={isEditing}
            rows={4}
            placeholder="Enter text…"
            className={`${FIELD_CLS} min-h-[96px] resize-y leading-5`}
          />
        </section>
      )}

      {/* Size */}
      {canAdjustTextSize && (
        <section className="space-y-1.5">
          <p className={LABEL_CLS}>Size</p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => stepFontSize("down")}
              disabled={isEditing}
              aria-label="Decrease text size"
              className={STEP_CLS}
            >
              <Minus className="h-4 w-4" />
            </button>
            <span className="flex-1 rounded-lg border border-gray-200 bg-[var(--ec-raised)] py-2 text-center text-xs font-semibold text-gray-700">
              {getSelectedFontSizeLabel(selectedInfo)}
            </span>
            <button
              onClick={() => stepFontSize("up")}
              disabled={isEditing}
              aria-label="Increase text size"
              className={STEP_CLS}
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        </section>
      )}

      {/* Color + font family */}
      {canStyleText && (
        <TextStyleControls
          selectedInfo={selectedInfo}
          isEditing={isEditing}
          onApplyDirectEdit={onApplyDirectEdit}
          primaryColor={primaryColor}
          accentColor={accentColor}
        />
      )}

      {/* Link */}
      {canChangeLink && (
        <section className="space-y-1.5">
          <p className={LABEL_CLS}>Link</p>
          <div className="flex items-center gap-2">
            <input
              ref={linkInputRef}
              type="text"
              value={linkValue}
              onChange={(e) => setLinkValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  applyLink();
                }
                if (e.key === "Escape") setLinkValue(selectedInfo.href || "");
              }}
              placeholder="https://…"
              className={`${FIELD_CLS} text-xs`}
            />
            <button onClick={applyLink} disabled={!linkValue.trim()} className={APPLY_CLS}>
              Apply
            </button>
          </div>
        </section>
      )}

      {/* Photo (replace) */}
      {canChangeMedia && (
        <section className="space-y-1.5">
          <p className={LABEL_CLS}>Photo</p>
          <button
            onClick={() => setShowMedia((open) => !open)}
            disabled={isEditing}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-gray-200 bg-gray-100 px-3 py-2 text-xs font-semibold text-gray-700 transition hover:bg-gray-200 disabled:opacity-40"
          >
            <ImagePlus className="h-3.5 w-3.5" />
            {showMedia ? "Close library" : "Replace photo"}
          </button>
          {showMedia && mediaApi && (
            <MediaBrowser
              mediaApi={mediaApi}
              onSelect={handleMediaSelect}
              onClose={() => setShowMedia(false)}
            />
          )}
        </section>
      )}

      {/* Alt text */}
      {canEditAltText && (
        <section className="space-y-1.5">
          <p className={LABEL_CLS}>Alt text</p>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={altValue}
              onChange={(e) => setAltValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  applyAlt();
                }
                if (e.key === "Escape") setAltValue(getSelectedAltText(selectedInfo));
              }}
              placeholder="Describe this image…"
              className={`${FIELD_CLS} text-xs`}
            />
            <button onClick={applyAlt} disabled={isEditing} className={APPLY_CLS}>
              Apply
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
