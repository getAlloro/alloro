import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Download,
  Upload,
  Trash2,
  Loader2,
  Archive,
  RotateCcw,
  AlertTriangle,
  HardDrive,
} from "lucide-react";
import {
  createBackup,
  listBackups,
  getBackupStatus,
  getBackupDownloadUrl,
  restoreBackup,
  deleteBackupApi,
  type BackupJob,
} from "../../../api/backups";
import { ActionButton } from "../../ui/DesignSystem";
import { useConfirm } from "../../ui/ConfirmModal";
import { logger } from "../../../lib/logger";

interface BackupsTabProps {
  projectId: string;
  projectName: string;
}

function formatBytes(bytes: number | null): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function statusBadge(status: BackupJob["status"], type: BackupJob["type"]) {
  const colors = {
    queued: "bg-yellow-100 text-yellow-700 border-yellow-200",
    processing: "bg-blue-100 text-blue-700 border-blue-200",
    completed: "bg-green-100 text-green-700 border-green-200",
    failed: "bg-red-100 text-red-700 border-red-200",
  };
  const labels = {
    queued: "Queued",
    processing: type === "backup" ? "Backing up..." : "Restoring...",
    completed: type === "backup" ? "Completed" : "Restored",
    failed: "Failed",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${colors[status]}`}
    >
      {status === "processing" && (
        <Loader2 className="h-3 w-3 animate-spin" />
      )}
      {labels[status]}
    </span>
  );
}

export default function BackupsTab({ projectId, projectName }: BackupsTabProps) {
  const [jobs, setJobs] = useState<BackupJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<string | null>(null);
  const [restoreConfirmText, setRestoreConfirmText] = useState("");
  const [restoring, setRestoring] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const confirm = useConfirm();

  const loadBackups = useCallback(async () => {
    try {
      const { data } = await listBackups(projectId);
      setJobs(data);

      // Check for any active jobs
      const active = data.find(
        (j) => j.status === "queued" || j.status === "processing"
      );
      if (active) {
        setActiveJobId(active.id);
      } else {
        setActiveJobId(null);
      }
    } catch (err) {
      logger.error("Failed to load backups:", err);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    loadBackups();
  }, [loadBackups]);

  // Poll active job status
  useEffect(() => {
    if (!activeJobId) {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
      return;
    }

    const poll = async () => {
      try {
        const { data } = await getBackupStatus(projectId, activeJobId);
        setJobs((prev) =>
          prev.map((j) => (j.id === activeJobId ? { ...j, ...data } : j))
        );
        if (data.status === "completed" || data.status === "failed") {
          setActiveJobId(null);
          setCreating(false);
          setRestoring(false);
          loadBackups();
        }
      } catch {
        // ignore polling errors
      }
    };

    pollingRef.current = setInterval(poll, 3000);
    poll();

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [activeJobId, projectId, loadBackups]);

  const handleCreateBackup = async () => {
    try {
      setCreating(true);
      const { data } = await createBackup(projectId);
      if (data.already_active) {
        setActiveJobId(data.job_id);
      } else {
        setActiveJobId(data.job_id);
        loadBackups();
      }
    } catch (err: unknown) {
      logger.error("Failed to create backup:", err);
      setCreating(false);
    }
  };

  const handleDownload = async (jobId: string) => {
    try {
      const { data } = await getBackupDownloadUrl(projectId, jobId);
      window.open(data.url, "_blank");
    } catch (err: unknown) {
      logger.error("Failed to get download URL:", err);
    }
  };

  const handleRestoreStart = (jobId: string) => {
    setRestoreTarget(jobId);
    setRestoreConfirmText("");
  };

  const handleRestoreConfirm = async () => {
    if (!restoreTarget) return;
    try {
      setRestoring(true);
      const { data } = await restoreBackup(
        projectId,
        restoreTarget,
        restoreConfirmText
      );
      setActiveJobId(data.job_id);
      setRestoreTarget(null);
      setRestoreConfirmText("");
      loadBackups();
    } catch (err: unknown) {
      logger.error("Restore failed:", err);
      setRestoring(false);
    }
  };

  const handleDelete = async (jobId: string) => {
    const ok = await confirm({
      title: "Delete Backup",
      message:
        "This will permanently delete the backup file. This cannot be undone.",
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (!ok) return;
    try {
      await deleteBackupApi(projectId, jobId);
      loadBackups();
    } catch (err: unknown) {
      logger.error("Failed to delete backup:", err);
    }
  };

  const activeJob = jobs.find((j) => j.id === activeJobId);
  const hasActiveJob = !!activeJob;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">
            Website Backups
          </h3>
          <p className="text-sm text-gray-500">
            Create full backups of pages, posts, media, menus, and form data.
            Max 5 backups per project.
          </p>
        </div>
        <ActionButton
          label={creating ? "Creating..." : "Create Backup"}
          icon={creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Archive className="h-4 w-4" />}
          onClick={handleCreateBackup}
          variant="primary"
          disabled={hasActiveJob || creating}
        />
      </div>

      {/* Active Job Progress */}
      <AnimatePresence>
        {activeJob && (activeJob.status === "queued" || activeJob.status === "processing") && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
              <div className="flex items-center gap-3">
                <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-blue-900">
                    {activeJob.type === "backup"
                      ? "Creating backup..."
                      : "Restoring from backup..."}
                  </p>
                  <p className="text-sm text-blue-700">
                    {activeJob.progress_message || "Starting..."}
                  </p>
                </div>
                {activeJob.progress_total > 0 && (
                  <span className="text-sm font-medium text-blue-700">
                    {activeJob.progress_current}/{activeJob.progress_total}
                  </span>
                )}
              </div>
              {activeJob.progress_total > 0 && (
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-blue-200">
                  <motion.div
                    className="h-full rounded-full bg-blue-600"
                    initial={{ width: 0 }}
                    animate={{
                      width: `${(activeJob.progress_current / activeJob.progress_total) * 100}%`,
                    }}
                    transition={{ duration: 0.3 }}
                  />
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Restore Confirmation Modal */}
      <AnimatePresence>
        {restoreTarget && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
          >
            <div
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
              onClick={() => setRestoreTarget(null)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="relative w-full max-w-md rounded-2xl border border-red-200 bg-white p-6 shadow-xl"
            >
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-100">
                  <AlertTriangle className="h-5 w-5 text-red-600" />
                </div>
                <div className="flex-1">
                  <h3 className="text-base font-semibold text-gray-900">
                    Restore Website
                  </h3>
                  <p className="mt-1 text-sm text-gray-600">
                    This will <strong>permanently delete all current data</strong> (pages,
                    posts, media, menus, forms) and replace it with the backup.
                  </p>
                  <p className="mt-3 text-sm font-medium text-gray-700">
                    Type <strong>"{projectName}"</strong> to confirm:
                  </p>
                  <input
                    type="text"
                    value={restoreConfirmText}
                    onChange={(e) => setRestoreConfirmText(e.target.value)}
                    className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-red-400 focus:outline-none focus:ring-2 focus:ring-red-100"
                    placeholder={projectName}
                    autoFocus
                    onKeyDown={(e) => {
                      if (
                        e.key === "Enter" &&
                        restoreConfirmText.trim() === projectName.trim()
                      ) {
                        handleRestoreConfirm();
                      }
                    }}
                  />
                </div>
              </div>
              <div className="mt-5 flex justify-end gap-3">
                <button
                  onClick={() => setRestoreTarget(null)}
                  className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleRestoreConfirm}
                  disabled={
                    restoreConfirmText.trim() !== projectName.trim() ||
                    restoring
                  }
                  className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {restoring ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Restore"
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Backups List */}
      {jobs.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200 py-16">
          <HardDrive className="h-10 w-10 text-gray-300" />
          <p className="mt-3 text-sm font-medium text-gray-500">
            No backups yet
          </p>
          <p className="mt-1 text-xs text-gray-400">
            Create your first backup to protect your website data.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Type
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Size
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Created
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {jobs.map((job) => (
                <tr key={job.id} className="hover:bg-gray-50/50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {job.type === "backup" ? (
                        <Archive className="h-4 w-4 text-gray-400" />
                      ) : (
                        <RotateCcw className="h-4 w-4 text-gray-400" />
                      )}
                      <span className="text-sm font-medium capitalize text-gray-700">
                        {job.type}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {statusBadge(job.status, job.type)}
                    {job.status === "failed" && job.error_message && (
                      <p className="mt-1 max-w-xs truncate text-xs text-red-500" title={job.error_message}>
                        {job.error_message}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {formatBytes(job.file_size)}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {formatDate(job.created_at)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      {job.type === "backup" && job.status === "completed" && (
                        <>
                          <button
                            onClick={() => handleDownload(job.id)}
                            className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                            title="Download"
                          >
                            <Download className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleRestoreStart(job.id)}
                            disabled={hasActiveJob}
                            className="rounded-lg p-2 text-gray-400 hover:bg-orange-50 hover:text-orange-600 disabled:cursor-not-allowed disabled:opacity-30"
                            title="Restore from this backup"
                          >
                            <Upload className="h-4 w-4" />
                          </button>
                        </>
                      )}
                      {(job.status === "completed" || job.status === "failed" || job.status === "queued") && (
                        <button
                          onClick={() => handleDelete(job.id)}
                          className="rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-500"
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Info */}
      <p className="text-xs text-gray-400">
        Backups include all pages, posts, media files, menus, code snippets,
        form submissions, and newsletter signups. Max 5 backups per project —
        oldest is auto-deleted when creating a new one.
      </p>
    </div>
  );
}
