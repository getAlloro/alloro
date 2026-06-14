/**
 * Backup Controller
 *
 * Handles website backup creation, listing, download, restore, and deletion.
 */

import { Request, Response } from "express";
import { db } from "../../database/connection";
import { BackupJobModel } from "../../models/website-builder/BackupJobModel";
import { ProjectModel } from "../../models/website-builder/ProjectModel";
import { generatePresignedUrl, deleteFromS3 } from "../../utils/core/s3";

const MAX_BACKUPS_PER_PROJECT = 5;

/**
 * POST /:projectId/backups — Create a new backup
 */
export async function createBackup(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const projectId = req.params.id;

    const project = await ProjectModel.findById(projectId);
    if (!project) {
      return res
        .status(404)
        .json({ success: false, error: "NOT_FOUND", message: "Project not found" });
    }

    // Check for active backup/restore job
    const active = await BackupJobModel.findActive(projectId);
    if (active) {
      return res.json({
        success: true,
        data: { job_id: active.id, already_active: true, type: active.type },
      });
    }

    // Calculate estimated size
    const [{ sum }] = await db("website_builder.media")
      .where({ project_id: projectId })
      .sum("file_size as sum");
    const estimatedBytes = Number(sum) || 0;

    // Enforce max backups — delete oldest if at limit
    const completedCount = await BackupJobModel.countByProjectId(
      projectId,
      "backup"
    );
    if (completedCount >= MAX_BACKUPS_PER_PROJECT) {
      const oldest = await BackupJobModel.findOldestCompleted(projectId);
      if (oldest) {
        if (oldest.s3_key) {
          try {
            await deleteFromS3(oldest.s3_key);
          } catch (err: any) {
            console.warn(
              `[BACKUP] Failed to delete old backup S3 file: ${err.message}`
            );
          }
        }
        await BackupJobModel.deleteById(oldest.id);
      }
    }

    // Create job record
    const job = await BackupJobModel.create({
      project_id: projectId,
      type: "backup",
    });

    // Enqueue BullMQ job
    const { getWbQueue } = await import("../../workers/wb-queues");
    const queue = getWbQueue("backup");
    await queue.add(
      "website-backup",
      { jobId: job.id, projectId },
      { jobId: job.id }
    );

    return res.status(201).json({
      success: true,
      data: {
        job_id: job.id,
        estimated_bytes: estimatedBytes,
      },
    });
  } catch (err: any) {
    console.error("[BACKUP] Create backup error:", err);
    return res
      .status(500)
      .json({ success: false, error: "INTERNAL", message: err.message });
  }
}

/**
 * GET /:projectId/backups — List all backup jobs for a project
 */
export async function listBackups(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const projectId = req.params.id;
    const jobs = await BackupJobModel.findByProjectId(projectId);
    return res.json({ success: true, data: jobs });
  } catch (err: any) {
    console.error("[BACKUP] List backups error:", err);
    return res
      .status(500)
      .json({ success: false, error: "INTERNAL", message: err.message });
  }
}

/**
 * GET /:projectId/backups/:jobId/status — Poll backup/restore status
 */
export async function getBackupStatus(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { jobId } = req.params;
    const job = await BackupJobModel.findById(jobId);
    if (!job) {
      return res
        .status(404)
        .json({ success: false, error: "NOT_FOUND", message: "Job not found" });
    }

    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    res.setHeader("Pragma", "no-cache");

    return res.json({
      success: true,
      data: {
        id: job.id,
        type: job.type,
        status: job.status,
        progress_message: job.progress_message,
        progress_current: job.progress_current,
        progress_total: job.progress_total,
        file_size: job.file_size,
        filename: job.filename,
        error_message: job.error_message,
        created_at: job.created_at,
        completed_at: job.completed_at,
      },
    });
  } catch (err: any) {
    console.error("[BACKUP] Get status error:", err);
    return res
      .status(500)
      .json({ success: false, error: "INTERNAL", message: err.message });
  }
}

/**
 * GET /:projectId/backups/:jobId/download — Get pre-signed download URL
 */
export async function downloadBackup(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { jobId } = req.params;
    const job = await BackupJobModel.findById(jobId);
    if (!job || !job.s3_key) {
      return res.status(404).json({
        success: false,
        error: "NOT_FOUND",
        message: "Backup not found or not yet completed",
      });
    }

    const url = await generatePresignedUrl(job.s3_key, 3600);
    return res.json({
      success: true,
      data: { url, filename: job.filename, expires_in: 3600 },
    });
  } catch (err: any) {
    console.error("[BACKUP] Download error:", err);
    return res
      .status(500)
      .json({ success: false, error: "INTERNAL", message: err.message });
  }
}

/**
 * POST /:projectId/backups/:jobId/restore — Start a restore from a backup
 */
export async function restoreBackup(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const projectId = req.params.id;
    const backupJobId = req.params.jobId;
    const { confirmation } = req.body;

    const project = await ProjectModel.findById(projectId);
    if (!project) {
      return res
        .status(404)
        .json({ success: false, error: "NOT_FOUND", message: "Project not found" });
    }

    // Confirmation gate — must type the project name
    const projectName = project.name || project.hostname || project.id;
    if (!confirmation || confirmation.trim() !== projectName.trim()) {
      return res.status(400).json({
        success: false,
        error: "CONFIRMATION_REQUIRED",
        message: `Type the project name "${projectName}" to confirm restore. This will wipe all existing data.`,
      });
    }

    // Validate backup exists and is completed
    const backup = await BackupJobModel.findById(backupJobId);
    if (!backup || backup.type !== "backup" || backup.status !== "completed") {
      return res.status(400).json({
        success: false,
        error: "INVALID_BACKUP",
        message: "Backup not found or not completed",
      });
    }

    // Check for active jobs
    const active = await BackupJobModel.findActive(projectId);
    if (active) {
      return res.status(409).json({
        success: false,
        error: "JOB_ACTIVE",
        message: `A ${active.type} job is already in progress`,
      });
    }

    // Create restore job
    const job = await BackupJobModel.create({
      project_id: projectId,
      type: "restore",
    });

    // Enqueue
    const { getWbQueue } = await import("../../workers/wb-queues");
    const queue = getWbQueue("restore");
    // attempts: 1 — a restore is a destructive wipe-then-restore. It must never
    // auto-retry: with the DB wipe+restore now wrapped in a transaction, a
    // failure rolls back to the pre-restore state, and a single attempt keeps
    // BullMQ from re-running the destructive job against already-restored data.
    await queue.add(
      "website-restore",
      { jobId: job.id, projectId, backupJobId },
      { jobId: job.id, attempts: 1 }
    );

    return res.status(201).json({
      success: true,
      data: { job_id: job.id },
    });
  } catch (err: any) {
    console.error("[BACKUP] Restore error:", err);
    return res
      .status(500)
      .json({ success: false, error: "INTERNAL", message: err.message });
  }
}

/**
 * DELETE /:projectId/backups/:jobId — Delete a backup
 */
export async function deleteBackup(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { jobId } = req.params;
    const job = await BackupJobModel.findById(jobId);
    if (!job) {
      return res
        .status(404)
        .json({ success: false, error: "NOT_FOUND", message: "Backup not found" });
    }

    // Delete S3 file if exists
    if (job.s3_key) {
      try {
        await deleteFromS3(job.s3_key);
      } catch (err: any) {
        console.warn(
          `[BACKUP] Failed to delete S3 file ${job.s3_key}: ${err.message}`
        );
      }
    }

    await BackupJobModel.deleteById(jobId);
    return res.json({ success: true });
  } catch (err: any) {
    console.error("[BACKUP] Delete error:", err);
    return res
      .status(500)
      .json({ success: false, error: "INTERNAL", message: err.message });
  }
}
