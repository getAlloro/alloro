import axios from "axios";
import logger from "../../lib/logger";
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
 * Outcome of an external-entity collection (§3.2 typed error response).
 *
 * `provider_unavailable` means the discovery provider could not be reached, so
 * the search step never ran and any sources present came only from the fallback
 * (links on the page) — the list is knowably incomplete. It is deliberately
 * distinct from `{ status: "ok", sources: [] }`, which is a real, complete
 * measurement that legitimately found nothing.
 *
 * Callers that persist observations MUST NOT record a `provider_unavailable`
 * run — a zero would be a silent false "we checked and found nothing", and a
 * partial count would understate reality. Display-only callers may show
 * `sources` regardless.
 */
export type ExternalEntityCollectionResult =
  | { status: "ok"; sources: ExternalEntitySourceInput[] }
  | {
      status: "provider_unavailable";
      reason: string;
      /**
       * Whatever step-2 (linked) discovery still found. Knowably INCOMPLETE —
       * useful to display, never safe to persist as a finished measurement.
       */
      sources: ExternalEntitySourceInput[];
    };

/**
 * Collect external entity sources for the audited business once per run.
 *
 * Back-compat wrapper (§3.2): the AI-SEO audit path degrades gracefully by
 * design — it shows whatever sources were found and scores the rest as
 * "unavailable" rather than failing the whole audit. It keeps the original
 * array-returning contract and its behaviour is UNCHANGED by the typed status,
 * including the linked-source fallback when SerpApi is down.
 *
 * Callers that PERSIST an observation must instead use
 * `collectExternalEntitySourcesWithStatus` and skip persistence on
 * `provider_unavailable` — see `services/nap-consistency/executor.ts`.
 */
export async function collectExternalEntitySources(
  snapshot: UrlAuditSnapshot,
  baseline: ExtractedBusinessIdentity,
): Promise<ExternalEntitySourceInput[]> {
  const result = await collectExternalEntitySourcesWithStatus(snapshot, baseline);
  return result.sources;
}

/**
 * Collect external entity sources, distinguishing a real zero-result from a
 * provider outage.
 *
 * Discovery order:
 *   1. SerpApi Google organic results for name/phone/address queries.
 *   2. Known directory/social profile links already present on the audited page.
 * Same-host results are dropped so the audited site never appears as its own
 * "external" source. Each candidate is fetched and its identity compared against
 * the business baseline.
 *
 * When SerpApi is unavailable the status is `provider_unavailable` EVEN IF the
 * page's own links still yielded candidates: step 1 of the discovery order did
 * not run, so the source list is knowably incomplete and recording it as a
 * finished measurement would understate reality. Those partial sources are still
 * returned (the audit displays them); only persistence is gated on the status.
 */
export async function collectExternalEntitySourcesWithStatus(
  snapshot: UrlAuditSnapshot,
  baseline: ExtractedBusinessIdentity,
): Promise<ExternalEntityCollectionResult> {
  const auditedHost = safeHost(snapshot.finalUrl);
  const search = await searchSerpApi(baseline, auditedHost);
  if (search.status === "unavailable") {
    logger.warn(
      { auditedHost, reason: search.reason },
      "[EXTERNAL-ENTITY] discovery provider unavailable — results are incomplete",
    );
  }
  const searchResults = search.status === "ok" ? search.results : [];
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

  // The sources are returned either way; the STATUS is what tells a persisting
  // caller that this run is not a trustworthy zero.
  return search.status === "unavailable"
    ? { status: "provider_unavailable", reason: search.reason, sources }
    : { status: "ok", sources };
}

type SerpApiSearchOutcome =
  | { status: "ok"; results: Array<Omit<ExternalEntitySourceInput, "entityMatchState">> }
  | { status: "unavailable"; reason: string };

/**
 * §3.2: never swallow an error. Every failure is logged and surfaced as a typed
 * state instead of an empty array that reads like "we checked and found nothing".
 *
 * Unavailable when: the API key is absent (we cannot ask the provider at all),
 * or EVERY query failed (transport error, or SerpApi's in-body `error` field —
 * rate limit / bad key). A partial failure still returns `ok`: some queries
 * answered, so a real (if smaller) measurement happened.
 */
async function searchSerpApi(
  baseline: ExtractedBusinessIdentity,
  auditedHost: string,
): Promise<SerpApiSearchOutcome> {
  if (!SERPAPI_API_KEY) {
    return { status: "unavailable", reason: "SERPAPI_API_KEY is not configured" };
  }
  // Not a provider fault: with no business name there is nothing to query.
  // Linked-source discovery can still run, so this is a real zero, not an outage.
  if (!baseline.name) return { status: "ok", results: [] };

  const queries = buildQueries(baseline);
  const seen = new Set<string>();
  const results: Array<Omit<ExternalEntitySourceInput, "entityMatchState">> = [];
  let failedQueries = 0;
  const failureReasons: string[] = [];
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
      // SerpApi reports failure in a 200 body (rate limit, invalid key, ...).
      if (response.data?.error) {
        failedQueries++;
        failureReasons.push(String(response.data.error));
        logger.warn(
          { query, err: String(response.data.error) },
          "[SERPAPI] query returned an error body",
        );
        continue;
      }
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
    } catch (error) {
      failedQueries++;
      const reason = error instanceof Error ? error.message : "SerpApi request failed";
      failureReasons.push(reason);
      logger.warn({ query, err: reason }, "[SERPAPI] query request failed");
      continue;
    }
  }

  // Every query failed → we never reached the provider. Report it, don't fake a zero.
  if (queries.length > 0 && failedQueries === queries.length) {
    return {
      status: "unavailable",
      reason: `all ${failedQueries} SerpApi queries failed: ${failureReasons[0]}`,
    };
  }
  return { status: "ok", results: results.slice(0, 12) };
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
