/**
 * Templates API - Admin portal for managing website-builder templates
 */

import { adminFetch } from "./index";

export type TemplateStatus = "draft" | "published";

export interface Section {
  name: string;
  content: string;
}

export interface TemplatePage {
  id: string;
  template_id: string;
  name: string;
  sections: Section[];
  created_at: string;
  updated_at: string;
}

export interface Template {
  id: string;
  name: string;
  wrapper: string;
  header: string;
  footer: string;
  status: TemplateStatus;
  is_active: boolean;
  template_pages?: TemplatePage[];
  created_at: string;
  updated_at: string;
}

const API_BASE = "/api/admin/websites/templates";

/**
 * Fetch all templates
 */
export const fetchTemplates = async (): Promise<{
  success: boolean;
  data: Template[];
}> => {
  const response = await adminFetch(API_BASE);

  if (!response.ok) {
    throw new Error(`Failed to fetch templates: ${response.statusText}`);
  }

  return response.json();
};

/**
 * Fetch a single template
 */
export const fetchTemplate = async (
  id: string
): Promise<{ success: boolean; data: Template }> => {
  const response = await adminFetch(`${API_BASE}/${id}`);

  if (!response.ok) {
    throw new Error(`Failed to fetch template: ${response.statusText}`);
  }

  return response.json();
};

/**
 * Create a new template
 */
export const createTemplate = async (data: {
  name: string;
  wrapper?: string;
  header?: string;
  footer?: string;
  is_active?: boolean;
}): Promise<{ success: boolean; data: Template }> => {
  const response = await adminFetch(API_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to create template");
  }

  return response.json();
};

/**
 * Update a template
 */
export const updateTemplate = async (
  id: string,
  data: Partial<Pick<Template, "name" | "wrapper" | "header" | "footer" | "status" | "is_active">>
): Promise<{ success: boolean; data: Template }> => {
  const response = await adminFetch(`${API_BASE}/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to update template");
  }

  return response.json();
};

/**
 * Delete a template
 */
export const deleteTemplate = async (
  id: string
): Promise<{ success: boolean; message: string }> => {
  const response = await adminFetch(`${API_BASE}/${id}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to delete template");
  }

  return response.json();
};

/**
 * Activate a template (deactivates all others)
 */
export const activateTemplate = async (
  id: string
): Promise<{ success: boolean; data: Template }> => {
  const response = await adminFetch(`${API_BASE}/${id}/activate`, {
    method: "POST",
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to activate template");
  }

  return response.json();
};

// =====================================================================
// TEMPLATE PAGES
// =====================================================================

/**
 * Fetch all pages for a template
 */
export const fetchTemplatePages = async (
  templateId: string
): Promise<{ success: boolean; data: TemplatePage[] }> => {
  const response = await adminFetch(`${API_BASE}/${templateId}/pages`);

  if (!response.ok) {
    throw new Error(`Failed to fetch template pages: ${response.statusText}`);
  }

  return response.json();
};

/**
 * Create a new template page
 */
export const createTemplatePage = async (
  templateId: string,
  data: { name: string; sections?: Section[] }
): Promise<{ success: boolean; data: TemplatePage }> => {
  const response = await adminFetch(`${API_BASE}/${templateId}/pages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to create template page");
  }

  return response.json();
};

/**
 * Fetch a single template page
 */
export const fetchTemplatePage = async (
  templateId: string,
  pageId: string
): Promise<{ success: boolean; data: TemplatePage }> => {
  const response = await adminFetch(`${API_BASE}/${templateId}/pages/${pageId}`);

  if (!response.ok) {
    throw new Error(`Failed to fetch template page: ${response.statusText}`);
  }

  return response.json();
};

/**
 * Update a template page
 */
export const updateTemplatePage = async (
  templateId: string,
  pageId: string,
  data: Partial<Pick<TemplatePage, "name" | "sections">>
): Promise<{ success: boolean; data: TemplatePage }> => {
  const response = await adminFetch(`${API_BASE}/${templateId}/pages/${pageId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to update template page");
  }

  return response.json();
};

/**
 * Delete a template page
 */
export const deleteTemplatePage = async (
  templateId: string,
  pageId: string
): Promise<{ success: boolean; message: string }> => {
  const response = await adminFetch(`${API_BASE}/${templateId}/pages/${pageId}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to delete template page");
  }

  return response.json();
};
