import * as cheerio from "cheerio";
import { assertPublicHttpUrl } from "./urlSafetyService";
import { extractIdentityFromHtml } from "./identityExtractionService";
import type { UrlAuditSnapshot } from "./types";

const MAX_HTML_BYTES = 1_500_000;
const MAX_REDIRECTS = 5;
const FETCH_TIMEOUT_MS = 12_000;

export async function collectUrlAuditSnapshot(rawUrl: string): Promise<UrlAuditSnapshot> {
  const requested = await assertPublicHttpUrl(rawUrl);
  const response = await fetchWithSafeRedirects(requested);
  const headers = headersToRecord(response.headers);
  const status = response.status;
  const contentLength = Number(headers["content-length"] || 0);
  if (contentLength > MAX_HTML_BYTES) {
    throw new Error("URL response is too large to audit safely");
  }

  const html = (await response.text()).slice(0, MAX_HTML_BYTES);
  const finalUrl = response.url || requested.toString();
  const $ = cheerio.load(html);
  const text = $("body").text().replace(/\s+/g, " ").trim();
  const title = $("title").first().text().trim() || null;
  const metaDescription = $("meta[name='description']").attr("content")?.trim() || null;
  const metaRobots = [
    $("meta[name='robots']").attr("content"),
    $("meta[name='googlebot']").attr("content"),
  ].filter(Boolean).join(", ") || null;
  const canonicalUrl = normalizeUrl($("link[rel='canonical']").attr("href"), finalUrl);
  const links = collectLinks($, finalUrl);
  const robots = await fetchRobots(finalUrl);
  const sitemapUrls = extractSitemapUrls(robots.text);
  const isBlockedByRobots = robots.text
    ? isPathBlockedByRobots(new URL(finalUrl).pathname || "/", robots.text)
    : false;
  const isInSitemap = sitemapUrls.length > 0
    ? await checkSitemapMentionsUrl(sitemapUrls.slice(0, 3), finalUrl)
    : null;
  const identityResult = extractIdentityFromHtml(html, finalUrl);

  return {
    requestedUrl: requested.toString(),
    finalUrl,
    finalStatus: status,
    ok: response.ok,
    headers,
    html,
    text,
    title,
    metaDescription,
    canonicalUrl,
    metaRobots,
    robotsTxtStatus: robots.status,
    robotsTxt: robots.text,
    isBlockedByRobots,
    sitemapUrls,
    isInSitemap,
    schemaTypes: identityResult.schemaTypes,
    schemaItems: identityResult.schemaItems,
    internalLinks: links.internal,
    externalLinks: links.external,
    identity: identityResult.identity,
  };
}

async function fetchWithSafeRedirects(url: URL): Promise<Response> {
  let current = url;
  for (let attempt = 0; attempt <= MAX_REDIRECTS; attempt += 1) {
    await assertPublicHttpUrl(current.toString());
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(current, {
        redirect: "manual",
        signal: controller.signal,
        headers: {
          "user-agent": "AlloroAISEOAudit/1.0 (+https://getalloro.com)",
          accept: "text/html,application/xhtml+xml",
        },
      });
      if (!isRedirect(response.status)) return response;
      const location = response.headers.get("location");
      if (!location) return response;
      current = new URL(location, current);
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new Error("URL exceeded redirect limit");
}

function isRedirect(status: number): boolean {
  return [301, 302, 303, 307, 308].includes(status);
}

function headersToRecord(headers: Headers): Record<string, string> {
  const record: Record<string, string> = {};
  headers.forEach((value, key) => {
    record[key.toLowerCase()] = value;
  });
  return record;
}

function collectLinks(
  $: cheerio.CheerioAPI,
  finalUrl: string,
): { internal: string[]; external: string[] } {
  const origin = new URL(finalUrl).origin;
  const internal = new Set<string>();
  const external = new Set<string>();
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    const normalized = normalizeUrl(href, finalUrl);
    if (!normalized) return;
    if (new URL(normalized).origin === origin) internal.add(normalized);
    else external.add(normalized);
  });
  return {
    internal: Array.from(internal).slice(0, 100),
    external: Array.from(external).slice(0, 100),
  };
}

function normalizeUrl(href: string | undefined, baseUrl: string): string | null {
  if (!href || href.startsWith("mailto:") || href.startsWith("tel:") || href.startsWith("#")) {
    return null;
  }
  try {
    const parsed = new URL(href, baseUrl);
    if (!["http:", "https:"].includes(parsed.protocol)) return null;
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return null;
  }
}

async function fetchRobots(finalUrl: string): Promise<{ status: number | null; text: string | null }> {
  try {
    const origin = new URL(finalUrl).origin;
    const robotsUrl = `${origin}/robots.txt`;
    await assertPublicHttpUrl(robotsUrl);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(robotsUrl, {
        signal: controller.signal,
        headers: { "user-agent": "AlloroAISEOAudit/1.0" },
      });
      const text = response.ok ? (await response.text()).slice(0, 200_000) : null;
      return { status: response.status, text };
    } finally {
      clearTimeout(timeout);
    }
  } catch {
    return { status: null, text: null };
  }
}

function isPathBlockedByRobots(path: string, robotsTxt: string): boolean {
  const lines = robotsTxt.split(/\r?\n/);
  let applies = false;
  const disallows: string[] = [];
  for (const raw of lines) {
    const line = raw.split("#")[0].trim();
    if (!line) continue;
    const [fieldRaw, ...rest] = line.split(":");
    const field = fieldRaw?.trim().toLowerCase();
    const value = rest.join(":").trim();
    if (field === "user-agent") {
      applies = value === "*" || /googlebot|bingbot|oai-searchbot/i.test(value);
    } else if (applies && field === "disallow" && value) {
      disallows.push(value);
    }
  }
  return disallows.some((rule) => path.startsWith(rule));
}

function extractSitemapUrls(robotsTxt: string | null): string[] {
  if (!robotsTxt) return [];
  return robotsTxt
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^sitemap:/i.test(line))
    .map((line) => line.replace(/^sitemap:\s*/i, "").trim())
    .filter(Boolean)
    .slice(0, 10);
}

async function checkSitemapMentionsUrl(sitemapUrls: string[], finalUrl: string): Promise<boolean | null> {
  for (const sitemapUrl of sitemapUrls) {
    try {
      await assertPublicHttpUrl(sitemapUrl);
      const response = await fetch(sitemapUrl, {
        headers: { "user-agent": "AlloroAISEOAudit/1.0" },
      });
      if (!response.ok) continue;
      const text = (await response.text()).slice(0, 1_000_000);
      if (text.includes(finalUrl)) return true;
    } catch {
      continue;
    }
  }
  return false;
}
