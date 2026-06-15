import { apiGet, apiPost, apiPatch, unwrap } from "./index";
import type { AgentResponse } from "../types/agents";

// T4 error-contract: every function throws an ApiError on failure (via unwrap)
// and returns the unwrapped payload.

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

async function fetchAgentResults(params?: {
  status?: string;
}): Promise<AgentResult[]> {
  const queryParams = params?.status ? `?status=${params.status}` : "";
  return unwrap<AgentResult[]>(
    await apiGet({ path: baseurl + `/results${queryParams}` }),
  );
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

export { fetchAgentResults, approveAgentResult, updateAgentResult };
