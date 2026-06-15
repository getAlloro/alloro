/**
 * Identity Warmup — dental sub-page auto-discovery.
 *
 * Parses scraped homepage HTML, extracts same-origin `<a href>` links, and
 * filters them down to a whitelist of dental-practice sub-pages worth feeding
 * into identity distillation. Pure functions over cheerio + URL: no LLM, no DB.
 *
 * Extracted from service.identity-warmup.ts during a behavior-preserving
 * decomposition — logic is identical to the original.
 */

import * as cheerio from "cheerio";
import { normalizeScrapeUrl } from "../feature-services/service.url-scrape-strategies";

/**
 * Whitelist of pathname patterns that map to dental-practice sub-pages we
 * want to feed into identity distillation. Case-insensitive. Narrow by
 * design — `/blog`, `/news`, `/post`, and per-treatment pages are excluded
 * (too much content volume, low signal per the plan).
 */
const SUB_PAGE_WHITELIST: RegExp[] = [
  /^\/meet-dr-/i,
  /^\/dr-/i,
  /^\/doctor/i,
  /^\/our-team/i,
  /^\/our-doctors/i,
  /^\/team/i,
  /^\/services/i,
  /^\/treatments/i,
  /^\/procedures/i,
  /^\/about/i,
  /^\/our-practice/i,
  /^\/our-story/i,
];

const DROPPED_FILE_EXT = /\.(pdf|docx?|jpe?g|png|gif|mp4|zip|svg|ico)$/i;
const MAX_DISCOVERED_URL_LENGTH = 200;

/**
 * Parse every scraped homepage's raw HTML, extract `<a href>` values,
 * normalize, filter (same-origin + whitelist + file-extension reject +
 * length cap), dedupe against already-scraped URLs, and return the list.
 *
 * Result URLs are `normalizeScrapeUrl().primary` values — the scrape layer
 * will still attempt the fallback once before escalating if they block.
 */
export function collectDiscoveredSubPages(
  rawHtmlByUrl: Map<string, string>,
  scrapedPagesRaw: Record<string, string>,
): string[] {
  const alreadyScheduled = new Set<string>();
  for (const key of Object.keys(scrapedPagesRaw)) {
    // keys are `${url}#${pageKey}` — strip the anchor to compare URLs only.
    const hashIdx = key.lastIndexOf("#");
    const urlPart = hashIdx >= 0 ? key.slice(0, hashIdx) : key;
    alreadyScheduled.add(urlPart);
  }

  const seen = new Set<string>(alreadyScheduled);
  const ordered: string[] = [];

  for (const [pageUrl, html] of rawHtmlByUrl.entries()) {
    let pageUrlParsed: URL;
    try {
      pageUrlParsed = new URL(pageUrl);
    } catch {
      continue;
    }

    let $: cheerio.CheerioAPI;
    try {
      $ = cheerio.load(html);
    } catch {
      continue;
    }

    $("a[href]").each((_, el) => {
      const href = $(el).attr("href");
      if (!href || typeof href !== "string") return;

      // Resolve relative URLs against the source page.
      let resolved: URL;
      try {
        resolved = new URL(href, pageUrl);
      } catch {
        return;
      }

      // Same-origin only (hostname match — different ports would already be
      // oddities on dental sites; hostname equality is sufficient).
      if (resolved.hostname !== pageUrlParsed.hostname) return;

      // Strip fragment — we care about the path, not in-page anchors.
      resolved.hash = "";

      // File-extension rejects.
      if (DROPPED_FILE_EXT.test(resolved.pathname)) return;

      // `?download=*` rejects.
      if (resolved.searchParams.has("download")) return;

      // Length cap.
      if (resolved.href.length > MAX_DISCOVERED_URL_LENGTH) return;

      // Whitelist pathname match.
      const path = resolved.pathname;
      if (!SUB_PAGE_WHITELIST.some((rx) => rx.test(path))) return;

      // Normalize (http→https, www) — produces the actual URL we'd scrape.
      const { primary } = normalizeScrapeUrl(resolved.href);

      if (seen.has(primary)) return;
      seen.add(primary);
      ordered.push(primary);
    });
  }

  return ordered;
}
