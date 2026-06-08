import { Response } from "express";
import { AuthRequest } from "../../middleware/auth";
import { getMissionControlData } from "./feature-services/MissionControlService";
import { generateMissionControlInsight } from "./feature-services/MissionControlInsightService";
import {
  getMissionControlTelemetryData,
  getMissionControlTelemetryOrganizationDetail,
  getMissionControlTelemetryUserDetail,
  getMissionControlTelemetryUsers,
} from "./feature-services/MissionControlTelemetryService";

export async function getOverview(
  _req: AuthRequest,
  res: Response,
): Promise<Response> {
  try {
    const data = await getMissionControlData();

    return res.json({
      success: true,
      data,
      error: null,
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      data: null,
      error: {
        code: "MISSION_CONTROL_FETCH_FAILED",
        message: "Failed to load Mission Control dashboard.",
        details: error?.message ?? null,
      },
    });
  }
}

export async function getInsight(
  _req: AuthRequest,
  res: Response,
): Promise<Response> {
  try {
    const data = await getMissionControlData();
    const insight = await generateMissionControlInsight(data);

    return res.json({
      success: true,
      data: {
        insight,
        movementSignals: data.movementSignals,
        generatedAt: data.generatedAt,
      },
      error: null,
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      data: null,
      error: {
        code: "MISSION_CONTROL_INSIGHT_FAILED",
        message: "Failed to generate Mission Control insight.",
        details: error?.message ?? null,
      },
    });
  }
}

export async function getTelemetry(
  req: AuthRequest,
  res: Response,
): Promise<Response> {
  try {
    const data = await getMissionControlTelemetryData({
      range: req.query.range,
      includePilot: req.query.includePilot,
      includeAdmin: req.query.includeAdmin,
    });

    return res.json({
      success: true,
      data,
      error: null,
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      data: null,
      error: {
        code: "MISSION_CONTROL_TELEMETRY_FAILED",
        message: "Failed to load Mission Control telemetry.",
        details: error?.message ?? null,
      },
    });
  }
}

export async function getTelemetryUsers(
  req: AuthRequest,
  res: Response,
): Promise<Response> {
  try {
    const data = await getMissionControlTelemetryUsers({
      organizationId: req.params.organizationId,
      range: req.query.range,
      includePilot: req.query.includePilot,
      includeAdmin: req.query.includeAdmin,
    });

    return res.json({
      success: true,
      data,
      error: null,
    });
  } catch (error: any) {
    const status = error?.message === "Invalid organization id" ? 400 : 500;
    return res.status(status).json({
      success: false,
      data: null,
      error: {
        code:
          status === 400
            ? "INVALID_ORGANIZATION_ID"
            : "MISSION_CONTROL_TELEMETRY_USERS_FAILED",
        message:
          status === 400
            ? "Invalid organization id."
            : "Failed to load Mission Control telemetry users.",
        details: error?.message ?? null,
      },
    });
  }
}

export async function getTelemetryOrganizationDetail(
  req: AuthRequest,
  res: Response,
): Promise<Response> {
  try {
    const data = await getMissionControlTelemetryOrganizationDetail({
      organizationId: req.params.organizationId,
      range: req.query.range,
      includePilot: req.query.includePilot,
      includeAdmin: req.query.includeAdmin,
    });

    return res.json({
      success: true,
      data,
      error: null,
    });
  } catch (error: any) {
    const status =
      error?.message === "Invalid organization id"
        ? 400
        : error?.message === "Organization not found"
          ? 404
          : 500;
    return res.status(status).json({
      success: false,
      data: null,
      error: {
        code:
          status === 400
            ? "INVALID_ORGANIZATION_ID"
            : status === 404
              ? "ORGANIZATION_NOT_FOUND"
              : "MISSION_CONTROL_TELEMETRY_ORGANIZATION_FAILED",
        message:
          status === 400
            ? "Invalid organization id."
            : status === 404
              ? "Organization not found."
              : "Failed to load organization telemetry.",
        details: error?.message ?? null,
      },
    });
  }
}

export async function getTelemetryUserDetail(
  req: AuthRequest,
  res: Response,
): Promise<Response> {
  try {
    const data = await getMissionControlTelemetryUserDetail({
      organizationId: req.params.organizationId,
      userId: req.params.userId,
      range: req.query.range,
      includePilot: req.query.includePilot,
      includeAdmin: req.query.includeAdmin,
    });

    return res.json({
      success: true,
      data,
      error: null,
    });
  } catch (error: any) {
    const status = getTelemetryUserDetailStatus(error?.message);
    return res.status(status).json({
      success: false,
      data: null,
      error: {
        code: getTelemetryUserDetailErrorCode(status),
        message: getTelemetryUserDetailErrorMessage(status),
        details: error?.message ?? null,
      },
    });
  }
}

function getTelemetryUserDetailStatus(message: string | undefined): number {
  if (message === "Invalid organization id" || message === "Invalid user id") {
    return 400;
  }
  if (message === "Organization not found") return 404;
  if (message === "User telemetry not found") return 404;
  return 500;
}

function getTelemetryUserDetailErrorCode(status: number): string {
  if (status === 400) return "INVALID_TELEMETRY_USER_DETAIL_PARAMS";
  if (status === 404) return "TELEMETRY_USER_DETAIL_NOT_FOUND";
  return "MISSION_CONTROL_TELEMETRY_USER_FAILED";
}

function getTelemetryUserDetailErrorMessage(status: number): string {
  if (status === 400) return "Invalid organization or user id.";
  if (status === 404) return "User telemetry not found.";
  return "Failed to load user telemetry.";
}
