/**
 * Admin Websites — Backups sub-router
 *
 * Project backup create/list plus per-job status, download, restore, delete.
 *
 * Mounted by `../websites.ts` AFTER the super-admin auth hoist (so every route
 * inherits `[authenticateToken, superAdminMiddleware]`) and BEFORE the
 * parameterized `/:id` project routes, matching the original ordering. Handlers
 * delegate to `BackupController`.
 */

import express from "express";
import * as backupController from "../../../controllers/admin-websites/BackupController";

const router = express.Router();

// =====================================================================
// BACKUPS (before other /:id parameterized routes)
// =====================================================================

// POST /:id/backups — Create a new backup
router.post("/:id/backups", backupController.createBackup);

// GET  /:id/backups — List backups for a project
router.get("/:id/backups", backupController.listBackups);

// GET  /:id/backups/:jobId/status — Poll backup/restore status
router.get("/:id/backups/:jobId/status", backupController.getBackupStatus);

// GET  /:id/backups/:jobId/download — Get pre-signed download URL
router.get("/:id/backups/:jobId/download", backupController.downloadBackup);

// POST /:id/backups/:jobId/restore — Restore from a backup
router.post("/:id/backups/:jobId/restore", backupController.restoreBackup);

// DELETE /:id/backups/:jobId — Delete a backup
router.delete("/:id/backups/:jobId", backupController.deleteBackup);

export default router;
