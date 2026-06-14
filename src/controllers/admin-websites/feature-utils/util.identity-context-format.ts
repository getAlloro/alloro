/**
 * Identity Context — shared formatting helpers.
 *
 * Tiny pure string helpers used by both the stable-context builder and the
 * per-component context builder. No LLM, no DB.
 */

/**
 * Best-effort "city, ST" label from a full street address. Falls back to the
 * trimmed address when the comma-split doesn't look like a US address.
 * Used only for LLM context — no callers rely on exact formatting.
 */
export function shortLocationLabel(address: string | null | undefined): string | null {
  if (!address) return null;
  const parts = address.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 3) {
    const city = parts[parts.length - 3];
    const stateZip = parts[parts.length - 2];
    const st = stateZip.split(/\s+/)[0];
    return st ? `${city}, ${st}` : city;
  }
  if (parts.length === 2) return parts[1];
  return parts[0] || null;
}

export function kvLines(obj: Record<string, unknown>): string {
  const out: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    if (v === null || v === undefined || v === "") continue;
    out.push(`- ${k}: ${v}`);
  }
  return out.join("\n") || "- (unset)";
}
