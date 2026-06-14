/**
 * Admin PMS Pipeline Controller
 *
 * GET /api/admin/pms-jobs/:id/pipeline
 *
 * Returns the full agent pipeline for a single PMS job: the PMS metadata
 * (monthly_rollup, automation status), and every persisted agent_results
 * row for the run (RE + Summary), including their full agent_input and
 * agent_output payloads.
 *
 * Linkage strategy: pms_jobs.automation_status_detail.summary.agentResults
 * stores the agent_results row IDs at completion time. We read them
 * directly when present, with a fallback to org+location+date_range
 * matching for runs that completed before this endpoint shipped or for
 * jobs whose summary entry never wrote (failed mid-run).
 */

import { Request, Response } from "express";
import { db } from "../../database/connection";
import { PmsJobModel } from "../../models/PmsJobModel";
import { AgentResultModel, IAgentResult } from "../../models/AgentResultModel";
import logger from "../../lib/logger";

interface AgentNode {
  agent_type: string;
  status: IAgentResult["status"] | "missing";
  result_id: number | null;
  run_id: string | null;
  date_start: string | null;
  date_end: string | null;
  agent_input: Record<string, unknown> | null;
  agent_output: Record<string, unknown> | null;
  error_message: string | null;
  created_at: Date | null;
}

const PIPELINE_AGENT_TYPES = ["referral_engine", "summary"] as const;

function parseJsonField(value: unknown): Record<string, unknown> | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "object") return value as Record<string, unknown>;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch {
      return null;
    }
  }
  return null;
}

export async function getPipelineForPmsJob(
  req: Request,
  res: Response
): Promise<Response> {
  const jobIdRaw = req.params.id;
  const jobId = Number(jobIdRaw);

  if (!Number.isFinite(jobId) || jobId <= 0) {
    return res.status(400).json({
      success: false,
      error: "INVALID_JOB_ID",
      message: `Invalid PMS job id: ${jobIdRaw}`,
    });
  }

  try {
    const job = await PmsJobModel.findById(jobId);
    if (!job) {
      return res.status(404).json({
        success: false,
        error: "JOB_NOT_FOUND",
        message: `PMS job ${jobId} not found`,
      });
    }

    const automation = (job.automation_status_detail ?? {}) as {
      summary?: {
        agentResults?: Record<string, { resultId?: number } | undefined>;
      };
    };
    const recordedIds = automation.summary?.agentResults ?? {};

    const nodes: AgentNode[] = [];
    for (const agentType of PIPELINE_AGENT_TYPES) {
      const recordedId = recordedIds[agentType]?.resultId;
      let row: IAgentResult | undefined;

      if (recordedId) {
        row = await AgentResultModel.findById(recordedId);
      }

      // Fallback: org+location join if no recorded id (legacy runs / partial failures)
      if (!row && job.organization_id) {
        const fallbackQuery = db("agent_results")
          .where({
            organization_id: job.organization_id,
            agent_type: agentType,
          })
          .orderBy("created_at", "desc");
        if (job.location_id !== null && job.location_id !== undefined) {
          fallbackQuery.where({ location_id: job.location_id });
        }
        const fallbackRow = await fallbackQuery.first();
        if (fallbackRow) {
          row = {
            ...fallbackRow,
            data: parseJsonField(fallbackRow.data),
            agent_input: parseJsonField(fallbackRow.agent_input),
            agent_output: parseJsonField(fallbackRow.agent_output),
          } as IAgentResult;
        }
      }

      if (row) {
        nodes.push({
          agent_type: agentType,
          status: row.status,
          result_id: row.id,
          run_id: (row as any).run_id ?? null,
          date_start: row.date_start,
          date_end: row.date_end,
          agent_input: row.agent_input,
          agent_output: row.agent_output,
          error_message: row.error_message,
          created_at: row.created_at,
        });
      } else {
        nodes.push({
          agent_type: agentType,
          status: "missing",
          result_id: null,
          run_id: null,
          date_start: null,
          date_end: null,
          agent_input: null,
          agent_output: null,
          error_message: null,
          created_at: null,
        });
      }
    }

    return res.json({
      success: true,
      pms_job: {
        id: job.id,
        organization_id: job.organization_id,
        location_id: job.location_id,
        status: job.status,
        is_approved: job.is_approved,
        is_client_approved: job.is_client_approved,
        timestamp: job.timestamp,
        response_log: job.response_log,
        automation_status_detail: job.automation_status_detail,
      },
      agents: nodes,
    });
  } catch (error: any) {
    logger.error(
      `[admin-pms-pipeline] getPipelineForPmsJob(${jobId}) failed: ${error?.message || error}`
    );
    return res.status(500).json({
      success: false,
      error: "FETCH_ERROR",
      message: error?.message || "Failed to load pipeline",
    });
  }
}
