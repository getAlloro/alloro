/**
 * File-based logger for the scraper module.
 *
 * Appends log entries to `../logs/scraping-tool.log` (relative to compiled output).
 * Falls back to console if file write fails.
 *
 * Log format:
 *   [ISO_TIMESTAMP] [SCRAPER] [LEVEL] message | {"key":"value"}
 */

import fs from "fs";
import path from "path";
import { LogLevel } from "./scraper.enums";
import logger from "../../../lib/logger";

const LOG_DIR = path.join(__dirname, "../../logs");
const LOG_FILE = path.join(LOG_DIR, "scraping-tool.log");

// Ensure log directory exists at module load time
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

/**
 * Format current time as ISO 8601 string.
 */
function formatTimestamp(): string {
  return new Date().toISOString();
}

/**
 * Append a log entry to the scraping-tool.log file and echo to console.
 *
 * If the file write fails, the entry is still printed to console.
 */
export function log(
  level: LogLevel,
  message: string,
  data?: Record<string, any>
): void {
  const timestamp = formatTimestamp();
  const dataStr = data ? ` | ${JSON.stringify(data)}` : "";
  const logMessage = `[${timestamp}] [SCRAPER] [${level}] ${message}${dataStr}\n`;

  try {
    fs.appendFileSync(LOG_FILE, logMessage);
    logger.info({ detail: data || "" }, `[SCRAPER] [${level}] ${message}`);
  } catch (error) {
    logger.error({ err: error }, `[SCRAPER] Failed to write to log file:`);
    logger.info({ detail: data || "" }, `[SCRAPER] [${level}] ${message}`);
  }
}

/**
 * Log the start of a scraping operation with a visual separator.
 */
export function logOperationStart(domain: string, url: string): void {
  log("INFO", `Starting scrape operation`, { domain, url });
  log("INFO", `========================================`);
}

/**
 * Log the completion of a scraping operation with a visual separator.
 */
export function logOperationComplete(
  domain: string,
  durationMs: number,
  success: boolean
): void {
  log("INFO", `========================================`);
  log("INFO", `Scrape operation ${success ? "COMPLETED" : "FAILED"}`, {
    domain,
    durationMs,
    success,
  });
}
