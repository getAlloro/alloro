import * as Sentry from "@sentry/node";
import { Response } from "express";
import type { RBACRequest } from "../../middleware/rbac";
import {
  AppTelemetryValidationError,
  ingestAppTelemetryEvents,
} from "./feature-services/AppTelemetryIngestionService";

export async function recordEvents(
  req: RBACRequest,
  res: Response,
): Promise<Response> {
  try {
    const userId = req.userId ?? req.user?.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        data: null,
        error: {
          code: "AUTH_REQUIRED",
          message: "Authentication is required.",
          details: null,
        },
      });
    }

    const result = await ingestAppTelemetryEvents(req.body, {
      userId,
      organizationId: req.organizationId,
      userRole: req.userRole,
    });

    return res.status(201).json({
      success: true,
      data: result,
      error: null,
    });
  } catch (error) {
    if (error instanceof AppTelemetryValidationError) {
      return res.status(400).json({
        success: false,
        data: null,
        error: {
          code: "INVALID_TELEMETRY_EVENT",
          message: error.message,
          details: null,
        },
      });
    }

    Sentry.captureException(error);
    return res.status(500).json({
      success: false,
      data: null,
      error: {
        code: "TELEMETRY_INGEST_FAILED",
        message: "Failed to record telemetry event.",
        details: null,
      },
    });
  }
}
