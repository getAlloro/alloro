/**
 * Admin Settings API
 */

import { adminFetch } from "./index";

const API_BASE = "/api/admin/settings";

export interface SettingRow {
  category: string;
  key: string;
  value: string;
  updated_at: string;
}

/**
 * Fetch all settings grouped by category
 */
export const fetchSettings = async (): Promise<{
  success: boolean;
  data: Record<string, Record<string, string>>;
}> => {
  const response = await adminFetch(API_BASE);

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to fetch settings");
  }

  return response.json();
};

/**
 * Fetch a single setting by category and key
 */
export const fetchSetting = async (
  category: string,
  key: string
): Promise<{ success: boolean; data: SettingRow }> => {
  const response = await adminFetch(`${API_BASE}/${category}/${key}`);

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to fetch setting");
  }

  return response.json();
};

/**
 * Update (upsert) a setting value
 */
export const updateSetting = async (
  category: string,
  key: string,
  value: string
): Promise<{ success: boolean; data: SettingRow }> => {
  const response = await adminFetch(`${API_BASE}/${category}/${key}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ value }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to update setting");
  }

  return response.json();
};
