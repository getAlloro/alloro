export function normalizeWebsiteUrl(candidate: string): string | null {
  const trimmed = candidate.trim();
  if (!trimmed) return null;
  const withProtocol = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  try {
    return new URL(withProtocol).toString();
  } catch {
    return null;
  }
}

export function stripHtmlTags(value: string): string {
  return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

export function getHtmlAttr(
  html: string,
  selectorRegex: RegExp,
  attr: string,
): string | null {
  const match = html.match(selectorRegex);
  if (!match) return null;
  const attrMatch = match[0].match(new RegExp(`${attr}=["']([^"']+)["']`, "i"));
  return attrMatch?.[1]?.trim() || null;
}

export function getHtmlTitle(html: string): string | null {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match?.[1] ? stripHtmlTags(match[1]) : null;
}

export function getMetaContent(html: string, name: string): string | null {
  const regex = new RegExp(
    `<meta[^>]+name=["']${name}["'][^>]*>|<meta[^>]+content=["'][^"']+["'][^>]+name=["']${name}["'][^>]*>`,
    "i",
  );
  return getHtmlAttr(html, regex, "content");
}

export function extractSchemaTypes(html: string): string[] {
  const types = new Set<string>();
  const scripts = html.matchAll(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  );

  for (const script of scripts) {
    try {
      const parsed = JSON.parse(script[1].trim());
      const entries = Array.isArray(parsed) ? parsed : [parsed];
      for (const entry of entries) {
        const rawType = entry?.["@type"];
        if (Array.isArray(rawType)) {
          rawType.forEach((type) => types.add(String(type).toLowerCase()));
        } else if (rawType) {
          types.add(String(rawType).toLowerCase());
        }
      }
    } catch {
      // Invalid JSON-LD is captured by the absence of usable schema types.
    }
  }

  return Array.from(types);
}

export function normalizeDigits(value: string | null | undefined): string {
  return (value || "").replace(/\D/g, "");
}

export function includesAddressHint(
  htmlText: string,
  addressLines: string[],
): boolean {
  return addressLines
    .map((line) => line.toLowerCase().trim())
    .filter((line) => line.length >= 6)
    .some((line) => htmlText.includes(line));
}
