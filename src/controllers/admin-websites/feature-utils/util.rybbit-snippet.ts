export function compactSnippetCode(code: string): string {
  return code.replace(/\s+/g, " ").trim().slice(0, 220);
}

export function extractRybbitSiteId(code: string): string | null {
  return code.match(/data-site-id=["']?([^"'\s>]+)/i)?.[1] ?? null;
}

export function isRybbitSnippetCode(code: string): boolean {
  const lower = code.toLowerCase();
  const hasSiteId = /data-site-id=["']?[^"'\s>]+/i.test(code);
  return hasSiteId && (
    lower.includes("analytics.getalloro.com") ||
    lower.includes("/api/script.js") ||
    lower.includes("rybbit")
  );
}
