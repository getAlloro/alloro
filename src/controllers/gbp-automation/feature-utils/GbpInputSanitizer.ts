export const GBP_INPUT_LIMITS = {
  customization: 3000,
  voiceExample: 1200,
  rule: 500,
  reviewText: 3000,
  url: 2048,
  maxVoiceExamples: 5,
  maxRules: 12,
};

export function sanitizeGbpText(
  value: unknown,
  maxLength: number
): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ")
    .trim();
  if (!cleaned) return null;
  return cleaned.slice(0, maxLength);
}

export function sanitizeGbpTextArray(
  value: unknown,
  maxItems: number,
  maxLength: number
): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value
    .map((item) => sanitizeGbpText(item, maxLength))
    .filter((item): item is string => Boolean(item))
    .slice(0, maxItems);
}

export function sanitizeGbpUrl(value: unknown): string | null {
  const text = sanitizeGbpText(value, GBP_INPUT_LIMITS.url);
  if (!text) return null;
  try {
    const url = new URL(text);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}
