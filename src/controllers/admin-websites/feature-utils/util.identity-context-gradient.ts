/**
 * Identity Context — gradient preset expansion + color math.
 *
 * Mirrors the frontend GradientPicker.tsx helper: expands a preset ID into CSS
 * color stops. Pure functions — no LLM, no DB.
 */

export type GradientPresetId =
  | "smooth"
  | "lean-primary"
  | "lean-accent"
  | "soft-lean-primary"
  | "soft-lean-accent"
  | "warm-middle"
  | "quick-transition"
  | "long-transition";

type StopDef = {
  role: "from" | "to" | "mix";
  position: number;
  mix_ratio?: number;
};

const PRESET_STOPS: Record<GradientPresetId, StopDef[]> = {
  smooth: [
    { role: "from", position: 0 },
    { role: "to", position: 100 },
  ],
  "lean-primary": [
    { role: "from", position: 0 },
    { role: "mix", mix_ratio: 0.5, position: 65 },
    { role: "to", position: 100 },
  ],
  "lean-accent": [
    { role: "from", position: 0 },
    { role: "mix", mix_ratio: 0.5, position: 35 },
    { role: "to", position: 100 },
  ],
  "soft-lean-primary": [
    { role: "from", position: 0 },
    { role: "mix", mix_ratio: 0.5, position: 58 },
    { role: "to", position: 100 },
  ],
  "soft-lean-accent": [
    { role: "from", position: 0 },
    { role: "mix", mix_ratio: 0.5, position: 42 },
    { role: "to", position: 100 },
  ],
  "warm-middle": [
    { role: "from", position: 0 },
    { role: "mix", mix_ratio: 0.35, position: 30 },
    { role: "mix", mix_ratio: 0.65, position: 70 },
    { role: "to", position: 100 },
  ],
  "quick-transition": [
    { role: "from", position: 0 },
    { role: "mix", mix_ratio: 0.25, position: 40 },
    { role: "mix", mix_ratio: 0.75, position: 60 },
    { role: "to", position: 100 },
  ],
  "long-transition": [
    { role: "from", position: 0 },
    { role: "mix", mix_ratio: 0.35, position: 20 },
    { role: "mix", mix_ratio: 0.65, position: 80 },
    { role: "to", position: 100 },
  ],
};

function clampN(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = (hex || "").replace(/^#/, "");
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
  const h = (x: number) => clampN(Math.round(x), 0, 255).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`.toUpperCase();
}

function mixHex(from: string, to: string, ratio: number): string {
  const a = hexToRgb(from);
  const b = hexToRgb(to);
  const r = clampN(ratio, 0, 1);
  return rgbToHex(
    a.r + (b.r - a.r) * r,
    a.g + (b.g - a.g) * r,
    a.b + (b.b - a.b) * r,
  );
}

/**
 * Expand a preset ID into CSS stops. Mirrors the frontend helper in
 * GradientPicker.tsx.
 */
export function buildGradientStopsCss(
  from: string,
  to: string,
  preset: GradientPresetId | null | undefined,
): string {
  const active: GradientPresetId = preset && preset in PRESET_STOPS ? preset : "smooth";
  return PRESET_STOPS[active]
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
