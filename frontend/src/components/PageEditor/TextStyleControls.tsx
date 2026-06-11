import { useId } from "react";
import { Eraser } from "lucide-react";
import type { SelectedInfo } from "../../hooks/useIframeSelector";
import {
  getSelectedTextColor,
  getSelectedFontFamily,
  type DirectEditorOperation,
} from "../../utils/editorDirectOperations";

export type TextStyleControlsProps = {
  selectedInfo: SelectedInfo;
  isEditing: boolean;
  onApplyDirectEdit: (operation: DirectEditorOperation) => void;
  /** Brand colors offered as one-click swatches. */
  primaryColor?: string | null;
  accentColor?: string | null;
};

const BASE_SWATCHES = ["#11151c", "#5f5f5f", "#ffffff"];

/**
 * Compact text-styling row for selected text elements: color swatches +
 * custom picker + clear, and a serif/sans font-family toggle. Every action
 * applies as an in-place direct edit — no preview reload.
 */
export default function TextStyleControls({
  selectedInfo,
  isEditing,
  onApplyDirectEdit,
  primaryColor,
  accentColor,
}: TextStyleControlsProps) {
  const colorInputId = useId();
  const currentColor = getSelectedTextColor(selectedInfo);
  const currentFamily = getSelectedFontFamily(selectedInfo);

  const swatches = [
    ...BASE_SWATCHES,
    ...(primaryColor ? [primaryColor] : []),
    ...(accentColor ? [accentColor] : []),
  ];

  const applyColor = (color: string) => {
    onApplyDirectEdit({ type: "set-text-color", color });
  };

  const toggleFamily = (family: "serif" | "sans") => {
    onApplyDirectEdit({
      type: "set-font-family",
      family: currentFamily === family ? "reset" : family,
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-2 px-4 pb-2">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
        Text
      </span>

      {swatches.map((color) => (
        <button
          key={color}
          onClick={() => applyColor(color)}
          disabled={isEditing}
          title={`Text color ${color}`}
          aria-label={`Set text color ${color}`}
          className={`h-5 w-5 rounded-full border transition disabled:opacity-50 ${
            currentColor?.toLowerCase() === color.toLowerCase()
              ? "border-alloro-orange ring-2 ring-alloro-orange/30"
              : "border-gray-300 hover:border-gray-500"
          }`}
          style={{ backgroundColor: color }}
        />
      ))}

      <label
        htmlFor={colorInputId}
        title="Custom text color"
        className="h-5 w-5 cursor-pointer overflow-hidden rounded-full border border-gray-300 bg-[conic-gradient(red,yellow,lime,cyan,blue,magenta,red)] hover:border-gray-500"
      >
        <input
          id={colorInputId}
          type="color"
          value={currentColor || "#11151c"}
          onChange={(event) => applyColor(event.target.value)}
          disabled={isEditing}
          className="h-full w-full cursor-pointer opacity-0"
        />
      </label>

      <button
        onClick={() => onApplyDirectEdit({ type: "clear-text-color" })}
        disabled={isEditing || !currentColor}
        title="Reset text color"
        aria-label="Reset text color"
        className="flex h-5 w-5 items-center justify-center rounded-full border border-gray-300 text-gray-400 transition hover:border-gray-500 hover:text-gray-600 disabled:opacity-40"
      >
        <Eraser className="h-3 w-3" />
      </button>

      <span className="mx-0.5 h-4 w-px bg-gray-200" />

      <div className="flex items-center overflow-hidden rounded-md border border-gray-200">
        <button
          onClick={() => toggleFamily("serif")}
          disabled={isEditing}
          title="Serif font"
          className={`px-2 py-0.5 font-serif text-xs transition disabled:opacity-50 ${
            currentFamily === "serif"
              ? "bg-alloro-orange text-white"
              : "bg-white text-gray-600 hover:bg-gray-50"
          }`}
        >
          Aa
        </button>
        <button
          onClick={() => toggleFamily("sans")}
          disabled={isEditing}
          title="Sans-serif font"
          className={`border-l border-gray-200 px-2 py-0.5 font-sans text-xs transition disabled:opacity-50 ${
            currentFamily === "sans"
              ? "bg-alloro-orange text-white"
              : "bg-white text-gray-600 hover:bg-gray-50"
          }`}
        >
          Aa
        </button>
      </div>
    </div>
  );
}
