/**
 * Websites API - page editor (pages, drafts, versions, component edits)
 *
 * Re-exported via the `src/api/websites.ts` barrel.
 */

import type { Section } from "../templates";
import { adminFetch } from "../index";
import { API_BASE } from "./_shared";
import type { EditChatHistory, WebsitePage } from "./_shared";

// =====================================================================
// PAGE EDITOR
// =====================================================================

/**
 * Fetch a single page by ID
 */
export const fetchPage = async (
  projectId: string,
  pageId: string,
): Promise<{ success: boolean; data: WebsitePage }> => {
  const response = await adminFetch(`${API_BASE}/${projectId}/pages/${pageId}`);

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to fetch page");
  }

  return response.json();
};

/**
 * Create a draft from a published page (idempotent)
 */
export const createDraftFromPage = async (
  projectId: string,
  pageId: string,
): Promise<{ success: boolean; data: WebsitePage }> => {
  const response = await adminFetch(
    `${API_BASE}/${projectId}/pages/${pageId}/create-draft`,
    { method: "POST" },
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to create draft");
  }

  return response.json();
};

export type UpdatePageSectionsOptions = {
  /** Optional note recorded on the saved revision (shown in History). */
  revisionNote?: string | null;
  /** Loaded row's updated_at — server returns 409 STALE_WRITE on mismatch. */
  expectedUpdatedAt?: string | null;
  /** Overwrite even when the row changed since it was loaded. */
  force?: boolean;
};

export type ApiError = Error & { code?: string; status?: number };

/**
 * Update a draft page's sections and/or chat history
 */
export const updatePageSections = async (
  projectId: string,
  pageId: string,
  sections: Section[],
  editChatHistory?: EditChatHistory,
  options?: UpdatePageSectionsOptions,
): Promise<{ success: boolean; data: WebsitePage }> => {
  const body: Record<string, unknown> = { sections };
  if (editChatHistory !== undefined) {
    body.edit_chat_history = editChatHistory;
  }
  if (options?.revisionNote) {
    body.revision_note = options.revisionNote;
  }
  if (options?.expectedUpdatedAt) {
    body.expected_updated_at = options.expectedUpdatedAt;
  }
  if (options?.force) {
    body.force = true;
  }

  const response = await adminFetch(`${API_BASE}/${projectId}/pages/${pageId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorBody = await response.json();
    const error = new Error(
      errorBody.message || "Failed to update page",
    ) as ApiError;
    error.code = errorBody.error;
    error.status = response.status;
    throw error;
  }

  return response.json();
};

/**
 * Publish a draft page
 */
export const publishPage = async (
  projectId: string,
  pageId: string,
): Promise<{ success: boolean; data: WebsitePage }> => {
  const response = await adminFetch(
    `${API_BASE}/${projectId}/pages/${pageId}/publish`,
    { method: "POST" },
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to publish page");
  }

  return response.json();
};

export type PageVersionSummary = {
  id: string;
  version: number;
  status: "draft" | "published" | "inactive";
  created_at: string;
  updated_at: string;
};

/**
 * List version history at a page's path
 */
export const fetchPageVersions = async (
  projectId: string,
  pageId: string,
): Promise<{ success: boolean; data: { versions: PageVersionSummary[]; path: string } }> => {
  const response = await adminFetch(
    `${API_BASE}/${projectId}/pages/${pageId}/versions`,
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to fetch page versions");
  }

  return response.json();
};

/**
 * Fetch a single version's full content
 */
export const fetchPageVersionContent = async (
  projectId: string,
  pageId: string,
  versionId: string,
): Promise<{ success: boolean; data: WebsitePage }> => {
  const response = await adminFetch(
    `${API_BASE}/${projectId}/pages/${pageId}/versions/${versionId}`,
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to fetch page version");
  }

  return response.json();
};

/**
 * Restore a version's content into the current draft (never publishes)
 */
export const restorePageVersionIntoDraft = async (
  projectId: string,
  pageId: string,
  versionId: string,
): Promise<{ success: boolean; data: WebsitePage }> => {
  const response = await adminFetch(
    `${API_BASE}/${projectId}/pages/${pageId}/versions/${versionId}/restore`,
    { method: "POST" },
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to restore page version");
  }

  return response.json();
};

/**
 * Create a blank page (no template, no pipeline)
 */
export const createBlankPage = async (
  projectId: string,
  data: { path: string; display_name?: string; sections?: Section[] },
): Promise<{ success: boolean; data: WebsitePage }> => {
  const response = await adminFetch(`${API_BASE}/${projectId}/pages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      path: data.path,
      sections: data.sections ?? [],
      display_name: data.display_name,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to create page");
  }

  return response.json();
};

/**
 * Upload an artifact page (React app zip build)
 */
export const uploadArtifactPage = async (
  projectId: string,
  data: { file: File; path: string; display_name?: string },
): Promise<{ success: boolean; data: WebsitePage }> => {
  const formData = new FormData();
  formData.append("file", data.file);
  formData.append("path", data.path);
  if (data.display_name) {
    formData.append("display_name", data.display_name);
  }

  const response = await adminFetch(`${API_BASE}/${projectId}/pages/artifact`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to upload artifact page");
  }

  return response.json();
};

/**
 * Replace an artifact page's build with a new zip
 */
export const replaceArtifactBuild = async (
  projectId: string,
  pageId: string,
  file: File,
): Promise<{ success: boolean; data: WebsitePage }> => {
  const formData = new FormData();
  formData.append("file", file);

  const response = await adminFetch(
    `${API_BASE}/${projectId}/pages/${pageId}/artifact`,
    {
      method: "PUT",
      body: formData,
    },
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to replace artifact build");
  }

  return response.json();
};

/**
 * Delete a page version
 */
export const deletePageVersion = async (
  projectId: string,
  pageId: string,
): Promise<{ success: boolean; message: string }> => {
  const response = await adminFetch(`${API_BASE}/${projectId}/pages/${pageId}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to delete page version");
  }

  return response.json();
};

/**
 * Delete ALL versions of a page at a given path
 */
export const deletePageByPath = async (
  projectId: string,
  path: string,
): Promise<{ success: boolean; message: string }> => {
  const response = await adminFetch(
    `${API_BASE}/${projectId}/pages/by-path?path=${encodeURIComponent(path)}`,
    { method: "DELETE" },
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to delete page");
  }

  return response.json();
};

export interface EditComponentRequest {
  alloroClass: string;
  currentHtml: string;
  instruction: string;
  chatHistory?: Array<{ role: "user" | "assistant"; content: string }>;
}

export interface EditDebugInfo {
  model: string;
  systemPrompt: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  inputTokens: number;
  outputTokens: number;
}

export interface EditComponentResponse {
  success: boolean;
  editedHtml: string | null;
  message?: string;
  rejected?: boolean;
  debug?: EditDebugInfo;
}

/**
 * Send an edit instruction to Claude for a specific component
 */
export const editPageComponent = async (
  projectId: string,
  pageId: string,
  payload: EditComponentRequest,
): Promise<EditComponentResponse> => {
  const response = await adminFetch(
    `${API_BASE}/${projectId}/pages/${pageId}/edit`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to edit component");
  }

  return response.json();
};

/**
 * Send an edit instruction to Claude for a layout component (header/footer)
 */
export const editLayoutComponent = async (
  projectId: string,
  payload: EditComponentRequest,
): Promise<EditComponentResponse> => {
  const response = await adminFetch(`${API_BASE}/${projectId}/edit-layout`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to edit layout component");
  }

  return response.json();
};

/**
 * Fetch the page editor system prompt from admin settings
 */
export const fetchEditorSystemPrompt = async (): Promise<string> => {
  const response = await adminFetch(`${API_BASE}/editor/system-prompt`);

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to fetch system prompt");
  }

  const data = await response.json();
  return data.prompt;
};
