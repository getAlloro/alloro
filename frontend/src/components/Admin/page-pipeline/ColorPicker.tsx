import React, { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

// ─── helpers ────────────────────────────────────────────────────────
function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

function hslToHex(h: number, s: number, l: number): string {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(color * 255)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`.toUpperCase();
}

function hexToHsl(hex: string): [number, number, number] | null {
  const m = hex
    .replace("#", "")
    .match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) return null;
  const r = parseInt(m[1], 16) / 255;
  const g = parseInt(m[2], 16) / 255;
  const b = parseInt(m[3], 16) / 255;
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
  else if (max === g) h = ((b - r) / d + 2) * 60;
  else h = ((r - g) / d + 4) * 60;
  return [h, s, l];
}

function isValidHex(hex: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(hex);
}

// ─── presets ────────────────────────────────────────────────────────
const PRESETS = [
  "#1E40AF",
  "#2563EB",
  "#3B82F6",
  "#059669",
  "#10B981",
  "#DC2626",
  "#EF4444",
  "#D97706",
  "#F59E0B",
  "#7C3AED",
  "#8B5CF6",
  "#DB2777",
  "#EC4899",
  "#0F172A",
  "#334155",
  "#64748B",
];

// ─── component ──────────────────────────────────────────────────────
interface ColorPickerProps {
  value: string;
  onChange: (hex: string) => void;
  label?: string;
}

export default function ColorPicker({
  value,
  onChange,
  label,
}: ColorPickerProps) {
  const [open, setOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Parse incoming hex to HSL
  const parsed = hexToHsl(value) ?? [0, 0.5, 0.5];
  const [hue, setHue] = useState(parsed[0]);
  const [lightness, setLightness] = useState(parsed[2]);
  const [hexInput, setHexInput] = useState(value);

  // Sync from external value changes
  useEffect(() => {
    const hsl = hexToHsl(value);
    if (hsl) {
      setHue(hsl[0]);
      setLightness(hsl[2]);
    }
    setHexInput(value);
  }, [value]);

  const emit = useCallback(
    (h: number, l: number) => {
      const hex = hslToHex(h, 1, l);
      onChange(hex);
      setHexInput(hex);
    },
    [onChange],
  );

  const commitHex = useCallback(
    (raw: string) => {
      let hex = raw.trim().toUpperCase();
      if (!hex.startsWith("#")) hex = "#" + hex;
      if (isValidHex(hex)) {
        const hsl = hexToHsl(hex);
        if (hsl) {
          setHue(hsl[0]);
          setLightness(hsl[2]);
        }
        onChange(hex);
        setHexInput(hex);
      } else {
        setHexInput(value);
      }
    },
    [onChange, value],
  );

  // ── Slider interaction helpers ──
  const hueRef = useRef<HTMLDivElement>(null);
  const lightnessRef = useRef<HTMLDivElement>(null);
  const draggingHue = useRef(false);
  const draggingLightness = useRef(false);

  const handleHueInteraction = useCallback(
    (clientX: number) => {
      const rect = hueRef.current?.getBoundingClientRect();
      if (!rect) return;
      const nh = clamp(((clientX - rect.left) / rect.width) * 360, 0, 360);
      setHue(nh);
      emit(nh, lightness);
    },
    [lightness, emit],
  );

  const handleLightnessInteraction = useCallback(
    (clientX: number) => {
      const rect = lightnessRef.current?.getBoundingClientRect();
      if (!rect) return;
      // Left = light (1.0), right = dark (0.0)
      const nl = clamp(1 - (clientX - rect.left) / rect.width, 0.05, 0.95);
      setLightness(nl);
      emit(hue, nl);
    },
    [hue, emit],
  );

  const onHuePointerDown = useCallback(
    (e: React.PointerEvent) => {
      draggingHue.current = true;
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      handleHueInteraction(e.clientX);
    },
    [handleHueInteraction],
  );
  const onHuePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (draggingHue.current) handleHueInteraction(e.clientX);
    },
    [handleHueInteraction],
  );
  const onHuePointerUp = useCallback(() => {
    draggingHue.current = false;
  }, []);

  const onLightnessPointerDown = useCallback(
    (e: React.PointerEvent) => {
      draggingLightness.current = true;
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      handleLightnessInteraction(e.clientX);
    },
    [handleLightnessInteraction],
  );
  const onLightnessPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (draggingLightness.current) handleLightnessInteraction(e.clientX);
    },
    [handleLightnessInteraction],
  );
  const onLightnessPointerUp = useCallback(() => {
    draggingLightness.current = false;
  }, []);

  // The pure hue color at full saturation, mid lightness (for the lightness slider background)
  const pureHueHex = hslToHex(hue, 1, 0.5);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div className="relative" ref={popoverRef}>
      {label && (
        <label className="block text-xs font-medium text-gray-500 mb-1">
          {label}
        </label>
      )}

      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2
                   hover:border-gray-300 transition-colors focus:outline-none focus:ring-2 focus:ring-alloro-orange/30"
      >
        <span
          className="block h-5 w-5 rounded-md border border-gray-200"
          style={{ backgroundColor: value }}
        />
        <span className="text-sm font-mono text-gray-700">{value}</span>
        <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
      </button>

      {/* Popover */}
      {open && (
        <div className="absolute z-50 mt-2 left-0 w-[260px] rounded-xl border border-gray-200 bg-white shadow-lg p-3 space-y-3">
          {/* Color preview */}
          <div
            className="h-8 rounded-lg border border-gray-200"
            style={{ backgroundColor: value }}
          />

          {/* Hue slider */}
          <div>
            <label className="text-[10px] text-gray-400 uppercase tracking-wide mb-1.5 block">
              Color
            </label>
            <div
              ref={hueRef}
              className="relative h-4 rounded-full cursor-pointer select-none"
              style={{
                background:
                  "linear-gradient(to right, #ff0000 0%, #ffff00 17%, #00ff00 33%, #00ffff 50%, #0000ff 67%, #ff00ff 83%, #ff0000 100%)",
              }}
              onPointerDown={onHuePointerDown}
              onPointerMove={onHuePointerMove}
              onPointerUp={onHuePointerUp}
            >
              <div
                className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-5 h-5 rounded-full
                           border-2 border-white shadow-md pointer-events-none"
                style={{
                  left: `${(hue / 360) * 100}%`,
                  backgroundColor: pureHueHex,
                }}
              />
            </div>
          </div>

          {/* Lightness slider */}
          <div>
            <label className="text-[10px] text-gray-400 uppercase tracking-wide mb-1.5 block">
              Darkness
            </label>
            <div
              ref={lightnessRef}
              className="relative h-4 rounded-full cursor-pointer select-none"
              style={{
                background: `linear-gradient(to right, white, ${pureHueHex}, black)`,
              }}
              onPointerDown={onLightnessPointerDown}
              onPointerMove={onLightnessPointerMove}
              onPointerUp={onLightnessPointerUp}
            >
              <div
                className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-5 h-5 rounded-full
                           border-2 border-white shadow-md pointer-events-none"
                style={{
                  left: `${(1 - lightness) * 100}%`,
                  backgroundColor: value,
                }}
              />
            </div>
          </div>

          {/* Hex input */}
          <div>
            <label className="text-[10px] text-gray-400 uppercase tracking-wide mb-1 block">
              Hex
            </label>
            <input
              type="text"
              value={hexInput}
              onChange={(e) => setHexInput(e.target.value)}
              onBlur={() => commitHex(hexInput)}
              onKeyDown={(e) => e.key === "Enter" && commitHex(hexInput)}
              className="w-full rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-sm
                         font-mono text-gray-800 focus:outline-none focus:ring-2 focus:ring-alloro-orange/30 focus:border-alloro-orange"
            />
          </div>

          {/* Preset swatches */}
          <div>
            <label className="text-[10px] text-gray-400 uppercase tracking-wide mb-1.5 block">
              Presets
            </label>
            <div className="grid grid-cols-8 gap-1.5">
              {PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => {
                    const hsl = hexToHsl(preset);
                    if (hsl) {
                      setHue(hsl[0]);
                      setLightness(hsl[2]);
                    }
                    onChange(preset);
                    setHexInput(preset);
                  }}
                  className={`h-6 w-6 rounded-md border transition-all hover:scale-110 ${
                    value.toUpperCase() === preset
                      ? "border-gray-900 ring-2 ring-gray-900/20 scale-110"
                      : "border-gray-200"
                  }`}
                  style={{ backgroundColor: preset }}
                  title={preset}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
