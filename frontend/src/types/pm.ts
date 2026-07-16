export interface PmProject {
  id: string;
  name: string;
  description: string | null;
  color: string;
  icon: string;
  deadline: string | null;
  status: "active" | "archived" | "completed";
  created_by: number;
  created_at: string;
  updated_at: string;
  // Computed fields from list endpoint
  total_tasks?: number;
  completed_tasks?: number;
  effective_deadline?: string | null;
  latest_task_deadline?: string | null;
  tasks_by_status?: {
    backlog: number;
    todo: number;
    in_progress: number;
    done: number;
  };
  daily_activity?: Array<{ date: string; count: number }>;
}

export interface PmColumn {
  id: string;
  project_id: string;
  name: string;
  position: number;
  is_hidden: boolean;
  is_backlog: boolean;
  tasks: PmTask[];
}

export interface PmTask {
  id: string;
  project_id: string;
  column_id: string;
  title: string;
  description: string | null;
  priority: "P1" | "P2" | "P3" | "P4" | "P5" | null;
  deadline: string | null;
  position: number;
  assigned_to: number | null;
  created_by: number;
  completed_at: string | null;
  source: "manual" | "ai_synth";
  created_at: string;
  updated_at: string;
  // Enriched fields from getProject
  creator_name?: string | null;
  assignee_name?: string | null;
}

export type PmUser = {
  id: number;
  display_name: string;
  email: string;
};

export type PmProjectColumnSummary = {
  id: string;
  project_id: string;
  name: string;
  position: number;
  is_backlog: boolean;
  task_count: number;
};

export type PmProjectColumnIds = {
  backlog_id: string;
  todo_id: string;
  in_progress_id: string;
  done_id: string;
  columns: PmProjectColumnSummary[];
};

export interface PmProjectDetail extends PmProject {
  columns: PmColumn[];
}

export interface PmActivityEntry {
  id: string;
  project_id: string;
  task_id: string | null;
  user_id: number;
  action: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
  user?: { id: number; display_name: string; email: string };
  project?: { id: string; name: string; color: string };
  task?: { id: string; title: string };
}

export interface PmStats {
  focus_today: { count: number; subtitle: string; severity: "green" | "amber" | "red" };
  this_week: { count: number; subtitle: string };
  backlog: { count: number; subtitle: string; severity: "normal" | "amber" };
}

export interface PmVelocityData {
  completed_total: number;
  overdue_total: number;
  data: Array<{ label: string; period_start: string; completed: number; overdue: number }>;
}

export interface ChartDataResponse {
  daily_completions: Array<{ date: string; count: number }>;
}

export interface CreateProjectInput {
  name: string;
  description?: string;
  color?: string;
  icon?: string;
  deadline?: string;
}

export interface CreateTaskInput {
  title: string;
  description?: string;
  priority?: "P1" | "P2" | "P3" | "P4" | "P5";
  deadline?: string;
  column_id: string;
  assigned_to?: number;
  source?: "manual" | "ai_synth";
}

export interface PmAiSynthBatch {
  id: string;
  // null for cross-project batches (tasks are assigned a target project individually)
  project_id: string | null;
  source_text: string;
  source_filename: string | null;
  status: "synthesizing" | "pending_review" | "completed" | "failed";
  total_proposed: number;
  total_approved: number;
  total_rejected: number;
  created_by: number;
  created_at: string;
  tasks?: PmAiSynthBatchTask[];
}

export interface PmAiSynthBatchTask {
  id: string;
  batch_id: string;
  title: string;
  description: string | null;
  priority: "P1" | "P2" | "P3" | "P4" | "P5";
  deadline_hint: string | null;
  status: "pending" | "approved" | "rejected";
  created_task_id: string | null;
  // Only meaningful on cross-project batches; null = unassigned / pending user action
  target_project_id: string | null;
  created_at: string;
}

export interface PmMyStats {
  focus_today: { count: number; subtitle: string; severity: "green" | "amber" | "red" };
  this_week: { count: number; subtitle: string };
}

export interface PmMyTask extends PmTask {
  project_name: string;
  project_color?: string;
  project_icon?: string;
  column_name?: string;
  column_is_backlog?: boolean;
  project_column_ids: PmProjectColumnIds;
}

export interface PmMyTasksResponse {
  todo: PmMyTask[];
  in_progress: PmMyTask[];
  done: PmMyTask[];
}

export interface PmBacklogProjectGroup {
  project_id: string;
  project_name: string;
  project_color: string;
  project_icon: string;
  column_ids: PmProjectColumnIds;
  tasks: PmMyTask[];
}

export interface PmTaskAttachment {
  id: string;
  task_id: string;
  comment_id?: string | null;
  uploaded_by: number;
  uploaded_by_name: string;
  filename: string;
  s3_key: string;
  mime_type: string;
  size_bytes: number;
  is_previewable: boolean;
  created_at: string;
  /** Server-verified: true if the caller may delete this attachment. */
  can_delete?: boolean;
}

export interface PmNotification {
  id: string;
  user_id: number;
  type:
    | "task_assigned"
    | "task_unassigned"
    | "assignee_completed_task"
    | "mention_in_comment"
    | "task_commented";
  task_id: string | null;
  actor_user_id: number;
  metadata: {
    task_title?: string;
    project_name?: string;
    actor_name?: string;
    comment_preview?: string;
  } | null;
  is_read: boolean;
  created_at: string;
}

/**
 * Flat markdown comment on a PM task.
 *
 * - `body` is raw markdown. Rendered client-side with react-markdown in a
 *   strict no-HTML configuration (see CommentsSection.tsx).
 * - `mentions` is the authoritative list of mentioned user ids — it is
 *   stored server-side as a native PG INTEGER[] column and is NEVER
 *   re-parsed from the body. `mention_names` is a server-resolved display
 *   map used to highlight @Name tokens in the rendered markdown.
 * - `edited_at` is null for unmodified comments. The UI renders an
 *   "(edited)" label when this is non-null.
 */
export interface PmTaskComment {
  id: string;
  task_id: string;
  author_id: number;
  author_name: string;
  body: string;
  mentions: number[];
  mention_names: Record<number, string>;
  attachments?: PmTaskAttachment[];
  edited_at: string | null;
  created_at: string;
  /** Server-verified: true if the caller authored this comment. */
  is_mine?: boolean;
}
