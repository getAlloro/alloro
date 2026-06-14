/**
 * URL Scrape Strategies
 *
 * Three strategies for getting text content out of a URL:
 *   - fetch: basic axios.get (fast, fails on WAF-protected sites)
 *   - browser: Puppeteer renders the page, returns post-JS HTML (bypasses most challenges)
 *   - screenshot: Puppeteer full-page screenshot → Claude vision text extraction
 *
 * The identity warmup picks a strategy per URL based on admin selection.
 * The browser + screenshot strategies reuse the shared Puppeteer manager
 * (src/controllers/scraper/feature-services/service.puppeteer-manager.ts)
 * — no new browser instances are launched outside of it.
 */

import { runAgent } from "../../../agents/service.llm-runner";
import { loadPrompt } from "../../../agents/service.prompt-loader";
import { scrapeWebsite } from "./service.website-scraper";
import {
  launchBrowser,
  createPage,
  setDesktopViewport,
  navigateWithRetry,
  closeBrowser,
} from "../../scraper/feature-services/service.puppeteer-manager";
import { captureDesktop } from "../../scraper/feature-services/service.screenshot-capture";
import logger from "../../../lib/logger";

export type ScrapeStrategy = "fetch" | "browser" | "screenshot";

export interface ScrapeResult {
  baseUrl: string;
  pages: Record<string, string>;
  images: string[];
  strategy_used: ScrapeStrategy;
  was_blocked: boolean;
  extracted_text?: string;
}

function log(msg: string, data?: Record<string, unknown>): void {
  logger.info({ detail: data ? JSON.stringify(data) : "" }, `[ScrapeStrategies] ${msg}`);
}

// ---------------------------------------------------------------------------
// PUBLIC: normalizeScrapeUrl
// ---------------------------------------------------------------------------

/**
 * Normalize a URL before scraping:
 *   - Upgrade `http://` → `https://` (and keep the original http as fallback).
 *   - Add `www.` to bare-domain hostnames (2 labels like `example.com`), with
 *     the bare-hostname variant as fallback.
 *   - If both conditions apply, the primary becomes `https://www.bare.com/...`
 *     and the fallback is the ORIGINAL input URL (not an intermediate form).
 *   - Preserves path, query, and hash.
 *   - On `new URL` parse failure: returns `{primary: url, fallback: null}`.
 *
 * Caller contract: try `primary` first. On block / empty pages, retry ONCE with
 * `fallback` before escalating strategies.
 */
export function normalizeScrapeUrl(
  url: string,
): { primary: string; fallback: string | null } {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { primary: url, fallback: null };
  }

  let fallback: string | null = null;

  // http → https upgrade. Record original as fallback.
  if (parsed.protocol === "http:") {
    fallback = url;
    parsed.protocol = "https:";
  }

  // Bare-domain → www.* upgrade. Only for exactly 2 hostname labels (no
  // existing subdomain). Don't touch IPs or multi-label hosts.
  const host = parsed.hostname;
  const isIp = /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host);
  const labels = host.split(".");
  if (!isIp && labels.length === 2 && !host.startsWith("www.")) {
    // Record bare-hostname version as fallback ONLY if a fallback wasn't
    // already set by the http→https path (spec: only one fallback max; when
    // both apply, fallback is the original input URL).
    if (fallback === null) {
      const bareClone = new URL(parsed.href);
      fallback = bareClone.href;
    }
    parsed.hostname = `www.${host}`;
  }

  return { primary: parsed.href, fallback };
}

// ---------------------------------------------------------------------------
// PUBLIC: scrape(url, strategy)
// ---------------------------------------------------------------------------

export async function scrapeUrl(
  url: string,
  strategy: ScrapeStrategy = "fetch",
  signal?: AbortSignal,
): Promise<ScrapeResult> {
  log(`Scraping ${url} with strategy=${strategy}`);

  switch (strategy) {
    case "fetch":
      return await scrapeWithFetch(url, signal);
    case "browser":
      return await scrapeWithBrowser(url, signal);
    case "screenshot":
      return await scrapeWithScreenshot(url, signal);
    default:
      return await scrapeWithFetch(url, signal);
  }
}

// ---------------------------------------------------------------------------
// PUBLIC: scrapeUrlWithEscalation
// ---------------------------------------------------------------------------

/**
 * Per-strategy timeout (ms). Enforced via an AbortSignal composed with the
 * caller's own signal — the strategy itself checks `signal.aborted` at its
 * own checkpoints, but the returned scrape also loses the race once the
 * per-strategy budget elapses.
 */
const STRATEGY_TIMEOUT_MS: Record<ScrapeStrategy, number> = {
  fetch: 10_000,
  // browser needs 3s settle + up to 8s scroll + 2s final settle + snapshot +
  // image extraction. 25s gives ~5s headroom for the actual network work.
  browser: 25_000,
  screenshot: 30_000,
};

/** Hard per-URL budget across all escalation attempts. */
// Total per-URL wall-clock budget. Sized to fit browser (25s) + screenshot
// (30s) ladder with a small margin. If the budget is exhausted mid-ladder,
// `scrapeUrlWithEscalation` stops and returns whatever the last attempt produced.
const PER_URL_BUDGET_MS = 60_000;

/** Minimum usable non-whitespace chars across pages before we stop escalating. */
const MIN_USABLE_CHARS = 500;

const STRATEGY_LADDER: ScrapeStrategy[] = ["fetch", "browser", "screenshot"];

export interface ScrapeEscalation {
  from: ScrapeStrategy;
  to: ScrapeStrategy;
  reason: "thin_content" | "error";
}

export type ScrapeResultWithEscalation = ScrapeResult & {
  strategy_used_final: ScrapeStrategy;
  escalations: ScrapeEscalation[];
};

/**
 * Scrape a URL, auto-escalating up the strategy ladder until we get usable
 * content (≥ MIN_USABLE_CHARS non-whitespace chars) or run out of budget.
 *
 * Ladder: fetch → browser → screenshot. If the caller passes an
 * `initialStrategy` other than "fetch", we start from there and only escalate
 * UPWARD — never regressing to a lower tier.
 *
 * Per-strategy timeouts are enforced via AbortSignal.timeout() composed with
 * the caller's signal (when provided). A total per-URL budget of 45s caps
 * total wall time regardless of how many attempts remain.
 */
export async function scrapeUrlWithEscalation(
  url: string,
  initialStrategy: ScrapeStrategy = "fetch",
  signal?: AbortSignal,
): Promise<ScrapeResultWithEscalation> {
  const startedAt = Date.now();
  const escalations: ScrapeEscalation[] = [];

  // Normalize before any navigation — upgrades http→https, adds www. on bare
  // domains. `fallback` (if any) is retried ONCE at the first ladder rung
  // before we escalate strategies. See `normalizeScrapeUrl` docstring.
  const { primary, fallback } = normalizeScrapeUrl(url);
  if (primary !== url || fallback) {
    log("URL normalized", { input: url, primary, fallback });
  }

  // Ladder begins at the caller-chosen rung — never regress below it.
  const startIdx = STRATEGY_LADDER.indexOf(initialStrategy);
  const ladder = STRATEGY_LADDER.slice(startIdx >= 0 ? startIdx : 0);

  let lastResult: ScrapeResult | null = null;
  let currentStrategy: ScrapeStrategy = ladder[0];
  // Tracks whether we've already spent the one-shot normalization fallback.
  let fallbackConsumed = false;
  // The URL actually used for the most recent attempt (primary or fallback).
  let attemptUrl = primary;

  for (let i = 0; i < ladder.length; i++) {
    const strategy = ladder[i];
    currentStrategy = strategy;

    const elapsed = Date.now() - startedAt;
    const budgetLeft = PER_URL_BUDGET_MS - elapsed;
    if (budgetLeft <= 0) {
      log("Per-URL budget exhausted — stopping escalation", {
        url,
        strategy,
        elapsed,
        budget: PER_URL_BUDGET_MS,
      });
      break;
    }

    const perStrategyTimeout = Math.min(STRATEGY_TIMEOUT_MS[strategy], budgetLeft);
    const composedSignal = composeSignals(signal, perStrategyTimeout);

    attemptUrl = primary;

    let result: ScrapeResult;
    let errored = false;
    try {
      result = await scrapeUrl(attemptUrl, strategy, composedSignal);
    } catch (err: any) {
      errored = true;
      log("Strategy attempt threw — treating as error", {
        url: attemptUrl,
        strategy,
        error: err?.message,
      });
      result = {
        baseUrl: attemptUrl,
        pages: {},
        images: [],
        strategy_used: strategy,
        was_blocked: true,
      };
    }

    // One-shot fallback retry at the SAME strategy: triggered when primary
    // attempt looks blocked/empty and we still have a normalization fallback
    // to try (e.g. original http:// URL, or bare-domain variant).
    const primaryLooksBlocked =
      errored ||
      result.was_blocked ||
      !result.pages ||
      Object.keys(result.pages).length === 0;
    if (
      primaryLooksBlocked &&
      fallback &&
      !fallbackConsumed &&
      fallback !== primary
    ) {
      fallbackConsumed = true;
      log("Retrying with normalization fallback URL", {
        primary,
        fallback,
        strategy,
      });
      const retryElapsed = Date.now() - startedAt;
      const retryBudgetLeft = PER_URL_BUDGET_MS - retryElapsed;
      if (retryBudgetLeft > 0) {
        const retryTimeout = Math.min(STRATEGY_TIMEOUT_MS[strategy], retryBudgetLeft);
        const retrySignal = composeSignals(signal, retryTimeout);
        attemptUrl = fallback;
        try {
          const retryResult = await scrapeUrl(attemptUrl, strategy, retrySignal);
          result = retryResult;
          errored = false;
        } catch (err: any) {
          log("Fallback retry threw — keeping original result", {
            url: attemptUrl,
            strategy,
            error: err?.message,
          });
        }
      } else {
        log("Budget exhausted before fallback retry — skipping", {
          primary,
          fallback,
        });
      }
    }

    lastResult = result;

    const usableChars = countUsableChars(result);
    const thinContent = usableChars < MIN_USABLE_CHARS;
    const needsEscalation = errored || result.was_blocked || thinContent;

    // If this was the last rung, we stop here regardless.
    if (i === ladder.length - 1 || !needsEscalation) {
      if (!needsEscalation) {
        log("Scrape succeeded", { url: attemptUrl, strategy, chars: usableChars });
      } else {
        log("Scrape exhausted ladder", { url: attemptUrl, strategy, chars: usableChars });
      }
      break;
    }

    const nextStrategy = ladder[i + 1];
    const reason: ScrapeEscalation["reason"] =
      errored || result.was_blocked ? "error" : "thin_content";

    escalations.push({ from: strategy, to: nextStrategy, reason });
    log("Scrape escalated", {
      url: attemptUrl,
      from: strategy,
      to: nextStrategy,
      reason,
      chars: usableChars,
    });
  }

  const finalResult: ScrapeResult = lastResult ?? {
    baseUrl: url,
    pages: {},
    images: [],
    strategy_used: currentStrategy,
    was_blocked: true,
  };

  return {
    ...finalResult,
    strategy_used_final: currentStrategy,
    escalations,
  };
}

/**
 * Compose the caller's AbortSignal with a per-strategy timeout. If AbortSignal.any
 * is unavailable (Node < 20.3), fall back to a manual listener.
 */
function composeSignals(
  caller: AbortSignal | undefined,
  timeoutMs: number,
): AbortSignal {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  if (!caller) return timeoutSignal;

  // Prefer the native composer when available.
  const anyFn = (AbortSignal as any).any;
  if (typeof anyFn === "function") {
    return anyFn([caller, timeoutSignal]) as AbortSignal;
  }

  // Fallback: manual controller that aborts on either signal.
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  if (caller.aborted) controller.abort();
  else caller.addEventListener("abort", onAbort, { once: true });
  if (timeoutSignal.aborted) controller.abort();
  else timeoutSignal.addEventListener("abort", onAbort, { once: true });
  return controller.signal;
}

/** Total non-whitespace char count across all scraped pages. */
function countUsableChars(result: ScrapeResult): number {
  if (!result?.pages) return 0;
  let total = 0;
  for (const content of Object.values(result.pages)) {
    if (typeof content !== "string") continue;
    // Non-whitespace only — mirrors what cleanForClaude eventually produces.
    total += content.replace(/\s+/g, "").length;
  }
  return total;
}

// ---------------------------------------------------------------------------
// FETCH (default)
// ---------------------------------------------------------------------------

async function scrapeWithFetch(
  url: string,
  signal?: AbortSignal,
): Promise<ScrapeResult> {
  if (signal?.aborted) return emptyResult(url, "fetch", true);
  const result = await scrapeWebsite(url, undefined);
  if (signal?.aborted) return emptyResult(url, "fetch", true);
  if (result.result) {
    return {
      baseUrl: result.result.baseUrl,
      pages: result.result.pages,
      images: result.result.images,
      strategy_used: "fetch",
      was_blocked: false,
    };
  }
  // Fetch failed — return an empty result rather than throw, so warmup can continue
  return {
    baseUrl: url,
    pages: {},
    images: [],
    strategy_used: "fetch",
    was_blocked: true,
  };
}

// ---------------------------------------------------------------------------
// BROWSER (Puppeteer-rendered HTML)
// ---------------------------------------------------------------------------

async function scrapeWithBrowser(
  url: string,
  signal?: AbortSignal,
): Promise<ScrapeResult> {
  if (signal?.aborted) return emptyResult(url, "browser", true);
  let browser = null;
  try {
    browser = await launchBrowser();
    if (signal?.aborted) return emptyResult(url, "browser", true);
    const page = await createPage(browser);
    await setDesktopViewport(page);

    const navigated = await navigateWithRetry(page, url);
    if (!navigated || signal?.aborted) {
      return emptyResult(url, "browser", true);
    }

    // Initial settle: post-load JS, Cloudflare JS challenges, hydration.
    await abortableDelay(3000, signal);
    if (signal?.aborted) return emptyResult(url, "browser", true);

    // Scroll the full page top-to-bottom to trigger IntersectionObserver-based
    // lazy image loading, then back to top so the final snapshot is stable.
    // Without this, most below-the-fold images never populate their `src`.
    try {
      await autoScroll(page);
    } catch (err: any) {
      log("Auto-scroll failed (continuing)", { error: err?.message });
    }
    if (signal?.aborted) return emptyResult(url, "browser", true);

    // Final settle after scroll so lazy images finish swapping.
    await abortableDelay(2000, signal);
    if (signal?.aborted) return emptyResult(url, "browser", true);

    const html = await page.content();
    const images = await extractImageUrls(page, url);

    return {
      baseUrl: url,
      pages: { home: html },
      images,
      strategy_used: "browser",
      was_blocked: false,
    };
  } catch (err: any) {
    log("Browser strategy failed", { error: err.message });
    return emptyResult(url, "browser", true);
  } finally {
    if (browser) await closeBrowser(browser);
  }
}

/**
 * Smooth-scroll through the whole page so IntersectionObserver-based lazy
 * loaders fire. Then return to top for a stable DOM snapshot.
 */
async function autoScroll(page: any): Promise<void> {
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      let total = 0;
      const step = 400;
      const maxTime = 8000;
      const start = Date.now();
      const timer = setInterval(() => {
        const scrollHeight = Math.max(
          document.body.scrollHeight,
          document.documentElement.scrollHeight,
        );
        window.scrollBy(0, step);
        total += step;
        if (total >= scrollHeight || Date.now() - start > maxTime) {
          clearInterval(timer);
          window.scrollTo(0, 0);
          resolve();
        }
      }, 120);
    });
  });
}

/**
 * Collect image URLs from the rendered DOM. Handles:
 *   - `src` and `data-src` (lazy-load placeholders)
 *   - `srcset` (first candidate)
 *   - Relative URLs (absolutized against the page URL)
 *   - Next.js `/_next/image?url=` wrappers (preserved as absolute URLs)
 */
async function extractImageUrls(page: any, baseUrl: string): Promise<string[]> {
  try {
    const urls: string[] = await page.evaluate((base: string) => {
      const set = new Set<string>();
      const imgs = document.querySelectorAll("img");
      imgs.forEach((img: any) => {
        const candidates: string[] = [];
        const src = img.getAttribute("src");
        const dataSrc = img.getAttribute("data-src");
        const srcset = img.getAttribute("srcset");
        if (src) candidates.push(src);
        if (dataSrc) candidates.push(dataSrc);
        if (srcset) {
          const first = srcset.split(",")[0]?.trim().split(/\s+/)[0];
          if (first) candidates.push(first);
        }
        for (const raw of candidates) {
          if (!raw || raw.startsWith("data:")) continue;
          try {
            const abs = new URL(raw, base).href;
            if (/^https?:\/\//.test(abs)) set.add(abs);
          } catch {
            // malformed URL — skip
          }
        }
      });
      return Array.from(set).slice(0, 30);
    }, baseUrl);
    return urls;
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// SCREENSHOT (Puppeteer + Claude vision)
// ---------------------------------------------------------------------------

async function scrapeWithScreenshot(
  url: string,
  signal?: AbortSignal,
): Promise<ScrapeResult> {
  if (signal?.aborted) return emptyResult(url, "screenshot", true);
  let browser = null;
  try {
    browser = await launchBrowser();
    if (signal?.aborted) return emptyResult(url, "screenshot", true);
    const page = await createPage(browser);
    await setDesktopViewport(page);

    const navigated = await navigateWithRetry(page, url);
    if (!navigated || signal?.aborted) {
      return emptyResult(url, "screenshot", true);
    }

    await abortableDelay(5000, signal);
    if (signal?.aborted) return emptyResult(url, "screenshot", true);

    const shot = await captureDesktop(page);
    if (!shot?.base64 || signal?.aborted) {
      return emptyResult(url, "screenshot", true);
    }

    log("Captured screenshot", { sizeKB: shot.sizeKB });

    const extractorPrompt = loadPrompt("websiteAgents/builder/ScreenshotTextExtractor");
    const extraction = await runAgent({
      systemPrompt: extractorPrompt,
      userMessage: `URL: ${url}\n\nExtract the readable text content from this screenshot.`,
      images: [{ mediaType: "image/jpeg", base64: shot.base64 }],
      maxTokens: 4096,
    });

    const extractedText = extraction.raw.trim();

    return {
      baseUrl: url,
      pages: { home: extractedText },
      images: [],
      strategy_used: "screenshot",
      was_blocked: false,
      extracted_text: extractedText,
    };
  } catch (err: any) {
    log("Screenshot strategy failed", { error: err.message });
    return emptyResult(url, "screenshot", true);
  } finally {
    if (browser) await closeBrowser(browser);
  }
}

/**
 * Delay that resolves early if the AbortSignal fires. Never rejects —
 * callers check `signal.aborted` themselves to short-circuit.
 */
function abortableDelay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve) => {
    if (signal?.aborted) return resolve();
    const timer = setTimeout(() => {
      if (signal) signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      resolve();
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function emptyResult(
  url: string,
  strategy: ScrapeStrategy,
  was_blocked: boolean,
): ScrapeResult {
  return {
    baseUrl: url,
    pages: {},
    images: [],
    strategy_used: strategy,
    was_blocked,
  };
}
