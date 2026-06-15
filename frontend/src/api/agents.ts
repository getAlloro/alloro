import { apiGet, apiPost, apiPatch, unwrap } from "./index";
import type { AgentResponse } from "../types/agents";
import { logger } from "../lib/logger";

// NOTE (T4 error-contract): fetchAgentResults / approveAgentResult /
// updateAgentResult below throw an ApiError on failure (via unwrap) and return
// the unwrapped payload. getLatestAgentData / getLatestAgentResult are dead
// (no consumers) and left on the legacy swallow contract pending removal.

const baseurl = "/agents";

// Agent Result type for API responses
export interface AgentResult {
  id: number;
  status: "pending" | "approved" | "rejected";
  organization_id: number;
  agent_response?: AgentResponse;
  created_at: string;
  approved_by?: string;
  approved_at?: string;
}

// API response wrapper type
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

async function getLatestAgentData(organizationId: number, locationId?: number | null) {
  try {
    const locationParam = locationId ? `?locationId=${locationId}` : "";
    return await apiGet({
      path: baseurl + `/latest/${organizationId}${locationParam}`,
    });
  } catch (err) {
    logger.log(err);
    return {
      successful: false,
      errorMessage: "Technical error, contact developer",
    };
  }
}

async function fetchAgentResults(params?: {
  status?: string;
}): Promise<AgentResult[]> {
  const queryParams = params?.status ? `?status=${params.status}` : "";
  return unwrap<AgentResult[]>(
    await apiGet({ path: baseurl + `/results${queryParams}` }),
  );
}

async function getLatestAgentResult(
  domain: string
): Promise<ApiResponse<AgentResult>> {
  try {
    return await apiGet({
      path: baseurl + `/latest?domain=${encodeURIComponent(domain)}`,
    });
  } catch (err) {
    logger.log(err);
    return {
      success: false,
      error: "Technical error, contact developer",
    };
  }
}

async function approveAgentResult(params: {
  resultId: number;
  status: "approved" | "rejected";
  approvedBy: string;
}): Promise<AgentResult> {
  return unwrap<AgentResult>(
    await apiPost({
      path: baseurl + `/results/${params.resultId}/approve`,
      passedData: {
        status: params.status,
        approved_by: params.approvedBy,
      },
    }),
  );
}

async function updateAgentResult(params: {
  resultId: number;
  agentResponse: AgentResponse;
}): Promise<AgentResult> {
  return unwrap<AgentResult>(
    await apiPatch({
      path: baseurl + `/results/${params.resultId}`,
      passedData: {
        agent_response: params.agentResponse,
      },
    }),
  );
}

// Export individual functions as named exports
export {
  fetchAgentResults,
  getLatestAgentResult,
  approveAgentResult,
  updateAgentResult,
};

// Default export with all functions
const agents = {
  getLatestAgentData,
  fetchAgentResults,
  getLatestAgentResult,
  approveAgentResult,
  updateAgentResult,
};

export default agents;
