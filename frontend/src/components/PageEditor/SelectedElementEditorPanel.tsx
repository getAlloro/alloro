import { useEffect, useRef, useState } from "react";
import { Check, Eye, EyeOff, ImagePlus, Link, Minus, Pencil, Plus, Type } from "lucide-react";
import type { SelectedInfo, QuickActionType } from "../../hooks/useIframeSelector";
import {
  getDirectOperationAvailability,
  getSelectedTextValue,
  getSelectedAltText,
  type DirectEditorOperation,
} from "../../utils/editorDirectOperations";
import { InlineIconButton } from "./InlineEditorControls";
import MediaBrowser from "./MediaBrowser";
import TextStyleControls from "./TextStyleControls";
import type { MediaApi, MediaItem } from "./MediaBrowser";
type ActiveAction = "text" | "link" | "media" | "alt" | null;
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
  /** Mirror sidebar typing into the preview element (visual only). */
  onLiveTextPreview?: (value: string) => void;
  /** Revert an unapplied live preview (selection changed / panel closed). */
  onLiveTextRevert?: () => void;
  /** Brand colors for the text-style swatches. */
  primaryColor?: string | null;
  accentColor?: string | null;
};
export default function SelectedElementEditorPanel({
  selectedInfo,
  isEditing,
  mediaApi,
  externalAction,
  onExternalActionHandled,
  onApplyDirectEdit,
  onToggleHidden,
  isCanvasTextEditing = false,
  onLiveTextPreview,
  onLiveTextRevert,
  primaryColor,
  accentColor,
}: SelectedElementEditorPanelProps) {
  const [activeAction, setActiveAction] = useState<ActiveAction>(null);
  const [actionInput, setActionInput] = useState("");
  const textAreaRef = useRef<HTMLTextAreaElement>(null);
  const linkInputRef = useRef<HTMLInputElement>(null);
  const hasLivePreviewRef = useRef(false);
  const { canEditText, canChangeMedia, canChangeLink, canAdjustTextSize, canEditAltText, canStyleText } =
    getDirectOperationAvailability(selectedInfo, Boolean(mediaApi));

  // Abandoned live preview (selection changed without Apply) — restore the
  // element's original markup in the iframe.
  const liveRevertRef = useRef(onLiveTextRevert);
  liveRevertRef.current = onLiveTextRevert;
  useEffect(() => {
    return () => {
      if (hasLivePreviewRef.current) {
        hasLivePreviewRef.current = false;
        liveRevertRef.current?.();
      }
    };
  }, [selectedInfo.alloroClass]);
  useEffect(() => {
    if (canEditText) {
      setActiveAction("text");
      setActionInput(getSelectedTextValue(selectedInfo));
      return;
    }
    setActiveAction(null);
    setActionInput("");
  }, [canEditText, selectedInfo, selectedInfo.alloroClass, selectedInfo.outerHtml]);
  useEffect(() => {
    if (!externalAction) return;

    if (externalAction === "hide") {
      if (onToggleHidden) {
        onToggleHidden();
      } else {
        onApplyDirectEdit({ type: "toggle-hidden" });
      }
    } else if (externalAction === "text-up" || externalAction === "text-down") {
      onApplyDirectEdit({
        type: "step-font-size",
        direction: externalAction === "text-up" ? "up" : "down",
      });
    } else if (externalAction === "text") {
      setActiveAction("text");
      setActionInput(getSelectedTextValue(selectedInfo));
    } else if (externalAction === "link") {
      setActiveAction("link");
      setActionInput(selectedInfo.href || "");
    } else {
      setActiveAction("media");
      setActionInput("");
    }
    onExternalActionHandled?.();
  }, [externalAction, onApplyDirectEdit, onExternalActionHandled, onToggleHidden, selectedInfo]);
  useEffect(() => {
    // Never steal focus while the user is typing directly on the page —
    // focusing the sidebar textarea blurs (and commits) the canvas session.
    if (isCanvasTextEditing) return;
    if (activeAction === "text") {
      window.setTimeout(() => textAreaRef.current?.focus(), 50);
    }
    if (activeAction === "link") {
      window.setTimeout(() => linkInputRef.current?.focus(), 50);
    }
  }, [activeAction, isCanvasTextEditing]);
  const handleTextInput = (value: string) => {
    setActionInput(value);
    if (onLiveTextPreview) {
      hasLivePreviewRef.current = true;
      onLiveTextPreview(value);
    }
  };
  const applyText = () => {
    const nextText = actionInput.trim();
    if (!nextText) return;
    hasLivePreviewRef.current = false;
    onApplyDirectEdit({ type: "replace-text", value: nextText });
  };
  const applyLink = () => {
    const href = actionInput.trim();
    if (!href) return;
    onApplyDirectEdit({ type: "update-link", href });
    setActiveAction(null);
    setActionInput("");
  };
  const handleMediaSelect = (media: MediaItem) => {
    onApplyDirectEdit({ type: "replace-media", media });
    setActiveAction(null);
  };
  const applyAltText = () => {
    onApplyDirectEdit({ type: "set-alt-text", value: actionInput });
    setActiveAction(null);
    setActionInput("");
  };
  const openAltAction = () => {
    setActiveAction("alt");
    setActionInput(getSelectedAltText(selectedInfo));
  };
  const openTextAction = () => {
    setActiveAction("text");
    setActionInput(getSelectedTextValue(selectedInfo));
  };
  const openLinkAction = () => {
    setActiveAction("link");
    setActionInput(selectedInfo.href || "");
  };
  const handleToggleVisibility = () => {
    if (onToggleHidden) {
      onToggleHidden();
      return;
    }
    onApplyDirectEdit({ type: "toggle-hidden" });
  };
  const stepFontSize = (direction: "up" | "down") => {
    onApplyDirectEdit({ type: "step-font-size", direction });
  };
  const handleTextKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      applyText();
    }
    if (event.key === "Escape") {
      setActionInput(getSelectedTextValue(selectedInfo));
    }
  };
  const handleLinkKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      applyLink();
    }
    if (event.key === "Escape") setActionInput(selectedInfo.href || "");
  };
  return (
    <div className="border-b border-gray-100 bg-gray-50">
      <div className="flex items-center justify-between px-4 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className={`h-2 w-2 shrink-0 rounded-full ${selectedInfo.type === "section" ? "bg-purple-500" : "bg-blue-500"}`} />
          <span className="text-xs font-semibold text-gray-700">{selectedInfo.friendlyName}</span>
          {selectedInfo.isHidden && (
            <span className="shrink-0 rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-600">
              Hidden
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {canEditText && <InlineIconButton emphasis={activeAction === "text"} disabled={isEditing} label="Edit text" onClick={openTextAction}><Pencil className="h-3.5 w-3.5" /></InlineIconButton>}
          {canAdjustTextSize && (
            <>
              <InlineIconButton disabled={isEditing} label="Decrease text size" onClick={() => stepFontSize("down")}><Minus className="h-3.5 w-3.5" /></InlineIconButton>
              <InlineIconButton disabled={isEditing} label="Increase text size" onClick={() => stepFontSize("up")}><Plus className="h-3.5 w-3.5" /></InlineIconButton>
            </>
          )}
          {canChangeMedia && <InlineIconButton emphasis={activeAction === "media"} disabled={isEditing} label="Change media" onClick={() => setActiveAction(activeAction === "media" ? null : "media")}><ImagePlus className="h-3.5 w-3.5" /></InlineIconButton>}
          {canEditAltText && <InlineIconButton emphasis={activeAction === "alt"} disabled={isEditing} label="Edit alt text" onClick={openAltAction}><Type className="h-3.5 w-3.5" /></InlineIconButton>}
          {canChangeLink && <InlineIconButton emphasis={activeAction === "link"} disabled={isEditing} label="Change link" onClick={openLinkAction}><Link className="h-3.5 w-3.5" /></InlineIconButton>}
          <InlineIconButton emphasis={selectedInfo.isHidden} label={selectedInfo.isHidden ? "Unhide element" : "Hide element"} onClick={handleToggleVisibility}>{selectedInfo.isHidden ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}</InlineIconButton>
        </div>
      </div>

      {canStyleText && (
        <TextStyleControls
          selectedInfo={selectedInfo}
          isEditing={isEditing}
          onApplyDirectEdit={onApplyDirectEdit}
          primaryColor={primaryColor}
          accentColor={accentColor}
        />
      )}

      {activeAction === "text" && (
        <div className="px-4 pb-3">
          <textarea
            ref={textAreaRef}
            value={actionInput}
            onChange={(event) => handleTextInput(event.target.value)}
            onKeyDown={handleTextKeyDown}
            disabled={isEditing}
            rows={5}
            placeholder="Enter new text..."
            className="min-h-[112px] w-full resize-y rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm leading-5 text-gray-900 outline-none transition focus:border-alloro-orange focus:ring-2 focus:ring-alloro-orange/20 disabled:opacity-50"
          />
          <div className="mt-2 flex justify-end">
            <button onClick={applyText} disabled={isEditing || !actionInput.trim()} className="inline-flex items-center gap-1.5 rounded-lg bg-alloro-orange px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-alloro-orange/90 disabled:opacity-30">
              <Check className="h-3.5 w-3.5" />
              Apply
            </button>
          </div>
        </div>
      )}

      {activeAction === "link" && (
        <div className="px-4 pb-2">
          <div className="flex items-center gap-1.5">
            <input ref={linkInputRef} type="text" value={actionInput} onChange={(event) => setActionInput(event.target.value)} onKeyDown={handleLinkKeyDown} placeholder="Enter URL..." className="flex-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs text-gray-900 outline-none transition focus:border-alloro-orange focus:ring-1 focus:ring-alloro-orange/20" />
            <button onClick={applyLink} disabled={!actionInput.trim()} className="rounded-lg bg-alloro-orange px-2.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-alloro-orange/90 disabled:opacity-30">Apply</button>
          </div>
        </div>
      )}

      {activeAction === "alt" && (
        <div className="px-4 pb-2">
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              value={actionInput}
              onChange={(event) => setActionInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  applyAltText();
                }
                if (event.key === "Escape") setActionInput(getSelectedAltText(selectedInfo));
              }}
              placeholder="Describe this image (alt text)..."
              className="flex-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs text-gray-900 outline-none transition focus:border-alloro-orange focus:ring-1 focus:ring-alloro-orange/20"
            />
            <button onClick={applyAltText} disabled={isEditing} className="rounded-lg bg-alloro-orange px-2.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-alloro-orange/90 disabled:opacity-30">Apply</button>
          </div>
        </div>
      )}

      {activeAction === "media" && mediaApi && (
        <div className="px-4 pb-2">
          <MediaBrowser mediaApi={mediaApi} onSelect={handleMediaSelect} onClose={() => setActiveAction(null)} />
        </div>
      )}
    </div>
  );
}
