/**
 * Imports API — Admin portal for managing self-hosted assets
 * (CSS, JS, images, fonts, etc.) used by website-builder templates.
 */

import { getCommonHeaders } from "./index";

// Attach the Bearer token (via getCommonHeaders) to every admin call. The
// /api/admin/websites/imports routes are protected by the app-level auth guard;
// bare fetch would 401.
const adminFetch = (input: RequestInfo | URL, init: RequestInit = {}) => {
  const headers = new Headers(init.headers);
  Object.entries(getCommonHeaders()).forEach(([key, value]) => {
    if (!headers.has(key)) headers.set(key, value);
  });
  return fetch(input, { ...init, headers });
};

export type ImportType = "css" | "javascript" | "image" | "font" | "file";
export type ImportStatus = "published" | "active" | "deprecated";

export interface ImportVersion {
  id: string;
  filename: string;
  display_name: string;
  type: ImportType;
  version: number;
  status: ImportStatus;
  mime_type: string;
  file_size: number;
  s3_key: string;
  s3_bucket: string;
  content_hash: string;
  text_content: string | null;
  created_at: string;
  updated_at: string;
}

export interface ImportSummary {
  id: string;
  filename: string;
  display_name: string;
  type: ImportType;
  published_version: number | null;
  latest_version: number;
  version_count: number;
  status: ImportStatus;
  updated_at: string;
  created_at: string;
}

const API_BASE = "/api/admin/websites/imports";

/**
 * Fetch all imports (summary list)
 */
export const fetchImports = async (filters?: {
  type?: string;
  status?: string;
  search?: string;
}): Promise<{ success: boolean; data: ImportSummary[] }> => {
  const params = new URLSearchParams();
  if (filters?.type) params.set("type", filters.type);
  if (filters?.status) params.set("status", filters.status);
  if (filters?.search) params.set("search", filters.search);

  const qs = params.toString();
  const url = qs ? `${API_BASE}?${qs}` : API_BASE;

  const response = await adminFetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch imports: ${response.statusText}`);
  }
  return response.json();
};

/**
 * Fetch a single import with all versions
 */
export const fetchImport = async (
  id: string
): Promise<{ success: boolean; data: ImportVersion & { versions: ImportVersion[] } }> => {
  const response = await adminFetch(`${API_BASE}/${id}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch import: ${response.statusText}`);
  }
  return response.json();
};

/**
 * Create a new import — supports both file upload and text content
 */
export const createImport = async (
  data: FormData
): Promise<{ success: boolean; data: ImportVersion }> => {
  const response = await adminFetch(API_BASE, {
    method: "POST",
    body: data,
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to create import");
  }
  return response.json();
};

/**
 * Upload a new version of an existing import
 */
export const createNewVersion = async (
  id: string,
  data: FormData
): Promise<{ success: boolean; data: ImportVersion }> => {
  const response = await adminFetch(`${API_BASE}/${id}/new-version`, {
    method: "POST",
    body: data,
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to create new version");
  }
  return response.json();
};

/**
 * Update import version status (publish, activate, deprecate)
 */
export const updateImportStatus = async (
  id: string,
  status: ImportStatus
): Promise<{
  success: boolean;
  data: ImportVersion;
  previouslyPublished: { id: string; version: number } | null;
}> => {
  const response = await adminFetch(`${API_BASE}/${id}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to update status");
  }
  return response.json();
};

/**
 * Delete an import version
 */
export const deleteImport = async (
  id: string
): Promise<{ success: boolean; message: string }> => {
  const response = await adminFetch(`${API_BASE}/${id}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to delete import");
  }
  return response.json();
};

/**
 * Build the public serving URL for an import
 */
export const getImportUrl = (filename: string, version?: number): string => {
  if (version) {
    return `/api/imports/${filename}/v/${version}`;
  }
  return `/api/imports/${filename}`;
};
