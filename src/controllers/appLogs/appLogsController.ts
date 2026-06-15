import { Request, Response } from "express";
import * as logFileService from "./feature-services/logFileService";
import { validateLogType, parseMaxLines } from "./feature-utils/logFileValidator";
import { DEFAULT_LOG_TYPE, DEFAULT_MAX_LINES } from "./feature-utils/logFileConfig";
import logger from "../../lib/logger";

export async function getLogFile(req: Request, res: Response): Promise<Response> {
  try {
    const logType = (req.query.type as string) || DEFAULT_LOG_TYPE;
    const maxLines = parseMaxLines(req.query.lines as string | undefined, DEFAULT_MAX_LINES);

    const validation = validateLogType(logType);
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        error: "INVALID_LOG_TYPE",
        message: validation.error,
      });
    }

    const result = await logFileService.readLogFile(logType, maxLines);

    if (!result.file_exists) {
      return res.json({
        success: true,
        data: {
          logs: result.logs,
          total_lines: result.total_lines,
          timestamp: new Date().toISOString(),
          log_type: result.log_type,
        },
        message: "Log file does not exist yet",
      });
    }

    return res.json({
      success: true,
      data: {
        logs: result.logs,
        total_lines: result.total_lines,
        timestamp: new Date().toISOString(),
        log_type: result.log_type,
      },
    });
  } catch (error: any) {
    logger.error({ err: error }, "[App Logs] Error reading log file:");
    return res.status(500).json({
      success: false,
      error: "READ_ERROR",
      message: error?.message || "Failed to read log file",
    });
  }
}

export async function clearLogFile(req: Request, res: Response): Promise<Response> {
  try {
    const logType = (req.query.type as string) || DEFAULT_LOG_TYPE;

    const validation = validateLogType(logType);
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        error: "INVALID_LOG_TYPE",
        message: validation.error,
      });
    }

    const result = await logFileService.clearLogFile(logType);

    if (!result.fileExisted) {
      return res.json({
        success: true,
        message: "Log file does not exist",
      });
    }

    logger.info(`[App Logs] \u2713 ${logType} log file cleared successfully`);

    return res.json({
      success: true,
      message: `${logType} log file cleared successfully`,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    logger.error({ err: error }, "[App Logs] Error clearing log file:");
    return res.status(500).json({
      success: false,
      error: "CLEAR_ERROR",
      message: error?.message || "Failed to clear log file",
    });
  }
}
