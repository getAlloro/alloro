import * as cheerio from "cheerio";
import type { ExtractedBusinessIdentity } from "./types";

const PHONE_PATTERN = /(?:\+?1[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}/;
const KNOWN_PROFILE_HOSTS = [
  "facebook.com",
  "instagram.com",
  "linkedin.com",
  "youtube.com",
  "yelp.com",
  "healthgrades.com",
  "zocdoc.com",
  "maps.google.com",
  "google.com",
  "bing.com",
];

export function extractIdentityFromHtml(
  html: string,
  finalUrl: string,
): {
  identity: ExtractedBusinessIdentity;
  schemaItems: unknown[];
  schemaTypes: string[];
} {
  const $ = cheerio.load(html);
  const schemaItems = extractJsonLd($);
  const schemaTypes = collectSchemaTypes(schemaItems);
  const schemaIdentity = extractIdentityFromSchema(schemaItems);
  const text = $("body").text().replace(/\s+/g, " ").trim();
  const title = $("title").first().text().trim();
  const phone = schemaIdentity.phone || text.match(PHONE_PATTERN)?.[0] || null;
  const sameAs = new Set<string>(schemaIdentity.sameAs || []);

  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    const absolute = normalizeUrl(href, finalUrl);
    if (!absolute) return;
    const host = safeHost(absolute);
    if (host && KNOWN_PROFILE_HOSTS.some((known) => host.endsWith(known))) {
      sameAs.add(absolute);
    }
  });

  return {
    identity: {
      name: schemaIdentity.name || cleanTitle(title) || null,
      phone,
      address: schemaIdentity.address || inferAddress(text),
      website: schemaIdentity.website || finalUrl,
      hours: schemaIdentity.hours || null,
      providers: schemaIdentity.providers || inferProviders(text),
      services: schemaIdentity.services || inferServices(text),
      sameAs: Array.from(sameAs).slice(0, 12),
    },
    schemaItems,
    schemaTypes,
  };
}

export function normalizePhone(value?: string | null): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  if (digits.length < 10) return null;
  return digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
}

export function normalizeDomain(value?: string | null): string | null {
  if (!value) return null;
  try {
    return new URL(value.startsWith("http") ? value : `https://${value}`).hostname
      .replace(/^www\./, "")
      .toLowerCase();
  } catch {
    return value.replace(/^www\./, "").toLowerCase();
  }
}

export function normalizeComparableText(value?: string | null): string | null {
  if (!value) return null;
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function extractJsonLd($: cheerio.CheerioAPI): unknown[] {
  const items: unknown[] = [];
  $("script[type='application/ld+json']").each((_, el) => {
    const raw = $(el).contents().text();
    if (!raw.trim()) return;
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) items.push(...parsed);
      else items.push(parsed);
    } catch {
      // Invalid JSON-LD is scored later; extraction should not throw.
    }
  });
  return items.flatMap(expandSchemaGraph);
}

function expandSchemaGraph(item: unknown): unknown[] {
  if (!item || typeof item !== "object") return [];
  const record = item as Record<string, unknown>;
  if (Array.isArray(record["@graph"])) {
    return record["@graph"].flatMap(expandSchemaGraph);
  }
  return [item];
}

function collectSchemaTypes(items: unknown[]): string[] {
  const types = new Set<string>();
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const type = (item as Record<string, unknown>)["@type"];
    if (Array.isArray(type)) {
      type.forEach((entry) => typeof entry === "string" && types.add(entry));
    } else if (typeof type === "string") {
      types.add(type);
    }
  }
  return Array.from(types);
}

function extractIdentityFromSchema(items: unknown[]): ExtractedBusinessIdentity {
  const result: ExtractedBusinessIdentity = {};
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const type = record["@type"];
    const typeText = Array.isArray(type) ? type.join(" ") : String(type || "");
    const isEntity = /Organization|LocalBusiness|Dentist|MedicalBusiness|Physician|Orthodontic/i.test(typeText);
    if (!isEntity) continue;

    result.name ||= stringValue(record.name);
    result.phone ||= stringValue(record.telephone);
    result.website ||= stringValue(record.url);
    result.address ||= addressValue(record.address);
    result.hours ||= Array.isArray(record.openingHours)
      ? record.openingHours.join("; ")
      : stringValue(record.openingHours);
    const sameAs = arrayStrings(record.sameAs);
    if (sameAs.length) result.sameAs = [...(result.sameAs || []), ...sameAs];
  }
  return result;
}

function addressValue(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  return [
    stringValue(record.streetAddress),
    stringValue(record.addressLocality),
    stringValue(record.addressRegion),
    stringValue(record.postalCode),
  ].filter(Boolean).join(", ") || null;
}

function arrayStrings(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === "string");
  }
  if (typeof value === "string") return [value];
  return [];
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function inferAddress(text: string): string | null {
  // Street (number + name + suffix), optional unit, optional ", City", optional
  // ", State" (abbrev or full), optional ZIP. Bounded groups stop the match at
  // the end of the address so trailing page prose isn't captured.
  const match = text.match(
    /\b\d{1,6}\s+[A-Za-z0-9 .'#-]{2,40}?(?:Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Boulevard|Blvd|Lane|Ln|Way|Court|Ct|Place|Pl|Parkway|Pkwy|Circle|Cir|Suite|Ste)\b\.?(?:\s*#?\s*\d{1,5})?(?:,\s*[A-Za-z][A-Za-z .'-]{1,25})?(?:,\s*(?:[A-Z]{2}\b|[A-Z][a-z]+))?(?:\s+\d{5}(?:-\d{4})?)?/i,
  );
  if (!match) return null;
  return match[0].replace(/\s+/g, " ").trim().slice(0, 80) || null;
}

function inferProviders(text: string): string[] {
  const matches = text.match(/\bDr\.\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?/g) || [];
  return Array.from(new Set(matches)).slice(0, 8);
}

function inferServices(text: string): string[] {
  const candidates = [
    "braces",
    "invisalign",
    "orthodontics",
    "endodontics",
    "root canal",
    "dental implants",
    "emergency dentistry",
    "clear aligners",
    "retainers",
  ];
  const lower = text.toLowerCase();
  return candidates.filter((candidate) => lower.includes(candidate));
}

function cleanTitle(title: string): string | null {
  if (!title) return null;
  return title.split(/[|-]/)[0]?.trim() || null;
}

function normalizeUrl(href: string | undefined, baseUrl: string): string | null {
  if (!href || href.startsWith("mailto:") || href.startsWith("tel:")) return null;
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return null;
  }
}

function safeHost(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}
