// ─── Types ───────────────────────────────────────────────────────

export interface Mind {
  id: string;
  name: string;
  slug: string;
  personality_prompt: string;
  published_version_id: string | null;
  available_work_types: string[];
  available_publish_targets: string[];
  rejection_categories: string[];
  portal_key_hash: string | null;
  created_at: string;
  updated_at: string;
}

export interface MindWithVersion extends Mind {
  published_version?: MindVersion;
}

export interface MindVersion {
  id: string;
  mind_id: string;
  version_number: number;
  brain_markdown: string;
  created_by_admin_id: string | null;
  created_at: string;
}

export interface MindSource {
  id: string;
  mind_id: string;
  name: string | null;
  url: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface DiscoveryBatch {
  id: string;
  mind_id: string;
  status: "open" | "closed";
  opened_at: string;
  closed_at: string | null;
}

export interface DiscoveredPost {
  id: string;
  mind_id: string;
  source_id: string;
  batch_id: string;
  url: string;
  title: string | null;
  published_at: string | null;
  status: "pending" | "approved" | "ignored" | "processed";
  discovered_at: string;
  processed_at: string | null;
  last_error: string | null;
  sync_run_id: string | null;
}

export interface SyncRun {
  id: string;
  mind_id: string;
  batch_id: string | null;
  type: "scrape_compare" | "compile_publish";
  status: "queued" | "running" | "failed" | "completed";
  created_by_admin_id: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  error_message: string | null;
}

export interface SyncStep {
  id: string;
  sync_run_id: string;
  step_order: number;
  step_name: string;
  status: "pending" | "running" | "completed" | "failed";
  log_output: string;
  started_at: string | null;
  finished_at: string | null;
  error_message: string | null;
}

export interface SyncProposal {
  id: string;
  sync_run_id: string;
  mind_id: string;
  type: "NEW" | "UPDATE" | "CONFLICT";
  summary: string;
  target_excerpt: string | null;
  proposed_text: string;
  reason: string;
  status: "pending" | "approved" | "rejected" | "finalized";
  created_at: string;
  updated_at: string;
}

export interface MindMessage {
  id: string;
  conversation_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  created_at: string;
}

export interface MindConversation {
  id: string;
  mind_id: string;
  title: string | null;
  message_count: number;
  created_by_admin_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface CompactionMessage {
  type: "compaction";
  summary: string;
  message_count: number;
  compacted_at: string;
}

export interface MindStatus {
  canStartScrape: boolean;
  canCompile: boolean;
  scrapeBlockingReasons: string[];
  compileBlockingReasons: string[];
  openBatchId: string | null;
  activeSyncRunId: string | null;
  activeSyncRunType: "scrape_compare" | "compile_publish" | null;
  latestScrapeRunId: string | null;
}

export interface SyncRunDetails {
  run: SyncRun;
  steps: SyncStep[];
  proposalCounts: Record<string, number>;
}

export type SkillStatus = "draft" | "ready" | "active" | "paused" | "generating" | "failed";
export type TriggerType = "manual" | "daily" | "weekly" | "day_of_week";
export type PipelineMode = "review_and_stop" | "review_then_publish" | "auto_pipeline";
export type WorkCreationType = "text" | "markdown" | "image" | "video" | "pdf" | "docx" | "audio";
export interface PublishChannel {
  id: string;
  name: string;
  webhook_url: string;
  description: string | null;
  status: "active" | "disabled";
  created_at: string;
  updated_at: string;
}

export type WorkRunStatus =
  | "pending"
  | "running"
  | "consulting"
  | "creating"
  | "awaiting_review"
  | "approved"
  | "rejected"
  | "publishing"
  | "published"
  | "failed";

export interface MindSkill {
  id: string;
  mind_id: string;
  name: string;
  slug: string;
  definition: string;
  output_schema: object | null;
  status: SkillStatus;
  work_creation_type: WorkCreationType | null;
  artifact_attachment_type: WorkCreationType | null;
  output_count: number;
  trigger_type: TriggerType;
  trigger_config: { day?: string; time?: string; timezone?: string };
  pipeline_mode: PipelineMode;
  publish_channel_id: string | null;
  portal_key_hash: string | null;
  has_neuron: boolean;
  is_neuron_stale: boolean;
  last_run_at: string | null;
  next_run_at: string | null;
  org_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface SkillWorkRun {
  id: string;
  skill_id: string;
  triggered_by: string;
  triggered_at: string;
  status: WorkRunStatus;
  artifact_type: string | null;
  artifact_url: string | null;
  artifact_content: string | null;
  artifact_attachment_type: string | null;
  artifact_attachment_url: string | null;
  title: string | null;
  description: string | null;
  approved_by_admin_id: string | null;
  approved_at: string | null;
  rejection_category: string | null;
  rejection_reason: string | null;
  rejected_by_admin_id: string | null;
  rejected_at: string | null;
  published_at: string | null;
  publication_url: string | null;
  n8n_run_id: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}

export interface MindSkillNeuron {
  id: string;
  skill_id: string;
  mind_version_id: string;
  neuron_markdown: string;
  generated_at: string;
}

export interface SkillAnalytics {
  totalCalls: number;
  callsToday: number;
  dailyCounts: { date: string; count: number }[];
}

export interface SkillBuilderMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ResolvedFields {
  name?: string;
  definition?: string;
  work_creation_type?: string;
  artifact_attachment_type?: string;
  work_publish_to?: string;
  trigger_type?: string;
  trigger_config?: { day?: string; time?: string; timezone?: string };
  pipeline_mode?: string;
  output_count?: number;
}

export interface SkillBuilderResponse {
  reply: string;
  resolvedFields: ResolvedFields;
  isComplete: boolean;
  messages: SkillBuilderMessage[];
}

export interface PlatformCredential {
  id: string;
  mind_id: string;
  platform: string;
  credential_type: string;
  label: string | null;
  status: string;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ParentingSession {
  id: string;
  mind_id: string;
  status: "chatting" | "reading" | "proposals" | "compiling" | "completed" | "abandoned";
  result: "learned" | "no_changes" | "all_rejected" | null;
  title: string | null;
  knowledge_buffer: string;
  sync_run_id: string | null;
  admin_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ParentingMessage {
  id: string;
  session_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  created_at: string;
}

export interface ParentingSessionDetails {
  session: ParentingSession;
  messages: ParentingMessage[];
  syncRun: SyncRun | null;
  syncSteps: SyncStep[] | null;
  proposals: SyncProposal[] | null;
}

export interface SkillUpgradeSession {
  id: string;
  skill_id: string;
  mind_id: string;
  status: "chatting" | "reading" | "proposals" | "compiling" | "completed" | "abandoned";
  result: "learned" | "no_changes" | "all_rejected" | null;
  title: string | null;
  knowledge_buffer: string;
  sync_run_id: string | null;
  created_by_admin_id: string | null;
  created_at: string;
  updated_at: string;
  finished_at: string | null;
}

export interface SkillUpgradeMessage {
  id: string;
  session_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  created_at: string;
}

export interface SkillUpgradeSessionDetails {
  session: SkillUpgradeSession;
  messages: SkillUpgradeMessage[];
  proposals: SyncProposal[] | null;
}
