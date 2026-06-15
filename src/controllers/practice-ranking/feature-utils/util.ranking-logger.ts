import logger from "../../../lib/logger";

/**
 * Practice Ranking Logger
 *
 * Centralized logging utilities for the Practice Ranking feature.
 * Preserves the exact log format and level behavior from the original route file.
 */

const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
};

// Set to DEBUG for verbose logging, INFO for standard logging
const CURRENT_LOG_LEVEL = LOG_LEVELS.DEBUG;

function formatTimestamp(): string {
  return new Date().toISOString();
}

export function logDebug(message: string): void {
  if (CURRENT_LOG_LEVEL <= LOG_LEVELS.DEBUG) {
    logger.info(`[${formatTimestamp()}] [PRACTICE-RANKING] [DEBUG] ${message}`);
  }
}

export function log(message: string): void {
  if (CURRENT_LOG_LEVEL <= LOG_LEVELS.INFO) {
    logger.info(`[${formatTimestamp()}] [PRACTICE-RANKING] [INFO] ${message}`);
  }
}

export function logWarn(message: string): void {
  if (CURRENT_LOG_LEVEL <= LOG_LEVELS.WARN) {
    logger.warn(`[${formatTimestamp()}] [PRACTICE-RANKING] [WARN] ${message}`);
  }
}

export function logError(operation: string, error: any): void {
  logger.error(
    `[${formatTimestamp()}] [PRACTICE-RANKING] [ERROR] ${operation}: ${
      error.message || error
    }`,
  );
  if (error.stack) {
    logger.error(
      `[${formatTimestamp()}] [PRACTICE-RANKING] [ERROR] Stack: ${error.stack}`,
    );
  }
}
