import { ArrowRight, ArrowDownRight, ArrowDown, ArrowUpRight } from "lucide-react";
import ColorPicker from "./ColorPicker";

export type GradientDirection = "to-r" | "to-br" | "to-b" | "to-tr";
export type GradientTextColor = "white" | "dark";
export type GradientPresetId =
  | "smooth"
  | "lean-primary"
  | "lean-accent"
  | "soft-lean-primary"
  | "soft-lean-accent"
  | "warm-middle"
  | "quick-transition"
  | "long-transition";

export interface GradientValue {
  enabled: boolean;
  from: string;
  to: string;
  direction: GradientDirection;
  text_color: GradientTextColor;
  /** Named preset that controls the stop distribution. All presets are subtle — no hard edges. */
  preset: GradientPresetId;
}

/**
 * Stop definition — `role: "from"` uses the primary color, `role: "to"` uses
 * the accent, `role: "mix"` uses a blended color (mix_ratio = 0 → pure from,
 * 1 → pure to, 0.5 → 50/50 mix).
 */
type StopDef = {
  role: "from" | "to" | "mix";
  position: number;
  mix_ratio?: number;
};

/**
 * Preset → CSS stops. All presets use smooth transitions; none have solid
 * single-color blocks or hard edges. Subtle variations are achieved by
 * shifting a blended-color midpoint or using multi-band gradients.
 *
 * The frontend picker and backend layouts pipeline both expand presets
 * via buildGradientStopsCss() below.
 */
export const GRADIENT_PRESETS: Record<
  GradientPresetId,
  {
    label: string;
    title: string;
    stops: StopDef[];
  }
> = {
  smooth: {
    label: "1",
    title: "Smooth — classic 0% to 100% blend",
    stops: [
      { role: "from", position: 0 },
      { role: "to", position: 100 },
    ],
  },
  "lean-primary": {
    label: "2",
    title: "Lean primary — primary color occupies more visual space",
    stops: [
      { role: "from", position: 0 },
      { role: "mix", mix_ratio: 0.5, position: 65 },
      { role: "to", position: 100 },
    ],
  },
  "lean-accent": {
    label: "3",
    title: "Lean accent — accent color occupies more visual space",
    stops: [
      { role: "from", position: 0 },
      { role: "mix", mix_ratio: 0.5, position: 35 },
      { role: "to", position: 100 },
    ],
  },
  "soft-lean-primary": {
    label: "4",
    title: "Soft lean primary — very gentle shift toward primary",
    stops: [
      { role: "from", position: 0 },
      { role: "mix", mix_ratio: 0.5, position: 58 },
      { role: "to", position: 100 },
    ],
  },
  "soft-lean-accent": {
    label: "5",
    title: "Soft lean accent — very gentle shift toward accent",
    stops: [
      { role: "from", position: 0 },
      { role: "mix", mix_ratio: 0.5, position: 42 },
      { role: "to", position: 100 },
    ],
  },
  "warm-middle": {
    label: "6",
    title: "Warm middle — extended mix band through the center",
    stops: [
      { role: "from", position: 0 },
      { role: "mix", mix_ratio: 0.35, position: 30 },
      { role: "mix", mix_ratio: 0.65, position: 70 },
      { role: "to", position: 100 },
    ],
  },
  "quick-transition": {
    label: "7",
    title: "Quick transition — colors exchange faster near the midpoint",
    stops: [
      { role: "from", position: 0 },
      { role: "mix", mix_ratio: 0.25, position: 40 },
      { role: "mix", mix_ratio: 0.75, position: 60 },
      { role: "to", position: 100 },
    ],
  },
  "long-transition": {
    label: "8",
    title: "Long transition — gradient spread out over a broader band",
    stops: [
      { role: "from", position: 0 },
      { role: "mix", mix_ratio: 0.35, position: 20 },
      { role: "mix", mix_ratio: 0.65, position: 80 },
      { role: "to", position: 100 },
    ],
  },
};

// ---------------------------------------------------------------------------
// Color mixer — shared between gradient preview and backend CSS injection.
// ---------------------------------------------------------------------------

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace(/^#/, "");
  const v =
    clean.length === 3
      ? clean
          .split("")
          .map((c) => c + c)
          .join("")
      : clean;
  const n = parseInt(v, 16);
  if (Number.isNaN(n) || v.length !== 6) return { r: 0, g: 0, b: 0 };
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}

function rgbToHex(r: number, g: number, b: number): string {
  const h = (n: number) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`.toUpperCase();
}

export function mixHex(from: string, to: string, ratio: number): string {
  const a = hexToRgb(from);
  const b = hexToRgb(to);
  const r = clamp(ratio, 0, 1);
  return rgbToHex(
    a.r + (b.r - a.r) * r,
    a.g + (b.g - a.g) * r,
    a.b + (b.b - a.b) * r,
  );
}

export function buildGradientStopsCss(
  from: string,
  to: string,
  presetId: GradientPresetId,
): string {
  const preset = GRADIENT_PRESETS[presetId] || GRADIENT_PRESETS.smooth;
  return preset.stops
    .map((s) => {
      const color =
        s.role === "from"
          ? from
          : s.role === "to"
            ? to
            : mixHex(from, to, s.mix_ratio ?? 0.5);
      return `${color} ${s.position}%`;
    })
    .join(", ");
}

interface GradientPickerProps {
  value: GradientValue;
  onChange: (value: GradientValue) => void;
  defaultFrom?: string;
  defaultTo?: string;
}

const DIRECTIONS: Array<{
  value: GradientDirection;
  label: string;
  icon: React.ReactNode;
  css: string;
}> = [
  { value: "to-r", label: "Right", icon: <ArrowRight className="h-3.5 w-3.5" />, css: "to right" },
  { value: "to-br", label: "Bottom right", icon: <ArrowDownRight className="h-3.5 w-3.5" />, css: "to bottom right" },
  { value: "to-b", label: "Bottom", icon: <ArrowDown className="h-3.5 w-3.5" />, css: "to bottom" },
  { value: "to-tr", label: "Top right", icon: <ArrowUpRight className="h-3.5 w-3.5" />, css: "to top right" },
];

function cssDirection(dir: GradientDirection): string {
  const match = DIRECTIONS.find((d) => d.value === dir);
  return match?.css || "to bottom right";
}

const DARK_TEXT = "#111827"; // gray-900

export default function GradientPicker({
  value,
  onChange,
  defaultFrom,
  defaultTo,
}: GradientPickerProps) {
  const handleToggle = (enabled: boolean) => {
    onChange({
      ...value,
      enabled,
      from: value.from || defaultFrom || "#1E40AF",
      to: value.to || defaultTo || "#F59E0B",
      text_color: value.text_color || "white",
      preset: value.preset || "smooth",
    });
  };

  const activePreset = value.preset || "smooth";
  const stopsCss = buildGradientStopsCss(value.from, value.to, activePreset);
  const previewCss = `linear-gradient(${cssDirection(value.direction)}, ${stopsCss})`;
  const textColor = value.text_color === "dark" ? DARK_TEXT : "#FFFFFF";

  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2 text-xs font-semibold text-gray-700">
        <input
          type="checkbox"
          checked={value.enabled}
          onChange={(e) => handleToggle(e.target.checked)}
          className="rounded"
        />
        Use gradient
      </label>

      {value.enabled && (
        <div className="space-y-3 rounded-lg border border-gray-200 bg-gray-50/50 p-3">
          {/* Direction presets */}
          <div>
            <div className="text-[11px] font-medium text-gray-500 mb-1.5">Direction</div>
            <div className="flex items-center gap-1.5">
              {DIRECTIONS.map((dir) => (
                <button
                  key={dir.value}
                  onClick={() => onChange({ ...value, direction: dir.value })}
                  title={dir.label}
                  className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border transition ${
                    value.direction === dir.value
                      ? "border-alloro-orange bg-alloro-orange text-white"
                      : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
                  }`}
                >
                  {dir.icon}
                </button>
              ))}
            </div>
          </div>

          {/* Colors */}
          <div className="grid grid-cols-2 gap-3">
            <ColorPicker
              value={value.from}
              onChange={(v) => onChange({ ...value, from: v })}
              label="From"
            />
            <ColorPicker
              value={value.to}
              onChange={(v) => onChange({ ...value, to: v })}
              label="To"
            />
          </div>

          {/* Text color on gradient */}
          <div>
            <div className="text-[11px] font-medium text-gray-500 mb-1.5">
              Text color on gradient
            </div>
            <div className="flex items-center gap-1.5">
              <TextColorButton
                active={value.text_color === "white"}
                label="White"
                swatchColor="#FFFFFF"
                onClick={() => onChange({ ...value, text_color: "white" })}
              />
              <TextColorButton
                active={value.text_color === "dark"}
                label="Dark"
                swatchColor={DARK_TEXT}
                onClick={() => onChange({ ...value, text_color: "dark" })}
              />
            </div>
          </div>

          {/* Effect presets */}
          <div>
            <div className="text-[11px] font-medium text-gray-500 mb-1.5">
              Effect preset
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              {(Object.keys(GRADIENT_PRESETS) as GradientPresetId[]).map(
                (id) => {
                  const preset = GRADIENT_PRESETS[id];
                  const css = `linear-gradient(${cssDirection(value.direction)}, ${buildGradientStopsCss(value.from, value.to, id)})`;
                  const active = activePreset === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => onChange({ ...value, preset: id })}
                      title={preset.title}
                      className={`relative h-10 w-14 overflow-hidden rounded-lg border transition ${
                        active
                          ? "border-alloro-orange ring-2 ring-alloro-orange/30"
                          : "border-gray-200 hover:border-gray-300"
                      }`}
                      style={{ background: css }}
                    >
                      <span
                        className={`absolute bottom-0.5 right-1 rounded-full px-1.5 text-[10px] font-bold ${
                          value.text_color === "dark"
                            ? "bg-white/80 text-gray-900"
                            : "bg-black/40 text-white"
                        }`}
                      >
                        {preset.label}
                      </span>
                    </button>
                  );
                },
              )}
            </div>
          </div>

          {/* Section preview with sample text */}
          <div>
            <div className="text-[11px] font-medium text-gray-500 mb-1.5">Section preview</div>
            <div
              className="rounded-lg border border-gray-200 px-6 py-8"
              style={{ background: previewCss, color: textColor }}
            >
              <div className="text-xs uppercase tracking-wider opacity-80">
                Sample hero section
              </div>
              <div className="text-2xl font-bold mt-1">
                Your smile, reimagined
              </div>
              <div className="text-sm opacity-90 mt-1">
                Body copy shows how text reads against the gradient.
              </div>
              <button
                type="button"
                onClick={(e) => e.preventDefault()}
                className="mt-3 inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold"
                style={{
                  borderColor: textColor,
                  color: textColor,
                }}
              >
                Book an appointment
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TextColorButton({
  active,
  label,
  swatchColor,
  onClick,
}: {
  active: boolean;
  label: string;
  swatchColor: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs transition ${
        active
          ? "border-alloro-orange bg-alloro-orange/10 text-alloro-orange"
          : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
      }`}
    >
      <span
        className="inline-block h-3 w-3 rounded-full border border-gray-300"
        style={{ backgroundColor: swatchColor }}
      />
      {label}
    </button>
  );
}
