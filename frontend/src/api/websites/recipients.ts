/**
 * Websites API - recipients, form recipient catalog, form submissions
 *
 * Re-exported via the `src/api/websites.ts` barrel.
 */

import { adminFetch } from "../index";
import { API_BASE } from "./_shared";
import type { ContactFormData } from "./domains";

// =====================================================================
// RECIPIENTS
// =====================================================================

export interface RecipientsResponse {
  success: boolean;
  data: {
    recipients: string[];
    orgUsers: { name: string; email: string; role: string }[];
  };
}

export const fetchRecipients = async (
  projectId: string,
): Promise<RecipientsResponse> => {
  const response = await adminFetch(`${API_BASE}/${projectId}/recipients`);
  if (!response.ok) throw new Error("Failed to fetch recipients");
  return response.json();
};

export const updateRecipients = async (
  projectId: string,
  recipients: string[],
): Promise<{ success: boolean; data: { recipients: string[] } }> => {
  const response = await adminFetch(`${API_BASE}/${projectId}/recipients`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ recipients }),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to update recipients");
  }
  return response.json();
};

export interface WebsiteFormCatalogItem {
  form_name: string;
  form_key: string;
  display_label: string | null;
  sort_order: number | null;
  submission_count: number;
  last_seen: string | null;
  unread_count: number;
  sources: {
    submissions: boolean;
    markup: boolean;
  };
  rule: {
    id: string;
    recipients: string[];
    is_enabled: boolean;
    updated_at: string;
  } | null;
}

export interface FormRecipientCatalogResponse {
  success: boolean;
  data: WebsiteFormCatalogItem[];
}

export const fetchFormRecipientCatalog = async (
  projectId: string,
): Promise<FormRecipientCatalogResponse> => {
  const response = await adminFetch(`${API_BASE}/${projectId}/forms/catalog`);
  if (!response.ok) throw new Error("Failed to fetch form catalog");
  return response.json();
};

export const updateFormRecipientRule = async (
  projectId: string,
  payload: { formName: string; recipients: string[]; isEnabled: boolean },
): Promise<{
  success: boolean;
  data: {
    id: string;
    project_id: string;
    form_name: string;
    form_key: string;
    recipients: string[];
    is_enabled: boolean;
    updated_at: string;
  };
}> => {
  const response = await adminFetch(`${API_BASE}/${projectId}/forms/recipients`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to update form recipients");
  }
  return response.json();
};

export type FormCatalogPreferenceInput = {
  formName: string;
  displayLabel: string | null;
  sortOrder: number;
};

export const updateFormCatalogPreferences = async (
  projectId: string,
  payload: { preferences: FormCatalogPreferenceInput[] },
): Promise<{
  success: boolean;
  data: Array<{
    id: string;
    project_id: string;
    form_name: string;
    form_key: string;
    display_label: string | null;
    sort_order: number | null;
    updated_at: string;
  }>;
}> => {
  const response = await adminFetch(`${API_BASE}/${projectId}/forms/preferences`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to update form preferences");
  }
  return response.json();
};

// =====================================================================
// FORM SUBMISSIONS
// =====================================================================

export interface FileValue {
  url: string;
  name: string;
  type: string;
  s3Key: string;
}

export interface FormSection {
  title: string;
  fields: [string, string | FileValue][];
}

/** Contents can be flat key-value (legacy) or ordered sections array (new) */
export type FormContents = Record<string, string | FileValue> | FormSection[];

export interface FormSubmission {
  id: string;
  project_id: string;
  form_name: string;
  contents: FormContents;
  recipients_sent_to: string[];
  submitted_at: string;
  is_read: boolean;
  is_flagged?: boolean;
  flag_reason?: string;
}

export interface FormSubmissionsResponse {
  success: boolean;
  data: FormSubmission[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
  allCount?: number;
  unreadCount: number;
  flaggedCount: number;
  verifiedCount: number;
  optinsCount: number;
}

export const fetchFormSubmissions = async (
  projectId: string,
  page = 1,
  limit = 20,
  filter?: string,
  formName?: string,
): Promise<FormSubmissionsResponse> => {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (filter) params.set("filter", filter);
  if (formName) params.set("formName", formName);
  const response = await adminFetch(`${API_BASE}/${projectId}/form-submissions?${params}`);
  if (!response.ok) throw new Error("Failed to fetch form submissions");
  return response.json();
};

export const markAllFormSubmissionsRead = async (
  projectId: string,
  formName?: string,
): Promise<{ success: boolean; data?: { updated: number }; updated?: number }> => {
  const response = await adminFetch(`${API_BASE}/${projectId}/form-submissions/mark-all-read`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ formName }),
  });
  if (!response.ok) throw new Error("Failed to mark submissions read");
  return response.json();
};

export const fetchFormSubmission = async (
  projectId: string,
  submissionId: string,
): Promise<{ success: boolean; data: FormSubmission }> => {
  const response = await adminFetch(`${API_BASE}/${projectId}/form-submissions/${submissionId}`);
  if (!response.ok) throw new Error("Failed to fetch submission");
  return response.json();
};

export const toggleFormSubmissionRead = async (
  projectId: string,
  submissionId: string,
  is_read: boolean,
): Promise<{ success: boolean }> => {
  const response = await adminFetch(`${API_BASE}/${projectId}/form-submissions/${submissionId}/read`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ is_read }),
  });
  if (!response.ok) throw new Error("Failed to update submission");
  return response.json();
};

export const deleteFormSubmission = async (
  projectId: string,
  submissionId: string,
): Promise<{ success: boolean }> => {
  const response = await adminFetch(`${API_BASE}/${projectId}/form-submissions/${submissionId}`, {
    method: "DELETE",
  });
  if (!response.ok) throw new Error("Failed to delete submission");
  return response.json();
};

export const sendFormSubmissionEmail = async (
  projectId: string,
  submissionId: string,
): Promise<{ success: boolean }> => {
  const response = await adminFetch(`${API_BASE}/${projectId}/form-submissions/${submissionId}/send-email`, {
    method: "POST",
  });
  if (!response.ok) throw new Error("Failed to send submission");
  return response.json();
};

export const bulkSendFormSubmissionsEmail = async (
  projectId: string,
  submissionIds: string[],
): Promise<{ success: boolean; data: { sent: number; skipped: number } }> => {
  const response = await adminFetch(`${API_BASE}/${projectId}/form-submissions/bulk/send-email`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ submissionIds }),
  });
  if (!response.ok) throw new Error("Failed to bulk send submissions");
  return response.json();
};

export const bulkDeleteFormSubmissions = async (
  projectId: string,
  submissionIds: string[],
): Promise<{ success: boolean }> => {
  const response = await adminFetch(`${API_BASE}/${projectId}/form-submissions/bulk`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ submissionIds }),
  });
  if (!response.ok) throw new Error("Failed to bulk delete submissions");
  return response.json();
};

export const bulkToggleFormSubmissionsRead = async (
  projectId: string,
  submissionIds: string[],
  is_read: boolean,
): Promise<{ success: boolean }> => {
  const response = await adminFetch(`${API_BASE}/${projectId}/form-submissions/bulk/read`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ submissionIds, is_read }),
  });
  if (!response.ok) throw new Error("Failed to bulk update submissions");
  return response.json();
};

/**
 * Submit a contact form from a rendered site
 */
export const submitContactForm = async (
  data: ContactFormData,
): Promise<{ success: boolean }> => {
  const response = await adminFetch("/api/websites/contact", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to submit contact form");
  }

  return response.json();
};
