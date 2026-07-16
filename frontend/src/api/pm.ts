import { apiGet, apiPost, apiPut, apiDelete, apiPostWithProgress } from "./index";
import type {
  PmProject,
  PmProjectDetail,
  PmTask,
  PmStats,
  PmMyStats,
  PmMyTasksResponse,
  PmNotification,
  PmActivityEntry,
  CreateProjectInput,
  CreateTaskInput,
  PmAiSynthBatch,
  PmAiSynthBatchTask,
  PmTaskAttachment,
  PmTaskComment,
  PmVelocityData,
  ChartDataResponse,
  PmBacklogProjectGroup,
  PmUser,
} from "../types/pm";

// Guards against silent-HTML failures: apiGet swallows errors and returns
// non-JSON bodies verbatim, so unvalidated `res.data` reads can produce
// `undefined` and crash downstream renders. These helpers force a real
// exception instead, which the stores' try/catch blocks are already set up
// to handle.
function pmEnvelopeError(res: unknown): Error {
  let msg = "PM API returned unexpected response shape";
  if (res && typeof res === "object") {
    const r = res as { error?: string; errorMessage?: string };
    if (typeof r.error === "string") msg = r.error;
    else if (typeof r.errorMessage === "string") msg = r.errorMessage;
  }
  return new Error(`[PM API] ${msg}`);
}

function unwrapPmEnvelope<T = unknown>(res: unknown): T {
  if (
    res &&
    typeof res === "object" &&
    (res as { success?: unknown }).success === true &&
    "data" in (res as Record<string, unknown>)
  ) {
    return (res as { data: T }).data;
  }
  throw pmEnvelopeError(res);
}

function assertPmEnvelope<T extends object>(res: unknown): asserts res is T {
  if (
    !res ||
    typeof res !== "object" ||
    !("data" in (res as Record<string, unknown>))
  ) {
    throw pmEnvelopeError(res);
  }
}

// --- Projects ---

type PmFetchOptions = {
  cacheBust?: boolean;
};

function withCacheBust(path: string, options?: PmFetchOptions): string {
  if (!options?.cacheBust) return path;
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}_=${Date.now()}`;
}

export async function fetchProjects(
  status: string = "active",
  options?: PmFetchOptions
): Promise<PmProject[]> {
  const res = await apiGet({ path: withCacheBust(`/pm/projects?status=${status}`, options) });
  return unwrapPmEnvelope(res);
}

export async function fetchProject(
  id: string,
  options?: PmFetchOptions
): Promise<PmProjectDetail> {
  const res = await apiGet({ path: withCacheBust(`/pm/projects/${id}`, options) });
  return unwrapPmEnvelope(res);
}

export async function createProject(
  data: CreateProjectInput
): Promise<PmProject> {
  const res = await apiPost({ path: "/pm/projects", passedData: data });
  return unwrapPmEnvelope(res);
}

export async function updateProject(
  id: string,
  data: Partial<PmProject>
): Promise<PmProject> {
  const res = await apiPut({ path: `/pm/projects/${id}`, passedData: data });
  return unwrapPmEnvelope(res);
}

export async function deleteProject(id: string): Promise<void> {
  await apiDelete({ path: `/pm/projects/${id}` });
}

export async function archiveProject(id: string): Promise<PmProject> {
  const res = await apiPut({ path: `/pm/projects/${id}/archive`, passedData: {} });
  return unwrapPmEnvelope(res);
}

// --- Tasks ---

export async function createTask(
  projectId: string,
  data: CreateTaskInput
): Promise<PmTask> {
  const res = await apiPost({ path: `/pm/projects/${projectId}/tasks`, passedData: data });
  return unwrapPmEnvelope(res);
}

export async function updateTask(
  taskId: string,
  data: Partial<PmTask>
): Promise<PmTask> {
  const res = await apiPut({ path: `/pm/tasks/${taskId}`, passedData: data });
  return unwrapPmEnvelope(res);
}

export async function moveTask(
  taskId: string,
  columnId: string,
  position: number
): Promise<PmTask> {
  const res = await apiPut({
    path: `/pm/tasks/${taskId}/move`,
    passedData: {
      column_id: columnId,
      position,
    },
  });
  return unwrapPmEnvelope(res);
}

export async function assignTask(
  taskId: string,
  assignedTo: number | null
): Promise<PmTask> {
  const res = await apiPut({
    path: `/pm/tasks/${taskId}/assign`,
    passedData: {
      assigned_to: assignedTo,
    },
  });
  return unwrapPmEnvelope(res);
}

export async function deleteTask(taskId: string): Promise<void> {
  await apiDelete({ path: `/pm/tasks/${taskId}` });
}

// --- Bulk task operations ---

export async function bulkMoveTasksToProject(
  taskIds: string[],
  targetProjectId: string
): Promise<{ moved_task_ids: string[] }> {
  const res = await apiPost({
    path: "/pm/tasks/bulk/move-to-project",
    passedData: { task_ids: taskIds, target_project_id: targetProjectId },
  });
  return unwrapPmEnvelope(res);
}

export async function bulkDeleteTasks(
  taskIds: string[]
): Promise<{ deleted_count: number }> {
  const res = await apiPost({
    path: "/pm/tasks/bulk/delete",
    passedData: { task_ids: taskIds },
  });
  return unwrapPmEnvelope(res);
}

// --- Stats ---

export async function fetchStats(): Promise<PmStats> {
  const res = await apiGet({ path: "/pm/stats" });
  return unwrapPmEnvelope(res);
}

export async function fetchVelocity(range: "7d" | "4w" | "3m" = "7d"): Promise<PmVelocityData> {
  const res = await apiGet({ path: `/pm/stats/velocity?range=${range}` });
  return unwrapPmEnvelope(res);
}

export async function getChartData(): Promise<ChartDataResponse> {
  const res = await apiGet({ path: "/pm/stats/chart-data" });
  return unwrapPmEnvelope(res);
}

// --- Activity ---

export async function fetchGlobalActivity(
  limit: number = 20,
  offset: number = 0
): Promise<{ data: PmActivityEntry[]; total: number }> {
  const res = await apiGet({
    path: `/pm/activity?limit=${limit}&offset=${offset}`,
  });
  assertPmEnvelope<{ data: PmActivityEntry[]; total: number }>(res);
  return res;
}

export async function fetchProjectActivity(
  projectId: string,
  limit: number = 20,
  offset: number = 0
): Promise<{ data: PmActivityEntry[]; total: number }> {
  const res = await apiGet({
    path: `/pm/activity/projects/${projectId}/activity?limit=${limit}&offset=${offset}`,
  });
  assertPmEnvelope<{ data: PmActivityEntry[]; total: number }>(res);
  return res;
}

export async function clearActivity(): Promise<void> {
  await apiDelete({ path: "/pm/activity" });
}

// --- Users ---

export async function fetchPmUsers(): Promise<PmUser[]> {
  const res = await apiGet({ path: "/pm/users" });
  return unwrapPmEnvelope(res);
}

// --- ME tab ---

export async function fetchMyStats(): Promise<PmMyStats> {
  const res = await apiGet({ path: "/pm/stats/me" });
  return unwrapPmEnvelope(res);
}

export async function fetchMyVelocity(range: "7d" | "4w" | "3m" = "7d"): Promise<PmVelocityData> {
  const res = await apiGet({ path: `/pm/stats/velocity/me?range=${range}` });
  return unwrapPmEnvelope(res);
}

export async function fetchMyTasks(): Promise<PmMyTasksResponse> {
  const res = await apiGet({ path: "/pm/tasks/mine" });
  return unwrapPmEnvelope(res);
}

export async function fetchBacklogTasks(): Promise<PmBacklogProjectGroup[]> {
  const res = await apiGet({ path: "/pm/tasks/backlog" });
  return unwrapPmEnvelope(res);
}

export async function fetchAssignedStats(userId: number): Promise<PmMyStats> {
  const res = await apiGet({ path: `/pm/stats/assigned/${userId}` });
  return unwrapPmEnvelope(res);
}

export async function fetchAssignedVelocity(
  userId: number,
  range: "7d" | "4w" | "3m" = "7d"
): Promise<PmVelocityData> {
  const res = await apiGet({
    path: `/pm/stats/velocity/assigned/${userId}?range=${range}`,
  });
  return unwrapPmEnvelope(res);
}

export async function fetchAssignedTasks(userId: number): Promise<PmMyTasksResponse> {
  const res = await apiGet({ path: `/pm/tasks/assigned/${userId}` });
  return unwrapPmEnvelope(res);
}

// --- Notifications ---

export async function fetchNotifications(): Promise<PmNotification[]> {
  const res = await apiGet({ path: "/pm/notifications" });
  return unwrapPmEnvelope(res);
}

export async function markNotificationsRead(): Promise<void> {
  await apiPut({ path: "/pm/notifications/read-all", passedData: {} });
}

export async function deleteAllNotifications(): Promise<void> {
  await apiDelete({ path: "/pm/notifications" });
}

// --- AI Synth Batches ---

export async function extractBatch(
  projectId: string,
  text?: string,
  file?: File
): Promise<PmAiSynthBatch> {
  if (file) {
    const formData = new FormData();
    formData.append("project_id", projectId);
    formData.append("scope", "project");
    formData.append("file", file);
    const res = await apiPost({ path: "/pm/ai-synth/extract", passedData: formData });
    return unwrapPmEnvelope(res);
  }
  const res = await apiPost({
    path: "/pm/ai-synth/extract",
    passedData: { project_id: projectId, scope: "project", text },
  });
  return unwrapPmEnvelope(res);
}

export async function extractCrossProjectBatch(
  text?: string,
  file?: File
): Promise<PmAiSynthBatch> {
  if (file) {
    const formData = new FormData();
    formData.append("scope", "cross_project");
    formData.append("file", file);
    const res = await apiPost({ path: "/pm/ai-synth/extract", passedData: formData });
    return unwrapPmEnvelope(res);
  }
  const res = await apiPost({
    path: "/pm/ai-synth/extract",
    passedData: { scope: "cross_project", text },
  });
  return unwrapPmEnvelope(res);
}

export async function fetchCrossProjectBatches(
  limit = 20,
  offset = 0
): Promise<{ data: PmAiSynthBatch[]; total: number }> {
  const res = await apiGet({
    path: `/pm/ai-synth/batches/cross-project?limit=${limit}&offset=${offset}`,
  });
  assertPmEnvelope<{ data: PmAiSynthBatch[]; total: number }>(res);
  return res;
}

export async function setBatchTaskTargetProject(
  batchId: string,
  taskId: string,
  targetProjectId: string
): Promise<PmAiSynthBatchTask> {
  const res = await apiPut({
    path: `/pm/ai-synth/batches/${batchId}/tasks/${taskId}/target-project`,
    passedData: { target_project_id: targetProjectId },
  });
  return unwrapPmEnvelope(res);
}

export async function fetchBatches(
  projectId: string,
  limit = 20,
  offset = 0
): Promise<{ data: PmAiSynthBatch[]; total: number }> {
  const res = await apiGet({ path: `/pm/ai-synth/batches?project_id=${projectId}&limit=${limit}&offset=${offset}` });
  assertPmEnvelope<{ data: PmAiSynthBatch[]; total: number }>(res);
  return res;
}

export async function fetchBatch(batchId: string): Promise<PmAiSynthBatch> {
  const res = await apiGet({ path: `/pm/ai-synth/batches/${batchId}` });
  return unwrapPmEnvelope(res);
}

export async function approveBatchTask(batchId: string, taskId: string): Promise<unknown> {
  const res = await apiPut({ path: `/pm/ai-synth/batches/${batchId}/tasks/${taskId}/approve`, passedData: {} });
  return unwrapPmEnvelope(res);
}

export async function rejectBatchTask(batchId: string, taskId: string): Promise<unknown> {
  const res = await apiPut({ path: `/pm/ai-synth/batches/${batchId}/tasks/${taskId}/reject`, passedData: {} });
  return unwrapPmEnvelope(res);
}

export async function deleteBatch(batchId: string): Promise<void> {
  await apiDelete({ path: `/pm/ai-synth/batches/${batchId}` });
}

// --- Task Attachments ---

export async function listAttachments(
  taskId: string
): Promise<PmTaskAttachment[]> {
  const res = await apiGet({ path: `/pm/tasks/${taskId}/attachments` });
  const data = unwrapPmEnvelope<{ attachments: PmTaskAttachment[] }>(res);
  return data?.attachments ?? [];
}

/**
 * Upload a single file to a task.
 *
 * Uses the shared API client progress helper so callers can observe upload
 * progress via `onProgress(0..1)` for large files.
 */
export async function uploadAttachment(
  taskId: string,
  file: File,
  onProgress?: (pct: number) => void
): Promise<PmTaskAttachment> {
  const formData = new FormData();
  formData.append("file", file);

  const res = await apiPostWithProgress({
    path: `/pm/tasks/${taskId}/attachments`,
    passedData: formData,
    onUploadProgress: (evt) => {
      if (!onProgress) return;
      const total = evt.total ?? file.size;
      if (!total) return;
      const pct = Math.min(1, (evt.loaded || 0) / total);
      onProgress(pct);
    },
  });
  return unwrapPmEnvelope(res);
}

export async function uploadCommentImage(
  taskId: string,
  commentId: string,
  file: File,
  onProgress?: (pct: number) => void
): Promise<PmTaskAttachment> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("comment_id", commentId);

  const res = await apiPostWithProgress({
    path: `/pm/tasks/${taskId}/attachments`,
    passedData: formData,
    onUploadProgress: (event) => {
      if (!onProgress) return;
      const total = event.total ?? file.size;
      if (!total) return;
      onProgress(Math.min(1, (event.loaded || 0) / total));
    },
  });
  return unwrapPmEnvelope(res);
}

export async function getAttachmentDownloadUrl(
  taskId: string,
  attachmentId: string,
  opts?: { forceDownload?: boolean }
): Promise<{ url: string; expires_at: string }> {
  const qs = opts?.forceDownload ? "?download=1" : "";
  const res = await apiGet({
    path: `/pm/tasks/${taskId}/attachments/${attachmentId}/url${qs}`,
  });
  return unwrapPmEnvelope(res);
}

export async function getAttachmentTextContent(
  taskId: string,
  attachmentId: string
): Promise<{ text: string; truncated: boolean; total_bytes: number }> {
  const res = await apiGet({
    path: `/pm/tasks/${taskId}/attachments/${attachmentId}/text`,
  });
  return unwrapPmEnvelope(res);
}

export async function deleteAttachment(
  taskId: string,
  attachmentId: string
): Promise<void> {
  await apiDelete({
    path: `/pm/tasks/${taskId}/attachments/${attachmentId}`,
  });
}

// --- Task Comments ---

export async function listComments(taskId: string): Promise<PmTaskComment[]> {
  const res = await apiGet({ path: `/pm/tasks/${taskId}/comments` });
  const data = unwrapPmEnvelope<{ comments: PmTaskComment[] }>(res);
  return data?.comments ?? [];
}

export async function createComment(
  taskId: string,
  body: string,
  mentions: number[]
): Promise<PmTaskComment> {
  const res = await apiPost({
    path: `/pm/tasks/${taskId}/comments`,
    passedData: { body, mentions },
  });
  return unwrapPmEnvelope(res);
}

export async function updateComment(
  taskId: string,
  commentId: string,
  body: string,
  mentions: number[]
): Promise<PmTaskComment> {
  const res = await apiPut({
    path: `/pm/tasks/${taskId}/comments/${commentId}`,
    passedData: { body, mentions },
  });
  return unwrapPmEnvelope(res);
}

export async function deleteComment(
  taskId: string,
  commentId: string
): Promise<void> {
  await apiDelete({
    path: `/pm/tasks/${taskId}/comments/${commentId}`,
  });
}
