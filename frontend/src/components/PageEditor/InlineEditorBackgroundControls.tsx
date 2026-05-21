import { Check, Eraser, ImagePlus, PaintBucket, X } from "lucide-react";
import type { SelectedInfo } from "../../hooks/useIframeSelector";
import {
  BACKGROUND_POSITION_PRESETS,
  BACKGROUND_SIZE_PRESETS,
  type BackgroundPositionPreset,
  type BackgroundSizePreset,
  type DirectEditorOperation,
} from "../../utils/editorDirectOperations";
import type { MediaApi } from "./MediaBrowser";
import { InlineIconButton, InlineSmallButton } from "./InlineEditorControls";

type InlineEditorBackgroundControlsProps = {
  colorValue: string;
  disabled: boolean;
  hasBackgroundImage: boolean;
  mediaApi?: MediaApi;
  mediaMode: "media" | "background" | null;
  selectedInfo: SelectedInfo;
  setColorValue: (value: string) => void;
  setMediaMode: (mode: "media" | "background" | null) => void;
  onApplyDirectEdit: (operation: DirectEditorOperation) => void;
};

const COLOR_SWATCHES = ["#ffffff", "#f8fafc", "#111827", "#d66853", "#06b6d4"];

export default function InlineEditorBackgroundControls({
  colorValue,
  disabled,
  hasBackgroundImage,
  mediaApi,
  mediaMode,
  selectedInfo,
  setColorValue,
  setMediaMode,
  onApplyDirectEdit,
}: InlineEditorBackgroundControlsProps) {
  return (
    <>
      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-gray-500">
        <PaintBucket className="h-3.5 w-3.5" />
        Background
      </span>
      {COLOR_SWATCHES.map((color) => (
        <button
          key={color}
          type="button"
          disabled={disabled}
          onClick={() => onApplyDirectEdit({ type: "set-background-color", color })}
          className="h-6 w-6 rounded-full border border-gray-200 shadow-sm transition hover:scale-105 disabled:opacity-40"
          style={{ backgroundColor: color }}
          aria-label={`Set background ${color}`}
        />
      ))}
      <input
        type="color"
        value={colorValue}
        disabled={disabled}
        onChange={(event) => setColorValue(event.target.value)}
        onBlur={() => onApplyDirectEdit({ type: "set-background-color", color: colorValue })}
        className="h-8 w-9 cursor-pointer rounded border border-gray-200 bg-white p-1 disabled:opacity-40"
        aria-label="Choose background color"
      />
      <InlineIconButton
        label="Apply background color"
        disabled={disabled}
        onClick={() => onApplyDirectEdit({ type: "set-background-color", color: colorValue })}
      >
        <Check className="h-3.5 w-3.5" />
      </InlineIconButton>
      <InlineIconButton
        label="Clear background color"
        disabled={disabled}
        onClick={() => onApplyDirectEdit({ type: "clear-background-color" })}
      >
        <Eraser className="h-3.5 w-3.5" />
      </InlineIconButton>
      {mediaApi && (
        <InlineSmallButton
          disabled={disabled}
          active={mediaMode === "background"}
          onClick={() => setMediaMode(mediaMode === "background" ? null : "background")}
        >
          <ImagePlus className="h-3.5 w-3.5" />
          BG image
        </InlineSmallButton>
      )}
      {hasBackgroundImage && (
        <>
          <InlineSmallButton disabled={disabled} onClick={() => onApplyDirectEdit({ type: "clear-background-image" })}>
            <X className="h-3.5 w-3.5" />
            Clear image
          </InlineSmallButton>
          <select
            value={selectedInfo.backgroundSize || "cover"}
            disabled={disabled}
            onChange={(event) =>
              onApplyDirectEdit({
                type: "set-background-size",
                size: event.target.value as BackgroundSizePreset,
              })
            }
            className="h-8 rounded-lg border border-gray-200 bg-white px-2 text-[11px] font-semibold text-gray-600 outline-none"
          >
            {BACKGROUND_SIZE_PRESETS.map((size) => (
              <option key={size} value={size}>{size}</option>
            ))}
          </select>
          <select
            value={selectedInfo.backgroundPosition || "center center"}
            disabled={disabled}
            onChange={(event) =>
              onApplyDirectEdit({
                type: "set-background-position",
                position: event.target.value as BackgroundPositionPreset,
              })
            }
            className="h-8 rounded-lg border border-gray-200 bg-white px-2 text-[11px] font-semibold text-gray-600 outline-none"
          >
            {BACKGROUND_POSITION_PRESETS.map((position) => (
              <option key={position} value={position}>{position}</option>
            ))}
          </select>
        </>
      )}
    </>
  );
}
