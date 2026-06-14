/**
 * Menu Templates API - Admin portal for managing menu templates
 */

import type { Section } from "./templates";
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

// =====================================================================
// TYPES
// =====================================================================

export interface MenuTemplate {
  id: string;
  template_id: string;
  name: string;
  slug: string;
  sections: Section[];
  created_at: string;
  updated_at: string;
}

const TEMPLATES_BASE = "/api/admin/websites/templates";

// =====================================================================
// CRUD
// =====================================================================

export const fetchMenuTemplates = async (
  templateId: string
): Promise<{ success: boolean; data: MenuTemplate[] }> => {
  const response = await adminFetch(`${TEMPLATES_BASE}/${templateId}/menu-templates`);
  if (!response.ok) throw new Error(`Failed to fetch menu templates: ${response.statusText}`);
  return response.json();
};

export const fetchMenuTemplate = async (
  templateId: string,
  menuTemplateId: string
): Promise<{ success: boolean; data: MenuTemplate }> => {
  const response = await adminFetch(`${TEMPLATES_BASE}/${templateId}/menu-templates/${menuTemplateId}`);
  if (!response.ok) throw new Error(`Failed to fetch menu template: ${response.statusText}`);
  return response.json();
};

export const createMenuTemplate = async (
  templateId: string,
  data: { name: string; sections?: Section[] }
): Promise<{ success: boolean; data: MenuTemplate }> => {
  const response = await adminFetch(`${TEMPLATES_BASE}/${templateId}/menu-templates`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.message || `Failed to create menu template: ${response.statusText}`);
  }
  return response.json();
};

export const updateMenuTemplate = async (
  templateId: string,
  menuTemplateId: string,
  data: Partial<Pick<MenuTemplate, "name" | "sections">>
): Promise<{ success: boolean; data: MenuTemplate }> => {
  const response = await adminFetch(`${TEMPLATES_BASE}/${templateId}/menu-templates/${menuTemplateId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.message || `Failed to update menu template: ${response.statusText}`);
  }
  return response.json();
};

export const deleteMenuTemplate = async (
  templateId: string,
  menuTemplateId: string
): Promise<{ success: boolean }> => {
  const response = await adminFetch(`${TEMPLATES_BASE}/${templateId}/menu-templates/${menuTemplateId}`, {
    method: "DELETE",
  });
  if (!response.ok) throw new Error(`Failed to delete menu template: ${response.statusText}`);
  return response.json();
};
