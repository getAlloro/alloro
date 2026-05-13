export function compactClaritySnippetCode(code: string): string {
  return code.replace(/\s+/g, " ").trim().slice(0, 220);
}

export function extractClarityProjectId(code: string): string | null {
  const directTagMatch = code.match(/clarity\.ms\/tag\/([A-Za-z0-9_-]+)/i);
  if (directTagMatch?.[1]) return directTagMatch[1];

  const concatenatedTagMatch = code.match(
    /clarity\.ms\/tag\/["']?\s*\+\s*["']([A-Za-z0-9_-]+)["']/i,
  );
  if (concatenatedTagMatch?.[1]) return concatenatedTagMatch[1];

  const iifeArgumentMatch = code.match(
    /["']clarity["']\s*,\s*["']script["']\s*,\s*["']([A-Za-z0-9_-]+)["']/i,
  );
  return iifeArgumentMatch?.[1] ?? null;
}

export function isClaritySnippetCode(code: string): boolean {
  const lower = code.toLowerCase();
  return (
    lower.includes("clarity.ms/tag") ||
    /["']clarity["']\s*,\s*["']script["']\s*,\s*["'][A-Za-z0-9_-]+["']/i.test(code) ||
    /function\s*\(\s*c\s*,\s*l\s*,\s*a\s*,\s*r\s*,\s*i\s*,\s*t\s*,\s*y\s*\)/i.test(code) ||
    lower.includes("microsoft clarity")
  );
}
