/**
 * Minimal line-level diff over Markdown (the canonical stored form) — powers
 * the version-compare endpoint. Same hunk contract as
 * alloro-os/backend/src/utils/diff.ts, but the `diff` npm package is NOT an
 * Alloro dependency (§4.4 — no new deps), so this implements a classic
 * common-prefix/suffix trim + LCS dynamic program over the middle window.
 *
 * Behavior notes:
 *  - Hunks are per-line: { type: "context" | "remove" | "add", text }.
 *    Removes are emitted before adds inside a changed block, matching the
 *    diffLines() ordering the OS UI was built against.
 *  - The DP window is capped (OS_DIFF_MAX_LCS_LINES per side, after trimming).
 *    Past the cap the middle collapses to remove-all + add-all — still a
 *    correct (if coarse) diff, with bounded memory on pathological inputs.
 */

export type OsDiffHunkType = "context" | "add" | "remove";

export interface OsDiffHunk {
  type: OsDiffHunkType;
  text: string;
}

/** Per-side line cap for the LCS table after common prefix/suffix trimming. */
export const OS_DIFF_MAX_LCS_LINES = 2000;

function splitLines(content: string): string[] {
  const lines = content.split("\n");
  if (lines.length && lines[lines.length - 1] === "") lines.pop();
  return lines;
}

export function hasChanges(from: string, to: string): boolean {
  return from !== to;
}

/** How many lines were added or removed across the hunks. */
export function countChangedLines(hunks: OsDiffHunk[]): number {
  return hunks.filter((hunk) => hunk.type !== "context").length;
}

/** LCS length table for the (already trimmed + capped) middle windows. */
function buildLcsTable(a: string[], b: string[]): Uint32Array {
  const width = b.length + 1;
  const table = new Uint32Array((a.length + 1) * width);
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      table[i * width + j] =
        a[i] === b[j]
          ? table[(i + 1) * width + j + 1] + 1
          : Math.max(table[(i + 1) * width + j], table[i * width + j + 1]);
    }
  }
  return table;
}

/** Walk the LCS table emitting remove/add/context hunks in diffLines order. */
function walkLcs(a: string[], b: string[], hunks: OsDiffHunk[]): void {
  const table = buildLcsTable(a, b);
  const width = b.length + 1;
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      hunks.push({ type: "context", text: a[i] });
      i++;
      j++;
    } else if (table[(i + 1) * width + j] >= table[i * width + j + 1]) {
      hunks.push({ type: "remove", text: a[i] });
      i++;
    } else {
      hunks.push({ type: "add", text: b[j] });
      j++;
    }
  }
  while (i < a.length) hunks.push({ type: "remove", text: a[i++] });
  while (j < b.length) hunks.push({ type: "add", text: b[j++] });
}

export function lineDiff(from: string, to: string): OsDiffHunk[] {
  const a = splitLines(from);
  const b = splitLines(to);

  // Trim the common prefix and suffix — the typical edit touches a small
  // window, so the DP table only ever sees the changed middle.
  let prefix = 0;
  while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) {
    prefix++;
  }
  let suffix = 0;
  while (
    suffix < a.length - prefix &&
    suffix < b.length - prefix &&
    a[a.length - 1 - suffix] === b[b.length - 1 - suffix]
  ) {
    suffix++;
  }

  const hunks: OsDiffHunk[] = [];
  for (let i = 0; i < prefix; i++) hunks.push({ type: "context", text: a[i] });

  const middleA = a.slice(prefix, a.length - suffix);
  const middleB = b.slice(prefix, b.length - suffix);
  if (middleA.length > OS_DIFF_MAX_LCS_LINES || middleB.length > OS_DIFF_MAX_LCS_LINES) {
    for (const text of middleA) hunks.push({ type: "remove", text });
    for (const text of middleB) hunks.push({ type: "add", text });
  } else if (middleA.length || middleB.length) {
    walkLcs(middleA, middleB, hunks);
  }

  for (let i = a.length - suffix; i < a.length; i++) {
    hunks.push({ type: "context", text: a[i] });
  }
  return hunks;
}
