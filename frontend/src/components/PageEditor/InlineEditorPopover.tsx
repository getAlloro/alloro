import { useEffect, useMemo, useState } from "react";
import { Check, Eye, EyeOff, ImagePlus, Link, Minus, Plus } from "lucide-react";
import type { SelectedInfo } from "../../hooks/useIframeSelector";
import {
  getDirectOperationAvailability,
  getSelectedBackgroundColorValue,
  getSelectedTextValue,
  type DirectEditorOperation,
} from "../../utils/editorDirectOperations";
import InlineEditorBackgroundControls from "./InlineEditorBackgroundControls";
import { InlineIconButton, InlineSmallButton } from "./InlineEditorControls";
import MediaBrowser from "./MediaBrowser";
import type { MediaApi, MediaItem } from "./MediaBrowser";

type InlineEditorPopoverProps = {
  selectedInfo: SelectedInfo | null;
  mediaApi?: MediaApi;
  isEditing: boolean;
  onApplyDirectEdit: (operation: DirectEditorOperation) => void;
};

export default function InlineEditorPopover({
  selectedInfo, mediaApi, isEditing, onApplyDirectEdit,
}: InlineEditorPopoverProps) {
  const [textValue, setTextValue] = useState("");
  const [hrefValue, setHrefValue] = useState("");
  const [colorValue, setColorValue] = useState("#ffffff");
  const [mediaMode, setMediaMode] = useState<"media" | "background" | null>(null);

  const availability = getDirectOperationAvailability(selectedInfo, Boolean(mediaApi));
  const rect = selectedInfo?.rect;
  const hasBackgroundImage = Boolean(selectedInfo?.backgroundImage && selectedInfo.backgroundImage !== "none");

  useEffect(() => {
    setMediaMode(null);
    setTextValue(getSelectedTextValue(selectedInfo));
    setHrefValue(selectedInfo?.href || "");
    setColorValue(getSelectedBackgroundColorValue(selectedInfo));
  }, [selectedInfo]);

  const positionStyle = useMemo(() => {
    const top = Math.max(8, (rect?.top || 0) + 8);
    const left = Math.max(8, (rect?.left || 0) + 8);
    const width = Math.min(Math.max((rect?.width || 320) - 16, 320), 620);
    return { top, left, width, maxWidth: "calc(100% - 16px)" };
  }, [rect]);

  if (!selectedInfo || !rect) return null;

  const applyText = () => {
    const trimmed = textValue.trim();
    if (!trimmed) return;
    onApplyDirectEdit({ type: "replace-text", value: trimmed });
  };

  const applyHref = () => {
    const trimmed = hrefValue.trim();
    if (!trimmed) return;
    onApplyDirectEdit({ type: "update-link", href: trimmed });
  };

  const handleMediaSelect = (media: MediaItem) => {
    onApplyDirectEdit(
      mediaMode === "background"
        ? { type: "set-background-image", media }
        : { type: "replace-media", media },
    );
    setMediaMode(null);
  };

  const handleTextKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    event.stopPropagation();
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      applyText();
    }
    if (event.key === "Escape") setTextValue(getSelectedTextValue(selectedInfo));
  };

  const handleInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    event.stopPropagation();
    if (event.key === "Enter") {
      event.preventDefault();
      applyHref();
    }
    if (event.key === "Escape") setHrefValue(selectedInfo.href || "");
  };

  return (
    <div
      className="absolute z-[60] rounded-xl border border-gray-200 bg-white/95 p-2 shadow-2xl backdrop-blur-md pointer-events-auto"
      style={positionStyle}
      onClick={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold text-gray-700">{selectedInfo.friendlyName}</span>
        <div className="flex items-center gap-1">
          {availability.canAdjustTextSize && (
            <>
              <InlineIconButton label="Decrease text size" disabled={isEditing} onClick={() => onApplyDirectEdit({ type: "step-font-size", direction: "down" })}>
                <Minus className="h-3.5 w-3.5" />
              </InlineIconButton>
              <InlineIconButton label="Increase text size" disabled={isEditing} onClick={() => onApplyDirectEdit({ type: "step-font-size", direction: "up" })}>
                <Plus className="h-3.5 w-3.5" />
              </InlineIconButton>
            </>
          )}
          <InlineIconButton
            label={selectedInfo.isHidden ? "Show element" : "Hide element"}
            disabled={isEditing}
            onClick={() => onApplyDirectEdit({ type: "toggle-hidden" })}
          >
            {selectedInfo.isHidden ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
          </InlineIconButton>
        </div>
      </div>

      {availability.canEditText && (
        <div className="mb-2 flex items-start gap-2">
          <textarea
            value={textValue}
            onChange={(event) => setTextValue(event.target.value)}
            onKeyDown={handleTextKeyDown}
            disabled={isEditing}
            rows={Math.min(3, Math.max(1, textValue.length > 52 ? 2 : 1))}
            className="min-h-[36px] flex-1 resize-none rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-900 outline-none transition focus:border-alloro-orange focus:ring-2 focus:ring-alloro-orange/20 disabled:opacity-50"
          />
          <InlineIconButton label="Apply text" disabled={isEditing || !textValue.trim()} onClick={applyText} emphasis>
            <Check className="h-4 w-4" />
          </InlineIconButton>
        </div>
      )}

      {availability.canChangeLink && (
        <div className="mb-2 flex items-center gap-2">
          <Link className="h-4 w-4 text-gray-400" />
          <input
            value={hrefValue}
            onChange={(event) => setHrefValue(event.target.value)}
            onKeyDown={handleInputKeyDown}
            disabled={isEditing}
            placeholder="https://example.com"
            className="h-9 flex-1 rounded-lg border border-gray-200 px-3 text-xs text-gray-900 outline-none transition focus:border-alloro-orange focus:ring-2 focus:ring-alloro-orange/20 disabled:opacity-50"
          />
          <InlineIconButton label="Apply link" disabled={isEditing || !hrefValue.trim()} onClick={applyHref} emphasis>
            <Check className="h-4 w-4" />
          </InlineIconButton>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {availability.canChangeMedia && mediaApi && (
          <InlineSmallButton disabled={isEditing} active={mediaMode === "media"} onClick={() => setMediaMode(mediaMode === "media" ? null : "media")}>
            <ImagePlus className="h-3.5 w-3.5" />
            Replace image
          </InlineSmallButton>
        )}
        {availability.canEditBackground && (
          <InlineEditorBackgroundControls
            colorValue={colorValue}
            disabled={isEditing}
            hasBackgroundImage={hasBackgroundImage}
            mediaApi={mediaApi}
            mediaMode={mediaMode}
            selectedInfo={selectedInfo}
            setColorValue={setColorValue}
            setMediaMode={setMediaMode}
            onApplyDirectEdit={onApplyDirectEdit}
          />
        )}
      </div>

      {mediaMode && mediaApi && (
        <div className="mt-2">
          <MediaBrowser
            mediaApi={mediaApi}
            onSelect={handleMediaSelect}
            onClose={() => setMediaMode(null)}
            compact
          />
        </div>
      )}
    </div>
  );
}
