/**
 * Code Snippets API - Header Footer Code Manager (HFCM)
 */

import { getCommonHeaders } from "./index";

// Attach the Bearer token (via getCommonHeaders) to every admin call. These
// /api/admin/websites/* routes are protected by the app-level auth guard;
// bare fetch would 401.
const adminFetch = (input: RequestInfo | URL, init: RequestInit = {}) => {
  const headers = new Headers(init.headers);
  Object.entries(getCommonHeaders()).forEach(([key, value]) => {
    if (!headers.has(key)) headers.set(key, value);
  });
  return fetch(input, { ...init, headers });
};

export type CodeSnippetLocation = 'head_start' | 'head_end' | 'body_start' | 'body_end';

export interface CodeSnippet {
  id: string;
  template_id: string | null;
  project_id: string | null;
  name: string;
  location: CodeSnippetLocation;
  code: string;
  is_enabled: boolean;
  order_index: number;
  page_ids: string[];
  created_at: string;
  updated_at: string;
}

export interface CreateCodeSnippetRequest {
  name: string;
  location: CodeSnippetLocation;
  code: string;
  page_ids: string[];
  order_index?: number;
}

export interface UpdateCodeSnippetRequest {
  name?: string;
  location?: CodeSnippetLocation;
  code?: string;
  page_ids?: string[];
  order_index?: number;
}

interface ApiResponse<T> {
  success: boolean;
  data: T;
  error?: string;
  message?: string;
}

// =====================================================================
// TEMPLATE CODE SNIPPETS
// =====================================================================

/**
 * Fetch all code snippets for a template
 */
export const fetchTemplateCodeSnippets = async (
  templateId: string
): Promise<ApiResponse<CodeSnippet[]>> => {
  const response = await adminFetch(`/api/admin/websites/templates/${templateId}/code-snippets`);

  if (!response.ok) {
    throw new Error(`Failed to fetch template code snippets: ${response.statusText}`);
  }

  return response.json();
};

/**
 * Create a new code snippet for a template
 */
export const createTemplateCodeSnippet = async (
  templateId: string,
  data: CreateCodeSnippetRequest
): Promise<ApiResponse<CodeSnippet>> => {
  const response = await adminFetch(`/api/admin/websites/templates/${templateId}/code-snippets`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to create code snippet");
  }

  return response.json();
};

/**
 * Update a template code snippet
 */
export const updateTemplateCodeSnippet = async (
  templateId: string,
  snippetId: string,
  data: UpdateCodeSnippetRequest
): Promise<ApiResponse<CodeSnippet>> => {
  const response = await adminFetch(`/api/admin/websites/templates/${templateId}/code-snippets/${snippetId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to update code snippet");
  }

  return response.json();
};

/**
 * Delete a template code snippet
 */
export const deleteTemplateCodeSnippet = async (
  templateId: string,
  snippetId: string
): Promise<ApiResponse<void>> => {
  const response = await adminFetch(`/api/admin/websites/templates/${templateId}/code-snippets/${snippetId}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to delete code snippet");
  }

  return response.json();
};

/**
 * Toggle is_enabled for a template code snippet
 */
export const toggleTemplateCodeSnippet = async (
  templateId: string,
  snippetId: string
): Promise<ApiResponse<{ is_enabled: boolean }>> => {
  const response = await adminFetch(`/api/admin/websites/templates/${templateId}/code-snippets/${snippetId}/toggle`, {
    method: "PATCH",
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to toggle code snippet");
  }

  return response.json();
};

/**
 * Reorder template code snippets
 */
export const reorderTemplateCodeSnippets = async (
  templateId: string,
  snippetIds: string[]
): Promise<ApiResponse<void>> => {
  const response = await adminFetch(`/api/admin/websites/templates/${templateId}/code-snippets/reorder`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ snippetIds }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to reorder code snippets");
  }

  return response.json();
};

// =====================================================================
// PROJECT CODE SNIPPETS
// =====================================================================

/**
 * Fetch all code snippets for a project
 */
export const fetchProjectCodeSnippets = async (
  projectId: string
): Promise<ApiResponse<CodeSnippet[]>> => {
  const response = await adminFetch(`/api/admin/websites/${projectId}/code-snippets`);

  if (!response.ok) {
    throw new Error(`Failed to fetch project code snippets: ${response.statusText}`);
  }

  return response.json();
};

/**
 * Create a new code snippet for a project
 */
export const createProjectCodeSnippet = async (
  projectId: string,
  data: CreateCodeSnippetRequest
): Promise<ApiResponse<CodeSnippet>> => {
  const response = await adminFetch(`/api/admin/websites/${projectId}/code-snippets`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to create code snippet");
  }

  return response.json();
};

/**
 * Update a project code snippet
 */
export const updateProjectCodeSnippet = async (
  projectId: string,
  snippetId: string,
  data: UpdateCodeSnippetRequest
): Promise<ApiResponse<CodeSnippet>> => {
  const response = await adminFetch(`/api/admin/websites/${projectId}/code-snippets/${snippetId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to update code snippet");
  }

  return response.json();
};

/**
 * Delete a project code snippet
 */
export const deleteProjectCodeSnippet = async (
  projectId: string,
  snippetId: string
): Promise<ApiResponse<void>> => {
  const response = await adminFetch(`/api/admin/websites/${projectId}/code-snippets/${snippetId}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to delete code snippet");
  }

  return response.json();
};

/**
 * Toggle is_enabled for a project code snippet
 */
export const toggleProjectCodeSnippet = async (
  projectId: string,
  snippetId: string
): Promise<ApiResponse<{ is_enabled: boolean }>> => {
  const response = await adminFetch(`/api/admin/websites/${projectId}/code-snippets/${snippetId}/toggle`, {
    method: "PATCH",
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to toggle code snippet");
  }

  return response.json();
};

/**
 * Reorder project code snippets
 */
export const reorderProjectCodeSnippets = async (
  projectId: string,
  snippetIds: string[]
): Promise<ApiResponse<void>> => {
  const response = await adminFetch(`/api/admin/websites/${projectId}/code-snippets/reorder`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ snippetIds }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to reorder code snippets");
  }

  return response.json();
};
