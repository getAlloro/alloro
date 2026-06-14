import axios from "axios";
import * as cheerio from "cheerio";
import { MindModel } from "../../../models/MindModel";
import { MindSourceModel } from "../../../models/MindSourceModel";
import { MindDiscoveryBatchModel } from "../../../models/MindDiscoveryBatchModel";
import { MindDiscoveredPostModel } from "../../../models/MindDiscoveredPostModel";
import logger from "../../../lib/logger";

const FETCH_TIMEOUT = parseInt(process.env.MINDS_HTTP_FETCH_TIMEOUT_MS || "10000", 10);
const USER_AGENT = "AlloroMindsBot/1.0";

function normalizeUrl(raw: string): string {
  try {
    const url = new URL(raw);
    // Remove common tracking params
    url.searchParams.delete("utm_source");
    url.searchParams.delete("utm_medium");
    url.searchParams.delete("utm_campaign");
    url.searchParams.delete("utm_term");
    url.searchParams.delete("utm_content");
    url.searchParams.delete("fbclid");
    url.searchParams.delete("gclid");
    // Remove trailing slash for consistency
    let normalized = url.toString();
    if (normalized.endsWith("/")) {
      normalized = normalized.slice(0, -1);
    }
    return normalized;
  } catch {
    return raw;
  }
}

function extractLinksFromHtml(
  html: string,
  baseUrl: string,
  maxLinks = 20
): Array<{ url: string; title?: string }> {
  const $ = cheerio.load(html);
  const links: Array<{ url: string; title?: string }> = [];
  const seen = new Set<string>();

  // Look for article links — common blog patterns
  const selectors = [
    "article a[href]",
    ".post a[href]",
    ".blog-post a[href]",
    ".entry-title a[href]",
    "h2 a[href]",
    "h3 a[href]",
    ".post-title a[href]",
    "a.post-link[href]",
  ];

  for (const selector of selectors) {
    $(selector).each((_i, el) => {
      if (links.length >= maxLinks) return false;
      const href = $(el).attr("href");
      if (!href) return;

      try {
        const resolved = new URL(href, baseUrl).toString();
        const normalized = normalizeUrl(resolved);

        // Skip non-http, anchors, category/tag pages
        if (!normalized.startsWith("http")) return;
        if (normalized === normalizeUrl(baseUrl)) return;
        if (seen.has(normalized)) return;

        seen.add(normalized);
        const title = $(el).text().trim() || undefined;
        links.push({ url: normalized, title });
      } catch {
        // Skip malformed URLs
      }
    });
  }

  // Fallback: if no structured selectors found links, grab all <a> links on the page
  if (links.length === 0) {
    $("a[href]").each((_i, el) => {
      if (links.length >= maxLinks) return false;
      const href = $(el).attr("href");
      if (!href) return;

      try {
        const resolved = new URL(href, baseUrl).toString();
        const normalized = normalizeUrl(resolved);

        if (!normalized.startsWith("http")) return;
        if (normalized === normalizeUrl(baseUrl)) return;
        if (seen.has(normalized)) return;

        // Basic heuristic: skip obviously non-article paths
        const path = new URL(normalized).pathname;
        if (
          path === "/" ||
          path.match(/^\/(category|tag|author|page|contact|about|privacy|terms)/i)
        ) {
          return;
        }

        seen.add(normalized);
        const title = $(el).text().trim() || undefined;
        links.push({ url: normalized, title });
      } catch {
        // Skip malformed URLs
      }
    });
  }

  return links;
}

function extractLinksFromRss(
  xml: string,
  maxLinks = 20
): Array<{ url: string; title?: string; publishedAt?: Date }> {
  const $ = cheerio.load(xml, { xmlMode: true });
  const links: Array<{ url: string; title?: string; publishedAt?: Date }> = [];

  // RSS 2.0
  $("item").each((_i, el) => {
    if (links.length >= maxLinks) return false;
    const link = $(el).find("link").first().text().trim();
    const title = $(el).find("title").first().text().trim() || undefined;
    const pubDate = $(el).find("pubDate").first().text().trim();
    if (link) {
      links.push({
        url: normalizeUrl(link),
        title,
        publishedAt: pubDate ? new Date(pubDate) : undefined,
      });
    }
  });

  // Atom
  if (links.length === 0) {
    $("entry").each((_i, el) => {
      if (links.length >= maxLinks) return false;
      const link =
        $(el).find('link[rel="alternate"]').attr("href") ||
        $(el).find("link").attr("href");
      const title = $(el).find("title").first().text().trim() || undefined;
      const updated = $(el).find("updated").first().text().trim();
      if (link) {
        links.push({
          url: normalizeUrl(link),
          title,
          publishedAt: updated ? new Date(updated) : undefined,
        });
      }
    });
  }

  return links;
}

function isRssContent(contentType: string, body: string): boolean {
  if (
    contentType.includes("xml") ||
    contentType.includes("rss") ||
    contentType.includes("atom")
  ) {
    return true;
  }
  // Check body for XML/RSS markers
  const trimmed = body.trimStart().slice(0, 200);
  return trimmed.includes("<rss") || trimmed.includes("<feed") || trimmed.includes("<?xml");
}

export async function runDiscoveryForMind(mindId: string): Promise<{
  batchId: string;
  newPostsCount: number;
  errors: string[];
}> {
  const mind = await MindModel.findById(mindId);
  if (!mind) throw new Error("Mind not found");

  const sources = await MindSourceModel.listActiveByMind(mindId);
  if (sources.length === 0) {
    throw new Error("No active sources configured for this mind");
  }

  const batch = await MindDiscoveryBatchModel.ensureOpenBatch(mindId);
  let newPostsCount = 0;
  const errors: string[] = [];

  for (const source of sources) {
    try {
      logger.info(`[MINDS] Discovering from source: ${source.url}`);

      const response = await axios.get(source.url, {
        timeout: FETCH_TIMEOUT,
        maxRedirects: 3,
        headers: { "User-Agent": USER_AGENT },
        responseType: "text",
      });

      const contentType = response.headers["content-type"] || "";
      const body = response.data as string;

      let discovered: Array<{ url: string; title?: string; publishedAt?: Date }>;

      if (isRssContent(contentType, body)) {
        discovered = extractLinksFromRss(body);
      } else {
        discovered = extractLinksFromHtml(body, source.url);
      }

      logger.info(
        `[MINDS] Found ${discovered.length} candidate URLs from ${source.url}`
      );

      for (const post of discovered) {
        const inserted = await MindDiscoveredPostModel.tryInsert({
          mind_id: mindId,
          source_id: source.id,
          batch_id: batch.id,
          url: post.url,
          title: post.title,
          published_at: post.publishedAt,
        });
        if (inserted) newPostsCount++;
      }
    } catch (err: any) {
      const msg = `Failed to discover from source ${source.url}: ${err.message}`;
      logger.error(`[MINDS] ${msg}`);
      errors.push(msg);
    }
  }

  logger.info(
    `[MINDS] Discovery complete for mind ${mindId}: ${newPostsCount} new posts, ${errors.length} errors`
  );

  return { batchId: batch.id, newPostsCount, errors };
}
