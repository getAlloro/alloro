import { Request, Response } from "express";
import { RBACRequest } from "../../middleware/rbac";
import logger from "../../lib/logger";
import { MAX_FILE_SIZE } from "./pms-utils/pms-constants";
import { tryParseMonthlyRollupPayload } from "./pms-utils/pms-mapping-validator.util";
import * as pasteIngestionService from "./feature-services/PmsPasteIngestionService";

export async function previewPaste(req: Request, res: Response) {
  try {
    const input = parsePasteRequest(req);
    const parsed = await pasteIngestionService.previewPaste(input);
    const { rawRows, ...publicResult } = parsed;
    return res.json({
      success: true,
      data: {
        ...publicResult,
        rowsParsed: rawRows.length,
        monthsDetected: parsed.monthlyRollup.length,
      },
      error: null,
    });
  } catch (error) {
    return sendPasteError(
      res,
      error,
      "Failed to parse pasted PMS data.",
      false,
    );
  }
}

export async function uploadPaste(req: Request, res: Response) {
  try {
    const input = parsePasteRequest(req);
    const actorUserId =
      (req as RBACRequest).userId ?? (req as RBACRequest).user?.userId ?? null;
    const override = req.body?.monthlyDataOverride;
    const parsedOverride =
      override === undefined
        ? undefined
        : tryParseMonthlyRollupPayload(override, "monthlyDataOverride");
    if (parsedOverride && !parsedOverride.ok) {
      return res.status(400).json({
        success: false,
        data: null,
        error: {
          code: "PMS_PASTE_OVERRIDE_INVALID",
          message: parsedOverride.error,
          details: null,
        },
      });
    }

    const data = await pasteIngestionService.createPasteUpload({
      ...input,
      actorUserId,
      domain:
        typeof req.body?.domain === "string" ? req.body.domain : undefined,
      locationId: parseOptionalPositiveNumber(req.body?.locationId),
      monthlyDataOverride: parsedOverride?.ok
        ? parsedOverride.value
        : undefined,
    });
    return res.json({ success: true, data, error: null });
  } catch (error) {
    return sendPasteError(res, error, "Failed to save pasted PMS data.", true);
  }
}

function parsePasteRequest(req: Request): {
  organizationId: number;
  rawText: string;
  fallbackMonth: string;
  targetMonth?: string;
} {
  const organizationId = (req as RBACRequest).organizationId;
  if (!organizationId) {
    throw Object.assign(new Error("Organization context required."), {
      statusCode: 401,
    });
  }

  const rawText = req.body?.rawText;
  if (typeof rawText !== "string" || rawText.trim().length === 0) {
    throw Object.assign(new Error("rawText is required."), { statusCode: 400 });
  }
  if (Buffer.byteLength(rawText, "utf8") > MAX_FILE_SIZE) {
    throw Object.assign(
      new Error(
        "Pasted data exceeds 10 MB. Save it as a CSV, XLS, or XLSX file and upload it instead.",
      ),
      { statusCode: 413 },
    );
  }

  const fallbackMonth = req.body?.currentMonth;
  if (
    typeof fallbackMonth !== "string" ||
    !/^\d{4}-(0[1-9]|1[0-2])$/.test(fallbackMonth)
  ) {
    throw Object.assign(
      new Error("currentMonth is required in YYYY-MM format."),
      { statusCode: 400 },
    );
  }

  return {
    organizationId,
    rawText,
    fallbackMonth,
    targetMonth:
      typeof req.body?.targetMonth === "string"
        ? req.body.targetMonth
        : undefined,
  };
}

function parseOptionalPositiveNumber(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw Object.assign(new Error("locationId must be a positive integer."), {
      statusCode: 400,
    });
  }
  return parsed;
}

function sendPasteError(
  res: Response,
  error: unknown,
  fallback: string,
  canonicalError: boolean,
): Response {
  const typedError = error as {
    statusCode?: number;
    message?: string;
    code?: string;
    activeJob?: unknown;
  };
  logger.error(
    { err: typedError.message ?? error },
    "PMS paste ingestion failed.",
  );
  const message = typedError.message ?? fallback;
  const data = typedError.activeJob
    ? { activeJob: typedError.activeJob }
    : null;
  if (!canonicalError) {
    return res.status(typedError.statusCode ?? 500).json({
      success: false,
      data,
      error: message,
      ...(typedError.code ? { code: typedError.code } : {}),
    });
  }

  return res.status(typedError.statusCode ?? 500).json({
    success: false,
    data,
    error: {
      code: typedError.code ?? "PMS_PASTE_UPLOAD_FAILED",
      message,
      details: null,
    },
  });
}
