import { Response } from "express";
import { AuthRequest } from "../../middleware/auth";
import { getMissionControlData } from "./feature-services/MissionControlService";
import { generateMissionControlInsight } from "./feature-services/MissionControlInsightService";
import {
  getMissionControlTelemetryData,
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
