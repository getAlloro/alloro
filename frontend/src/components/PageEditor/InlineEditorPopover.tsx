import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Check, Eye, EyeOff, ImagePlus, Link, Minus, Pencil, Plus } from "lucide-react";
import type { SelectedInfo } from "../../hooks/useIframeSelector";
import {
  getDirectOperationAvailability,
  getSelectedBackgroundColorValue,
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
  isCanvasTextEditing?: boolean;
  onStartCanvasTextEdit?: () => boolean;
  onApplyDirectEdit: (operation: DirectEditorOperation) => void;
};

export default function InlineEditorPopover({
  selectedInfo, mediaApi, isEditing, isCanvasTextEditing, onStartCanvasTextEdit, onApplyDirectEdit,
}: InlineEditorPopoverProps) {
  const [hrefValue, setHrefValue] = useState("");
  const [colorValue, setColorValue] = useState("#ffffff");
  const [mediaMode, setMediaMode] = useState<"media" | "background" | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const [popoverSize, setPopoverSize] = useState({ width: 320, height: 64 });

  const availability = getDirectOperationAvailability(selectedInfo, Boolean(mediaApi));
  const rect = selectedInfo?.rect;
  const hasBackgroundImage = Boolean(selectedInfo?.backgroundImage && selectedInfo.backgroundImage !== "none");
  const hasPropertyPanel = availability.canChangeLink || availability.canEditBackground || Boolean(mediaMode);

  useEffect(() => {
    setMediaMode(null);
    setHrefValue(selectedInfo?.href || "");
    setColorValue(getSelectedBackgroundColorValue(selectedInfo));
  }, [selectedInfo]);

  useLayoutEffect(() => {
    const node = popoverRef.current;
    if (!node) return;

    const measure = () => {
      const next = node.getBoundingClientRect();
      setPopoverSize((current) => {
        const width = Math.ceil(next.width);
        const height = Math.ceil(next.height);
        if (current.width === width && current.height === height) return current;
        return { width, height };
      });
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [availability.canChangeLink, availability.canEditBackground, mediaMode, selectedInfo]);

  const positionStyle = useMemo(() => {
    const margin = 8;
    const anchorTop = rect?.top || 0;
    const anchorLeft = rect?.left || 0;
    const anchorBottom = anchorTop + (rect?.height || 0);
    const estimatedHeight = popoverSize.height || (hasPropertyPanel ? 128 : 64);
    const estimatedWidth = popoverSize.width || 320;
    const viewportHeight = typeof window === "undefined" ? 0 : window.innerHeight;
    const viewportWidth = typeof window === "undefined" ? 0 : window.innerWidth;
    const canFitAbove = anchorTop >= estimatedHeight + margin;
    const canFitBelow = !viewportHeight || viewportHeight - anchorBottom >= estimatedHeight + margin;
    let top = hasPropertyPanel
      ? anchorBottom + margin
      : anchorTop - estimatedHeight - margin;

    if (hasPropertyPanel && !canFitBelow && canFitAbove) {
      top = anchorTop - estimatedHeight - margin;
    } else if (!hasPropertyPanel && !canFitAbove && canFitBelow) {
      top = anchorBottom + margin;
    }

    const maxLeft = viewportWidth
      ? Math.max(margin, viewportWidth - estimatedWidth - margin)
      : anchorLeft + margin;
    const left = Math.min(Math.max(margin, anchorLeft + margin), maxLeft);
    const width = hasPropertyPanel
      ? Math.min(Math.max((rect?.width || 320) - 16, 320), 620)
      : "auto";
    return { top: Math.max(margin, top), left, width, maxWidth: "calc(100% - 16px)" };
  }, [hasPropertyPanel, popoverSize, rect]);

  if (!selectedInfo || !rect) return null;

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
      ref={popoverRef}
      className="absolute z-[60] rounded-xl border border-gray-200 bg-white/95 p-2 shadow-2xl backdrop-blur-md pointer-events-auto"
      style={positionStyle}
      onClick={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold text-gray-700">{selectedInfo.friendlyName}</span>
        <div className="flex items-center gap-1">
          {availability.canEditCanvasText && onStartCanvasTextEdit && (
            <InlineIconButton label="Edit text on canvas" disabled={isEditing || isCanvasTextEditing} onClick={onStartCanvasTextEdit} emphasis={!isCanvasTextEditing}>
              <Pencil className="h-3.5 w-3.5" />
            </InlineIconButton>
          )}
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
          <InlineIconButton label={selectedInfo.isHidden ? "Show element" : "Hide element"} disabled={isEditing} onClick={() => onApplyDirectEdit({ type: "toggle-hidden" })}>
            {selectedInfo.isHidden ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
          </InlineIconButton>
        </div>
      </div>

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
