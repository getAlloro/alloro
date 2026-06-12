import { useId } from "react";
import { Eraser } from "lucide-react";
import type { SelectedInfo } from "../../hooks/useIframeSelector";
import {
  getSelectedTextColor,
  getSelectedFontFamily,
  getSelectedBold,
  getSelectedItalic,
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

const LABEL_CLS =
  "text-[10px] font-bold uppercase tracking-wider text-gray-400";

/**
 * Text color + font-family controls as two roomy, labeled rows. Every action
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
  const isBold = getSelectedBold(selectedInfo);
  const isItalic = getSelectedItalic(selectedInfo);

  const styleBtn = (active: boolean) =>
    `flex h-9 flex-1 items-center justify-center rounded-lg border text-sm leading-none transition disabled:opacity-50 ${
      active
        ? "border-alloro-orange bg-alloro-orange text-white"
        : "border-gray-200 bg-gray-100 text-gray-600 hover:bg-gray-200"
    }`;

  const swatches = [
    ...BASE_SWATCHES,
    ...(primaryColor ? [primaryColor] : []),
    ...(accentColor ? [accentColor] : []),
  ];

  const applyColor = (color: string) =>
    onApplyDirectEdit({ type: "set-text-color", color });

  const toggleFamily = (family: "serif" | "sans") =>
    onApplyDirectEdit({
      type: "set-font-family",
      family: currentFamily === family ? "reset" : family,
    });

  return (
    <div className="space-y-4">
      {/* Color */}
      <section className="space-y-1.5">
        <p className={LABEL_CLS}>Color</p>
        <div className="flex flex-wrap items-center gap-2">
          {swatches.map((color) => (
            <button
              key={color}
              onClick={() => applyColor(color)}
              disabled={isEditing}
              title={`Text color ${color}`}
              aria-label={`Set text color ${color}`}
              className={`h-6 w-6 rounded-full border transition disabled:opacity-50 ${
                currentColor?.toLowerCase() === color.toLowerCase()
                  ? "border-alloro-orange ring-2 ring-alloro-orange/40"
                  : "border-gray-300 hover:border-gray-500"
              }`}
              style={{ backgroundColor: color }}
            />
          ))}

          <label
            htmlFor={colorInputId}
            title="Custom text color"
            className="h-6 w-6 cursor-pointer overflow-hidden rounded-full border border-gray-300 bg-[conic-gradient(red,yellow,lime,cyan,blue,magenta,red)] hover:border-gray-500"
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
            className="flex h-6 w-6 items-center justify-center rounded-full border border-gray-300 text-gray-400 transition hover:border-gray-500 hover:text-gray-600 disabled:opacity-40"
          >
            <Eraser className="h-3 w-3" />
          </button>
        </div>
      </section>

      {/* Style: bold / italic / serif / sans — one compact inline row */}
      <section className="space-y-1.5">
        <p className={LABEL_CLS}>Style</p>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => onApplyDirectEdit({ type: "toggle-bold" })}
            disabled={isEditing}
            aria-pressed={isBold}
            title="Bold"
            className={styleBtn(isBold)}
          >
            <span className="text-base font-bold">B</span>
          </button>
          <button
            onClick={() => onApplyDirectEdit({ type: "toggle-italic" })}
            disabled={isEditing}
            aria-pressed={isItalic}
            title="Italic"
            className={styleBtn(isItalic)}
          >
            <span className="font-serif text-base italic">I</span>
          </button>
          <button
            onClick={() => toggleFamily("serif")}
            disabled={isEditing}
            aria-pressed={currentFamily === "serif"}
            title="Serif font"
            className={`${styleBtn(currentFamily === "serif")} font-serif`}
          >
            Serif
          </button>
          <button
            onClick={() => toggleFamily("sans")}
            disabled={isEditing}
            aria-pressed={currentFamily === "sans"}
            title="Sans font"
            className={`${styleBtn(currentFamily === "sans")} font-sans`}
          >
            Sans
          </button>
        </div>
      </section>
    </div>
  );
}
