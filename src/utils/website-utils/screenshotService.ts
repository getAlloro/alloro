/**
 * Screenshot Service
 *
 * Uses Playwright to capture full-page screenshots at multiple viewports.
 * Reuses a single browser instance for efficiency.
 */

import type { Browser, Page } from "playwright";
import logger from "../../lib/logger";

let browserInstance: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (browserInstance && browserInstance.isConnected()) {
    return browserInstance;
  }

  try {
    const { chromium } = await import("playwright");
    browserInstance = await chromium.launch({ headless: true });
    logger.info("[Screenshot] Browser launched");
    return browserInstance;
  } catch (err) {
    logger.error({ err: err }, "[Screenshot] Failed to launch browser:");
    throw new Error("Playwright browser unavailable");
  }
}

export interface Viewport {
  width: number;
  height: number;
  label: string;
}

export interface Screenshot {
  buffer: Buffer;
  viewport: Viewport;
  url: string;
}

const DEFAULT_VIEWPORTS: Viewport[] = [
  { width: 1440, height: 900, label: "desktop" },
  { width: 375, height: 812, label: "mobile" },
];

/**
 * Screenshot a page at multiple viewports.
 * Returns base64-encoded PNG buffers.
 */
export async function screenshotPage(
  url: string,
  viewports: Viewport[] = DEFAULT_VIEWPORTS
): Promise<Screenshot[]> {
  const browser = await getBrowser();
  const results: Screenshot[] = [];

  for (const vp of viewports) {
    let page: Page | null = null;
    try {
      page = await browser.newPage({
        viewport: { width: vp.width, height: vp.height },
      });

      await page.goto(url, {
        waitUntil: "networkidle",
        timeout: 30000,
      });

      // Wait a bit for any animations/transitions to settle
      await page.waitForTimeout(1000);

      // Capture full page, then scale down if too tall (API limit: 8000px)
      const MAX_DIMENSION = 7000;
      const bodyHeight = await page.evaluate(() => document.body.scrollHeight);
      const needsScale = bodyHeight > MAX_DIMENSION;
      const scale = needsScale ? MAX_DIMENSION / bodyHeight : 1;

      let buffer: Buffer;
      if (needsScale) {
        // Scale the viewport so the full page fits within limits
        await page.setViewportSize({
          width: Math.round(vp.width * scale),
          height: Math.round(vp.height * scale),
        });
        // Use CSS zoom to shrink content instead of viewport
        await page.evaluate((s) => {
          document.body.style.zoom = String(s);
        }, scale);
        await page.waitForTimeout(500);
        buffer = Buffer.from(await page.screenshot({ fullPage: true, type: "jpeg", quality: 75 }));
        // Reset zoom
        await page.evaluate(() => { document.body.style.zoom = "1"; });
        await page.setViewportSize({ width: vp.width, height: vp.height });
      } else {
        buffer = Buffer.from(await page.screenshot({ fullPage: true, type: "jpeg", quality: 80 }));
      }

      results.push({
        buffer: Buffer.from(buffer),
        viewport: vp,
        url,
      });

      logger.info(`[Screenshot] ✓ ${vp.label} (${vp.width}x${vp.height}): ${url}`);
    } catch (err) {
      logger.error({ err: (err as Error).message }, `[Screenshot] Failed ${vp.label} for ${url}:`);
    } finally {
      if (page) await page.close().catch(() => {});
    }
  }

  return results;
}

/**
 * Close the browser instance. Call on shutdown.
 */
export async function closeBrowser(): Promise<void> {
  if (browserInstance) {
    await browserInstance.close().catch(() => {});
    browserInstance = null;
    logger.info("[Screenshot] Browser closed");
  }
}
