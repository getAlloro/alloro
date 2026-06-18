/**
 * Backups API — Admin portal for website backup and restore
 */

import { adminFetch } from "./index";

const BASE = "/api/admin/websites";

// =====================================================================
// TYPES
// =====================================================================

export interface BackupJob {
  id: string;
  project_id: string;
  type: "backup" | "restore";
  status: "queued" | "processing" | "completed" | "failed";
  progress_message: string | null;
  progress_current: number;
  progress_total: number;
  s3_key: string | null;
  file_size: number | null;
  filename: string | null;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
}

// =====================================================================
// API CALLS
// =====================================================================

export const createBackup = async (
  projectId: string
): Promise<{ success: boolean; data: { job_id: string; estimated_bytes: number; already_active?: boolean } }> => {
  const response = await adminFetch(`${BASE}/${projectId}/backups`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  if (!response.ok) throw new Error((await response.json()).message || "Failed to create backup");
  return response.json();
};

export const listBackups = async (
  projectId: string
): Promise<{ success: boolean; data: BackupJob[] }> => {
  const response = await adminFetch(`${BASE}/${projectId}/backups`);
  if (!response.ok) throw new Error((await response.json()).message || "Failed to list backups");
  return response.json();
};

export const getBackupStatus = async (
  projectId: string,
  jobId: string
): Promise<{ success: boolean; data: BackupJob }> => {
  const response = await adminFetch(`${BASE}/${projectId}/backups/${jobId}/status`);
  if (!response.ok) throw new Error((await response.json()).message || "Failed to get backup status");
  return response.json();
};

export const getBackupDownloadUrl = async (
  projectId: string,
  jobId: string
): Promise<{ success: boolean; data: { url: string; filename: string; expires_in: number } }> => {
  const response = await adminFetch(`${BASE}/${projectId}/backups/${jobId}/download`);
  if (!response.ok) throw new Error((await response.json()).message || "Failed to get download URL");
  return response.json();
};

export const restoreBackup = async (
  projectId: string,
  jobId: string,
  confirmation: string
): Promise<{ success: boolean; data: { job_id: string } }> => {
  const response = await adminFetch(`${BASE}/${projectId}/backups/${jobId}/restore`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ confirmation }),
  });
  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.message || "Failed to restore backup");
  }
  return response.json();
};

export const deleteBackupApi = async (
  projectId: string,
  jobId: string
): Promise<{ success: boolean }> => {
  const response = await adminFetch(`${BASE}/${projectId}/backups/${jobId}`, {
    method: "DELETE",
  });
  if (!response.ok) throw new Error((await response.json()).message || "Failed to delete backup");
  return response.json();
};
