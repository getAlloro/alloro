/**
 * Deterministic letter-grade mapping for audit scores.
 *
 * The letter is ALWAYS derived from the numeric percentage score using the
 * approved 12-band scale — never authored by an LLM. Shared by the GBP
 * aggregator (write side) and the serve-time normalizers so every audit card
 * (Website, GBP, Local Ranking) grades identically against one source of truth.
 */

/** Approved percentage→letter bands, highest threshold first. */
const GRADE_BANDS: ReadonlyArray<{ min: number; letter: string }> = [
  { min: 93, letter: "A" },
  { min: 90, letter: "A-" },
  { min: 87, letter: "B+" },
  { min: 83, letter: "B" },
  { min: 80, letter: "B-" },
  { min: 77, letter: "C+" },
  { min: 73, letter: "C" },
  { min: 70, letter: "C-" },
  { min: 67, letter: "D+" },
  { min: 63, letter: "D" },
  { min: 60, letter: "D-" },
  { min: 0, letter: "F" },
];

/**
 * Map a numeric percentage score (0–100) to its approved letter grade.
 *
 * Rounds to the nearest integer and clamps to [0, 100] before banding, so the
 * letter always matches the integer the UI displays. Assumes a finite number —
 * callers holding `string | number | undefined` should use `deriveGrade`.
 */
export function scoreToGrade(score: number): string {
  const clamped = Math.min(100, Math.max(0, Math.round(score)));
  for (const band of GRADE_BANDS) {
    if (clamped >= band.min) return band.letter;
  }
  return "F";
}

/**
 * Safely derive a letter from a possibly-stringy/missing score. Returns the
 * deterministic grade when the score is a finite number; otherwise falls back
 * to `fallback` (e.g. a previously stored letter) so a missing score never
 * blanks or mislabels a card.
 */
export function deriveGrade(
  score: string | number | null | undefined,
  fallback = ""
): string {
  // Guard the "missing" cases first: Number(null) and Number("") are 0 (finite),
  // which would mislabel an absent score as F instead of falling back.
  if (score === null || score === undefined || score === "") return fallback;
  const n = Number(score);
  return Number.isFinite(n) ? scoreToGrade(n) : fallback;
}
