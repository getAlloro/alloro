import type {
  AgentOutputsResponse,
  AgentOutputDetailResponse,
  FetchAgentOutputsRequest,
  OrganizationsResponse,
  AgentTypesResponse,
  AgentOutputStatsResponse,
  ArchiveResponse,
  BulkArchiveResponse,
  BulkUnarchiveResponse,
  DeleteResponse,
  BulkDeleteResponse,
} from "../types/agentOutputs";
import { getCommonHeaders } from "./index";

const API_BASE = "/api/admin/agent-outputs";

// Attach the Bearer token (via getCommonHeaders) to every admin agent-outputs
// call. These routes are protected by the app-level auth guard; bare fetch
// would 401.
const adminFetch = (input: RequestInfo | URL, init: RequestInit = {}) => {
  const headers = new Headers(init.headers);
  Object.entries(getCommonHeaders()).forEach(([key, value]) => {
    if (!headers.has(key)) headers.set(key, value);
  });
  return fetch(input, { ...init, headers });
};

/**
 * Fetch all agent outputs with filters (admin only)
 */
export const fetchAgentOutputs = async (
  filters: FetchAgentOutputsRequest = {}
): Promise<AgentOutputsResponse> => {
  const params = new URLSearchParams();

  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      params.append(key, String(value));
    }
  });

  const response = await adminFetch(
    `${API_BASE}${params.toString() ? `?${params.toString()}` : ""}`
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch agent outputs: ${response.statusText}`);
  }

  return response.json();
};

/**
 * Fetch a single agent output with full details
 */
export const fetchAgentOutputDetail = async (
  id: number
): Promise<AgentOutputDetailResponse> => {
  const response = await adminFetch(`${API_BASE}/${id}`);

  if (!response.ok) {
    throw new Error(`Failed to fetch agent output: ${response.statusText}`);
  }

  return response.json();
};

/**
 * Get organizations for filter dropdown
 */
export const fetchOrganizations = async (): Promise<OrganizationsResponse> => {
  const response = await adminFetch(`${API_BASE}/organizations`);

  if (!response.ok) {
    throw new Error(`Failed to fetch organizations: ${response.statusText}`);
  }

  return response.json();
};

/**
 * Get unique agent types for filter dropdown
 */
export const fetchAgentTypes = async (): Promise<AgentTypesResponse> => {
  const response = await adminFetch(`${API_BASE}/agent-types`);

  if (!response.ok) {
    throw new Error(`Failed to fetch agent types: ${response.statusText}`);
  }

  return response.json();
};

/**
 * Get summary statistics for agent outputs
 */
export const fetchAgentOutputStats =
  async (): Promise<AgentOutputStatsResponse> => {
    const response = await adminFetch(`${API_BASE}/stats/summary`);

    if (!response.ok) {
      throw new Error(`Failed to fetch stats: ${response.statusText}`);
    }

    return response.json();
  };

/**
 * Archive a single agent output
 */
export const archiveAgentOutput = async (
  id: number
): Promise<ArchiveResponse> => {
  const response = await adminFetch(`${API_BASE}/${id}/archive`, {
    method: "PATCH",
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to archive agent output");
  }

  return response.json();
};

/**
 * Unarchive a single agent output
 */
export const unarchiveAgentOutput = async (
  id: number
): Promise<ArchiveResponse> => {
  const response = await adminFetch(`${API_BASE}/${id}/unarchive`, {
    method: "PATCH",
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to unarchive agent output");
  }

  return response.json();
};

/**
 * Bulk archive agent outputs
 */
export const bulkArchiveAgentOutputs = async (
  ids: number[]
): Promise<BulkArchiveResponse> => {
  const response = await adminFetch(`${API_BASE}/bulk/archive`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ids }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to bulk archive agent outputs");
  }

  return response.json();
};

/**
 * Bulk unarchive agent outputs
 */
export const bulkUnarchiveAgentOutputs = async (
  ids: number[]
): Promise<BulkUnarchiveResponse> => {
  const response = await adminFetch(`${API_BASE}/bulk/unarchive`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ids }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to bulk unarchive agent outputs");
  }

  return response.json();
};

/**
 * Delete a single agent output permanently
 */
export const deleteAgentOutput = async (
  id: number
): Promise<DeleteResponse> => {
  const response = await adminFetch(`${API_BASE}/${id}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to delete agent output");
  }

  return response.json();
};

/**
 * Bulk delete agent outputs permanently
 */
export const bulkDeleteAgentOutputs = async (
  ids: number[]
): Promise<BulkDeleteResponse> => {
  const response = await adminFetch(`${API_BASE}/bulk/delete`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ids }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to bulk delete agent outputs");
  }

  return response.json();
};
