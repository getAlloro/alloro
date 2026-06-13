import axios from "axios";
import { collectUrlAuditSnapshot } from "./urlCollectorService";
import { compareExternalIdentity } from "./entityConsistencyService";
import type {
  ExternalEntitySourceInput,
  ExtractedBusinessIdentity,
  UrlAuditSnapshot,
} from "./types";

const SERPAPI_API_KEY = process.env.SERPAPI_API_KEY;
const SERPAPI_ENDPOINT = "https://serpapi.com/search.json";

const KNOWN_EXTERNAL_HOSTS = [
  "facebook.com",
  "instagram.com",
  "linkedin.com",
  "yelp.com",
  "healthgrades.com",
  "zocdoc.com",
  "mapquest.com",
  "doctor.webmd.com",
  "sharecare.com",
  "opencare.com",
  "maps.google.com",
  "google.com",
];

/**
 * Collect external entity sources for the audited business once per run.
 *
 * Discovery order:
 *   1. SerpApi Google organic results for name/phone/address queries.
 *   2. Known directory/social profile links already present on the audited page.
 * Same-host results are dropped so the audited site never appears as its own
 * "external" source. Each candidate is fetched and its identity compared against
 * the business baseline. When nothing external is found the array is empty and
 * the consistency checks score as unavailable rather than citing the site itself.
 */
export async function collectExternalEntitySources(
  snapshot: UrlAuditSnapshot,
  baseline: ExtractedBusinessIdentity,
): Promise<ExternalEntitySourceInput[]> {
  const auditedHost = safeHost(snapshot.finalUrl);
  const searchResults = await searchSerpApi(baseline, auditedHost);
  const linkedSources = snapshot.externalLinks
    .filter((url) => isKnownExternalSource(url) && safeHost(url) !== auditedHost)
    .slice(0, 8)
    .map((url) => ({
      query: baseline.name || snapshot.finalUrl,
      url,
      title: null,
      sourceHost: safeHost(url),
      sourceType: inferSourceType(url),
      reliabilityScore: inferReliability(url),
      metadata: { discovery: "linked_from_submitted_url" },
    }));

  const candidates = dedupeByUrl([...searchResults, ...linkedSources])
    .filter((candidate) => safeHost(candidate.url) !== auditedHost)
    .slice(0, 10);
  const sources: ExternalEntitySourceInput[] = [];

  for (const candidate of candidates) {
    try {
      const externalSnapshot = await collectUrlAuditSnapshot(candidate.url);
      // Bot-check / CAPTCHA / empty pages yield garbage identity ("Security
      // Check", random digits) — mark them unreadable instead of false-flagging.
      if (looksBlocked(externalSnapshot)) {
        sources.push({
          ...candidate,
          title: candidate.title || externalSnapshot.title,
          entityMatchState: "unavailable",
          extractedFields: {},
          comparedFields: {},
          metadata: {
            ...candidate.metadata,
            reason: "Listing page was blocked or unreadable (bot check or empty page).",
          },
          fetchedAt: new Date().toISOString(),
        });
        continue;
      }
      // Pass the full page text so the comparison can give benefit of the doubt:
      // a decoy footer address shouldn't flag a mismatch when the real one is also present.
      const comparison = compareExternalIdentity(
        baseline,
        externalSnapshot.identity,
        externalSnapshot.text,
      );
      sources.push({
        ...candidate,
        title: candidate.title || externalSnapshot.title,
        entityMatchState: comparison.state,
        extractedFields: externalSnapshot.identity,
        comparedFields: comparison.comparedFields,
        fetchedAt: new Date().toISOString(),
      });
    } catch (error) {
      sources.push({
        ...candidate,
        entityMatchState: "unavailable",
        extractedFields: {},
        comparedFields: {},
        metadata: {
          ...candidate.metadata,
          error: error instanceof Error ? error.message : "External source fetch failed",
        },
        fetchedAt: new Date().toISOString(),
      });
    }
  }

  return sources;
}

async function searchSerpApi(
  baseline: ExtractedBusinessIdentity,
  auditedHost: string,
): Promise<Array<Omit<ExternalEntitySourceInput, "entityMatchState">>> {
  if (!SERPAPI_API_KEY || !baseline.name) return [];

  const queries = buildQueries(baseline);
  const seen = new Set<string>();
  const results: Array<Omit<ExternalEntitySourceInput, "entityMatchState">> = [];
  for (const query of queries) {
    try {
      const response = await axios.get(SERPAPI_ENDPOINT, {
        params: {
          engine: "google",
          q: query,
          num: 10,
          hl: "en",
          gl: "us",
          api_key: SERPAPI_API_KEY,
        },
        timeout: 15_000,
      });
      if (response.data?.error) continue;
      for (const item of normalizeSearchItems(response.data)) {
        const host = safeHost(item.url);
        if (!host || host === auditedHost || seen.has(item.url)) continue;
        seen.add(item.url);
        results.push({
          query,
          url: item.url,
          title: item.title,
          sourceHost: host,
          sourceType: inferSourceType(item.url),
          reliabilityScore: inferReliability(item.url),
          extractedFields: {},
          comparedFields: {},
          metadata: { discovery: "serpapi_google" },
          fetchedAt: null,
        });
      }
    } catch {
      continue;
    }
  }
  return results.slice(0, 12);
}

function buildQueries(baseline: ExtractedBusinessIdentity): string[] {
  const pieces = [baseline.name, baseline.phone, baseline.address]
    .filter((piece): piece is string => Boolean(piece));
  const queries = new Set<string>();
  if (baseline.name) queries.add(`"${baseline.name}"`);
  if (baseline.name && baseline.phone) queries.add(`"${baseline.name}" "${baseline.phone}"`);
  if (baseline.name && baseline.address) queries.add(`"${baseline.name}" "${baseline.address}"`);
  if (pieces.length) queries.add(pieces.join(" "));
  return Array.from(queries).slice(0, 4);
}

function normalizeSearchItems(data: unknown): Array<{ url: string; title: string | null }> {
  if (!data || typeof data !== "object") return [];
  const record = data as Record<string, unknown>;
  const rawItems =
    (Array.isArray(record.organic_results) && record.organic_results) ||
    (Array.isArray(record.items) && record.items) ||
    (Array.isArray(record.results) && record.results) ||
    [];
  return rawItems.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const itemRecord = item as Record<string, unknown>;
    const url = stringValue(itemRecord.link) || stringValue(itemRecord.url);
    if (!url) return [];
    return [{ url, title: stringValue(itemRecord.title) }];
  });
}

function dedupeByUrl<T extends { url: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const normalized = item.url.replace(/\/$/, "");
    if (seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

function isKnownExternalSource(url: string): boolean {
  const host = safeHost(url);
  if (!host) return false;
  return KNOWN_EXTERNAL_HOSTS.some((known) => host === known || host.endsWith(`.${known}`));
}

function inferSourceType(url: string): string {
  const host = safeHost(url);
  if (/facebook|instagram|linkedin|youtube/.test(host)) return "social_profile";
  if (/yelp|healthgrades|zocdoc|webmd|sharecare|opencare/.test(host)) return "directory";
  if (/google|maps/.test(host)) return "search_profile";
  return "external_mention";
}

function inferReliability(url: string): number {
  const type = inferSourceType(url);
  if (type === "search_profile") return 85;
  if (type === "directory") return 72;
  if (type === "social_profile") return 68;
  return 50;
}

function looksBlocked(snapshot: UrlAuditSnapshot): boolean {
  if (snapshot.text.replace(/\s+/g, "").length < 180) return true;
  const probe = `${snapshot.title || ""} ${snapshot.text.slice(0, 600)}`.toLowerCase();
  return /just a moment|attention required|security check|access denied|verify you are|are you a robot|robot check|unusual traffic|captcha|request unsuccessful|please enable (cookies|javascript)|enable javascript to|temporarily unavailable|403 forbidden|access to this page has been denied/.test(
    probe,
  );
}

function safeHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
