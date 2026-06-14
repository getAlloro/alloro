import { Request, Response } from "express";
import {
  getPublishedImport,
  getImportByVersion,
  validateVersionNumber,
} from "./feature-services/importsService";
import { setImportResponseHeaders } from "./feature-utils/responseHeaders";
import {
  streamTextContent,
  streamFromS3,
} from "./feature-utils/streamingUtils";
import logger from "../../lib/logger";

export async function servePublishedImport(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { filename } = req.params;

    const result = await getPublishedImport(filename);

    if (!result.success) {
      res.status(404).json({
        error: "NOT_FOUND",
        message: `No published version found for "${filename}"`,
      });
      return;
    }

    const record = result.data;

    setImportResponseHeaders(res, record);

    if (record.text_content) {
      streamTextContent(res, record.text_content);
      return;
    }

    await streamFromS3(res, record.s3_key as string);
  } catch (error: any) {
    logger.error({ err: error }, `[Imports] Error serving ${req.params.filename}:`);
    res.status(500).json({
      error: "SERVE_ERROR",
      message: "Failed to serve import",
    });
  }
}

export async function serveVersionedImport(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { filename, version } = req.params;

    const validation = validateVersionNumber(version);
    if (!validation.valid) {
      res.status(400).json({
        error: "INVALID_VERSION",
        message: "Version must be a positive integer",
      });
      return;
    }

    const versionNum = validation.value as number;
    const result = await getImportByVersion(filename, versionNum);

    if (!result.success) {
      if (result.code === "DEPRECATED") {
        res.status(410).json({
          error: "DEPRECATED",
          message: `Version ${versionNum} of "${filename}" has been deprecated`,
        });
        return;
      }

      res.status(404).json({
        error: "NOT_FOUND",
        message: `Version ${versionNum} not found for "${filename}"`,
      });
      return;
    }

    const record = result.data;

    setImportResponseHeaders(res, record, { includeStatus: true });

    if (record.text_content) {
      streamTextContent(res, record.text_content);
      return;
    }

    await streamFromS3(res, record.s3_key as string);
  } catch (error: any) {
    logger.error({ err: error }, `[Imports] Error serving ${req.params.filename}/v/${req.params.version}:`);
    res.status(500).json({
      error: "SERVE_ERROR",
      message: "Failed to serve import",
    });
  }
}
