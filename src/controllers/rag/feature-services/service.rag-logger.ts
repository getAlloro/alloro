/**
 * RAG Logger Service
 *
 * File-based logging abstraction for the RAG pipeline.
 * Writes to rag.log and rag-error.log with timestamps.
 * Mirrors output to console.
 */

import * as fs from "fs";
import * as path from "path";
import logger from "../../../lib/logger";

// =====================================================================
// LOG FILE CONFIGURATION
// =====================================================================

const LOG_DIR = path.join(__dirname, "../../logs");
const LOG_FILE = path.join(LOG_DIR, "rag.log");
const ERROR_LOG_FILE = path.join(LOG_DIR, "rag-error.log");

// =====================================================================
// INITIALIZATION
// =====================================================================

/**
 * Ensures the log directory exists.
 * Called on module load to guarantee directory is ready.
 */
export function initializeLogDirectory(): void {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

// Initialize on module load (preserves original behavior)
initializeLogDirectory();

// =====================================================================
// LOGGING FUNCTIONS
// =====================================================================

/**
 * Appends a log message to the specified log file.
 * Mirrors output to console.
 */
export function log(message: string, isError: boolean = false): void {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;

  const logFile = isError ? ERROR_LOG_FILE : LOG_FILE;

  try {
    fs.appendFileSync(logFile, logMessage);
    logger.info(message);
  } catch (error) {
    logger.error(`Failed to write to log file: ${error}`);
  }
}

/**
 * Logs an error with stack trace.
 */
export function logError(operation: string, error: any): void {
  const errorMessage = `ERROR in ${operation}: ${error.message || error}`;
  const stackTrace = error.stack ? `\nStack: ${error.stack}` : "";
  log(`${errorMessage}${stackTrace}`, true);
}

// =====================================================================
// LOG FILE PATH ACCESSORS
// =====================================================================

export function getLogFilePath(): string {
  return LOG_FILE;
}

export function getErrorLogFilePath(): string {
  return ERROR_LOG_FILE;
}
