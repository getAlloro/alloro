import { apiGet, apiPost, apiPut, apiPatch, apiDelete } from "./index";

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

// ─── Mind CRUD ───────────────────────────────────────────────────

export async function listMinds(): Promise<Mind[]> {
  const res = await apiGet({ path: "/admin/minds" });
  return res.success ? res.data : [];
}

export async function getMind(mindId: string): Promise<MindWithVersion | null> {
  const res = await apiGet({ path: `/admin/minds/${mindId}` });
  return res.success ? res.data : null;
}

export async function createMind(name: string, personalityPrompt: string): Promise<Mind | null> {
  const res = await apiPost({
    path: "/admin/minds",
    passedData: { name, personality_prompt: personalityPrompt },
  });
  return res.success ? res.data : null;
}

export async function updateMind(
  mindId: string,
  updates: {
    name?: string;
    personality_prompt?: string;
    available_work_types?: string[];
    available_publish_targets?: string[];
    rejection_categories?: string[];
  }
): Promise<Mind | null> {
  const res = await apiPut({
    path: `/admin/minds/${mindId}`,
    passedData: updates,
  });
  return res.success ? res.data : null;
}

export async function updateBrain(
  mindId: string,
  brainMarkdown: string
): Promise<{ version: MindVersion; warning?: string } | null> {
  const res = await apiPut({
    path: `/admin/minds/${mindId}/brain`,
    passedData: { brain_markdown: brainMarkdown },
  });
  return res.success ? res.data : null;
}

export async function listVersions(mindId: string): Promise<MindVersion[]> {
  const res = await apiGet({ path: `/admin/minds/${mindId}/versions` });
  return res.success ? res.data : [];
}

export async function publishVersion(mindId: string, versionId: string): Promise<boolean> {
  const res = await apiPost({
    path: `/admin/minds/${mindId}/versions/${versionId}/publish`,
  });
  return !!res.success;
}

export async function deleteMind(mindId: string): Promise<boolean> {
  const res = await apiDelete({ path: `/admin/minds/${mindId}` });
  return !!res.success;
}

// ─── Chat ────────────────────────────────────────────────────────

export async function sendChatMessage(
  mindId: string,
  message: string,
  conversationId?: string
): Promise<{ conversationId: string; reply: string } | null> {
  const res = await apiPost({
    path: `/admin/minds/${mindId}/chat`,
    passedData: { message, conversationId },
  });
  return res.success ? res.data : null;
}

export async function sendChatMessageStream(
  mindId: string,
  message: string,
  conversationId?: string
): Promise<Response> {
  const api = import.meta.env.VITE_API_URL ?? "/api";

  // Replicate auth header logic from getCommonHeaders
  const isPilot =
    typeof window !== "undefined" &&
    (window.sessionStorage?.getItem("pilot_mode") === "true" ||
      !!window.sessionStorage?.getItem("token"));

  let jwt: string | null = null;
  if (isPilot) {
    jwt = window.sessionStorage.getItem("token");
  } else {
    jwt = localStorage.getItem("auth_token") || localStorage.getItem("token");
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (jwt) headers.Authorization = `Bearer ${jwt}`;

  return fetch(`${api}/admin/minds/${mindId}/chat/stream`, {
    method: "POST",
    headers,
    body: JSON.stringify({ message, conversationId }),
  });
}

export async function getConversation(
  mindId: string,
  conversationId: string
): Promise<MindMessage[]> {
  const res = await apiGet({
    path: `/admin/minds/${mindId}/conversations/${conversationId}`,
  });
  return res.success ? res.data : [];
}

export async function listConversations(mindId: string): Promise<MindConversation[]> {
  const res = await apiGet({ path: `/admin/minds/${mindId}/conversations` });
  return res.success ? res.data : [];
}

export async function renameConversation(mindId: string, conversationId: string, title: string): Promise<boolean> {
  const res = await apiPatch({
    path: `/admin/minds/${mindId}/conversations/${conversationId}`,
    passedData: { title },
  });
  return !!res.success;
}

export async function deleteConversation(mindId: string, conversationId: string): Promise<boolean> {
  const res = await apiDelete({
    path: `/admin/minds/${mindId}/conversations/${conversationId}`,
  });
  return !!res.success;
}

// ─── Sources ─────────────────────────────────────────────────────

export async function listSources(mindId: string): Promise<MindSource[]> {
  const res = await apiGet({ path: `/admin/minds/${mindId}/sources` });
  return res.success ? res.data : [];
}

export async function createSource(
  mindId: string,
  url: string,
  name?: string
): Promise<MindSource | null> {
  const res = await apiPost({
    path: `/admin/minds/${mindId}/sources`,
    passedData: { url, name },
  });
  return res.success ? res.data : null;
}

export async function deleteSource(mindId: string, sourceId: string): Promise<boolean> {
  const res = await apiDelete({
    path: `/admin/minds/${mindId}/sources/${sourceId}`,
  });
  return !!res.success;
}

export async function toggleSource(
  mindId: string,
  sourceId: string,
  isActive: boolean
): Promise<boolean> {
  const res = await apiPatch({
    path: `/admin/minds/${mindId}/sources/${sourceId}`,
    passedData: { is_active: isActive },
  });
  return !!res.success;
}

// ─── Discovery ───────────────────────────────────────────────────

export async function getDiscoveryBatch(
  mindId: string
): Promise<{ batch: DiscoveryBatch | null; posts: DiscoveredPost[] }> {
  const res = await apiGet({ path: `/admin/minds/${mindId}/discovery-batch` });
  return res.success ? res.data : { batch: null, posts: [] };
}

export async function updatePostStatus(
  mindId: string,
  postId: string,
  status: "pending" | "approved" | "ignored"
): Promise<boolean> {
  const res = await apiPatch({
    path: `/admin/minds/${mindId}/discovered-posts/${postId}`,
    passedData: { status },
  });
  return !!res.success;
}

export async function triggerDiscovery(mindId: string): Promise<boolean> {
  const res = await apiPost({
    path: `/admin/minds/${mindId}/discovery/run`,
  });
  return !!res.success;
}

export async function deleteDiscoveryBatch(
  mindId: string,
  batchId: string
): Promise<boolean> {
  const res = await apiDelete({
    path: `/admin/minds/${mindId}/discovery-batch/${batchId}`,
  });
  return !!res.success;
}

// ─── Sync Runs ───────────────────────────────────────────────────

export async function startScrapeCompare(mindId: string): Promise<string | null> {
  const res = await apiPost({
    path: `/admin/minds/${mindId}/sync-runs/scrape-compare`,
  });
  return res.success ? res.data.runId : null;
}

export async function startCompilePublish(mindId: string): Promise<string | null> {
  const res = await apiPost({
    path: `/admin/minds/${mindId}/sync-runs/compile`,
  });
  return res.success ? res.data.runId : null;
}

export async function listSyncRuns(mindId: string): Promise<SyncRun[]> {
  const res = await apiGet({ path: `/admin/minds/${mindId}/sync-runs` });
  return res.success ? res.data : [];
}

export async function getSyncRun(mindId: string, runId: string): Promise<SyncRunDetails | null> {
  const res = await apiGet({
    path: `/admin/minds/${mindId}/sync-runs/${runId}`,
  });
  return res.success ? res.data : null;
}

export async function getRunProposals(mindId: string, runId: string): Promise<SyncProposal[]> {
  const res = await apiGet({
    path: `/admin/minds/${mindId}/sync-runs/${runId}/proposals`,
  });
  return res.success ? res.data : [];
}

// ─── Proposals ───────────────────────────────────────────────────

export async function updateProposalStatus(
  mindId: string,
  proposalId: string,
  status: "approved" | "rejected" | "pending"
): Promise<boolean> {
  const res = await apiPatch({
    path: `/admin/minds/${mindId}/proposals/${proposalId}`,
    passedData: { status },
  });
  return !!res.success;
}

// ─── Status ──────────────────────────────────────────────────────

export async function listSyncRunsByBatch(
  mindId: string,
  batchId: string
): Promise<SyncRun[]> {
  const res = await apiGet({
    path: `/admin/minds/${mindId}/batches/${batchId}/sync-runs`,
  });
  return res.success ? res.data : [];
}

export async function getMindStatus(mindId: string): Promise<MindStatus> {
  const res = await apiGet({ path: `/admin/minds/${mindId}/status` });
  return res.success
    ? res.data
    : {
        canStartScrape: false,
        canCompile: false,
        scrapeBlockingReasons: [],
        compileBlockingReasons: [],
        openBatchId: null,
        activeSyncRunId: null,
        activeSyncRunType: null,
        latestScrapeRunId: null,
      };
}

// ─── Skills ─────────────────────────────────────────────────────

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

export async function listSkills(mindId: string): Promise<MindSkill[]> {
  const res = await apiGet({ path: `/admin/minds/${mindId}/skills` });
  return res.success ? res.data : [];
}

export async function getSkill(
  mindId: string,
  skillId: string,
): Promise<MindSkill | null> {
  const res = await apiGet({
    path: `/admin/minds/${mindId}/skills/${skillId}`,
  });
  return res.success ? res.data : null;
}

export async function createSkill(
  mindId: string,
  name: string,
  definition: string,
  outputSchema: object | null,
): Promise<MindSkill | null> {
  const res = await apiPost({
    path: `/admin/minds/${mindId}/skills`,
    passedData: { name, definition, outputSchema },
  });
  return res.success ? res.data : null;
}

export async function updateSkill(
  mindId: string,
  skillId: string,
  fields: {
    name?: string;
    definition?: string;
    outputSchema?: object | null;
    work_creation_type?: WorkCreationType | null;
    artifact_attachment_type?: WorkCreationType | null;
    output_count?: number;
    trigger_type?: TriggerType;
    trigger_config?: { day?: string; time?: string; timezone?: string };
    pipeline_mode?: PipelineMode;
    publish_channel_id?: string | null;
    status?: SkillStatus;
  },
): Promise<MindSkill | null> {
  const res = await apiPut({
    path: `/admin/minds/${mindId}/skills/${skillId}`,
    passedData: fields,
  });
  return res.success ? res.data : null;
}

export async function deleteSkill(
  mindId: string,
  skillId: string,
): Promise<boolean> {
  const res = await apiDelete({
    path: `/admin/minds/${mindId}/skills/${skillId}`,
  });
  return !!res.success;
}

export async function generateSkillNeuron(
  mindId: string,
  skillId: string,
): Promise<MindSkillNeuron | null> {
  const res = await apiPost({
    path: `/admin/minds/${mindId}/skills/${skillId}/generate`,
  });
  return res.success ? res.data : null;
}

export async function getSkillNeuron(
  mindId: string,
  skillId: string,
): Promise<MindSkillNeuron | null> {
  const res = await apiGet({
    path: `/admin/minds/${mindId}/skills/${skillId}/neuron`,
  });
  return res.success ? res.data : null;
}

export async function getSkillAnalytics(
  mindId: string,
  skillId: string,
): Promise<SkillAnalytics> {
  const res = await apiGet({
    path: `/admin/minds/${mindId}/skills/${skillId}/analytics`,
  });
  return res.success
    ? res.data
    : { totalCalls: 0, callsToday: 0, dailyCounts: [] };
}

export async function regenerateStaleNeurons(
  mindId: string,
): Promise<{ regeneratedCount: number; failedCount: number; errors: string[] }> {
  const res = await apiPost({
    path: `/admin/minds/${mindId}/skills/regenerate-stale`,
  });
  return res.success
    ? res.data
    : { regeneratedCount: 0, failedCount: 0, errors: [] };
}

export async function suggestSkillDefinition(
  mindId: string,
  hint: string,
): Promise<{ definition: string; outputSchema: object | null } | null> {
  const res = await apiPost({
    path: `/admin/minds/${mindId}/skills/suggest`,
    passedData: { hint },
  });
  return res.success ? res.data : null;
}

// ─── Skill Builder ──────────────────────────────────────────────

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

export async function skillBuilderChat(
  mindId: string,
  message: string,
  messages: SkillBuilderMessage[],
  resolvedFields: ResolvedFields,
): Promise<SkillBuilderResponse | null> {
  const res = await apiPost({
    path: `/admin/minds/${mindId}/skill-builder/chat`,
    passedData: { message, messages, resolvedFields },
  });
  return res.success ? res.data : null;
}

export async function sendSkillBuilderChatStream(
  mindId: string,
  message: string,
  messages: SkillBuilderMessage[],
  resolvedFields: ResolvedFields,
): Promise<Response> {
  const api = import.meta.env.VITE_API_URL ?? "/api";

  const isPilot =
    typeof window !== "undefined" &&
    (window.sessionStorage?.getItem("pilot_mode") === "true" ||
      !!window.sessionStorage?.getItem("token"));

  let jwt: string | null = null;
  if (isPilot) {
    jwt = window.sessionStorage.getItem("token");
  } else {
    jwt = localStorage.getItem("auth_token") || localStorage.getItem("token");
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (jwt) headers.Authorization = `Bearer ${jwt}`;

  return fetch(`${api}/admin/minds/${mindId}/skill-builder/chat/stream`, {
    method: "POST",
    headers,
    body: JSON.stringify({ message, messages, resolvedFields }),
  });
}

// ─── Work Runs ──────────────────────────────────────────────────

export async function triggerManualRun(
  mindId: string,
  skillId: string,
): Promise<SkillWorkRun | null> {
  const res = await apiPost({
    path: `/admin/minds/${mindId}/skills/${skillId}/run`,
  });
  return res?.id ? res : null;
}

export async function listWorkRuns(
  mindId: string,
  skillId: string,
  limit = 50,
  offset = 0,
): Promise<SkillWorkRun[]> {
  const res = await apiGet({
    path: `/admin/minds/${mindId}/skills/${skillId}/work-runs?limit=${limit}&offset=${offset}`,
  });
  return Array.isArray(res) ? res : [];
}

export async function getWorkRun(
  mindId: string,
  skillId: string,
  workRunId: string,
): Promise<SkillWorkRun | null> {
  const res = await apiGet({
    path: `/admin/minds/${mindId}/skills/${skillId}/work-runs/${workRunId}`,
  });
  return res?.id ? res : null;
}

export async function approveWorkRun(
  mindId: string,
  skillId: string,
  workRunId: string,
): Promise<boolean> {
  const res = await apiPost({
    path: `/admin/minds/${mindId}/skills/${skillId}/work-runs/${workRunId}/approve`,
  });
  return !!res.success;
}

export async function rejectWorkRun(
  mindId: string,
  skillId: string,
  workRunId: string,
  rejectionCategory?: string,
  rejectionReason?: string,
): Promise<boolean> {
  const res = await apiPost({
    path: `/admin/minds/${mindId}/skills/${skillId}/work-runs/${workRunId}/reject`,
    passedData: {
      rejection_category: rejectionCategory,
      rejection_reason: rejectionReason,
    },
  });
  return !!res.success;
}

export async function deleteWorkRun(
  mindId: string,
  skillId: string,
  workRunId: string,
): Promise<boolean> {
  const res = await apiDelete({
    path: `/admin/minds/${mindId}/skills/${skillId}/work-runs/${workRunId}`,
  });
  return !!res.success;
}

// ─── Publish Channels ────────────────────────────────────────────

export async function listPublishChannels(): Promise<PublishChannel[]> {
  const res = await apiGet({
    path: `/admin/minds/publish-channels`,
  });
  return Array.isArray(res) ? res : [];
}

export async function createPublishChannel(
  data: { name: string; webhook_url: string; description?: string },
): Promise<PublishChannel | null> {
  const res = await apiPost({
    path: `/admin/minds/publish-channels`,
    passedData: data,
  });
  return res?.id ? res : null;
}

export async function updatePublishChannel(
  channelId: string,
  data: { name?: string; webhook_url?: string; description?: string; status?: string },
): Promise<PublishChannel | null> {
  const res = await apiPut({
    path: `/admin/minds/publish-channels/${channelId}`,
    passedData: data,
  });
  return res?.id ? res : null;
}

export async function deletePublishChannel(
  channelId: string,
): Promise<boolean> {
  const res = await apiDelete({
    path: `/admin/minds/publish-channels/${channelId}`,
  });
  return !!res.success;
}

// ─── Portal Keys ─────────────────────────────────────────────────

export async function generateMindPortalKey(
  mindId: string,
): Promise<string | null> {
  const res = await apiPost({
    path: `/admin/minds/${mindId}/portal-key`,
  });
  return res.success ? res.data.portal_key : null;
}

export async function generateSkillPortalKey(
  mindId: string,
  skillId: string,
): Promise<string | null> {
  const res = await apiPost({
    path: `/admin/minds/${mindId}/skills/${skillId}/portal-key`,
  });
  return res.success ? res.data.portal_key : null;
}

// ─── Test Portals ────────────────────────────────────────────────

export async function testMindPortal(
  mindId: string,
  query: string,
): Promise<{ response: string; tokens_used: number } | null> {
  const res = await apiPost({
    path: `/admin/minds/${mindId}/test-portal`,
    passedData: { query },
  });
  return res.success ? res.data : null;
}

export async function testSkillPortal(
  mindId: string,
  skillId: string,
  query: string,
): Promise<{ response: string; context: { approved_count: number; rejected_count: number } } | null> {
  const res = await apiPost({
    path: `/admin/minds/${mindId}/skills/${skillId}/test-portal`,
    passedData: { query },
  });
  return res.success ? res.data : null;
}

// ─── Platform Credentials ────────────────────────────────────────

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

export async function listCredentials(
  mindId: string,
): Promise<PlatformCredential[]> {
  const res = await apiGet({ path: `/admin/minds/${mindId}/credentials` });
  return res.success ? res.data : [];
}

export async function createCredential(
  mindId: string,
  platform: string,
  credentials: string,
  label?: string,
): Promise<PlatformCredential | null> {
  const res = await apiPost({
    path: `/admin/minds/${mindId}/credentials`,
    passedData: { platform, credentials, label },
  });
  return res.success ? res.data : null;
}

export async function updateCredential(
  mindId: string,
  credentialId: string,
  updates: { label?: string; status?: string },
): Promise<boolean> {
  const res = await apiPut({
    path: `/admin/minds/${mindId}/credentials/${credentialId}`,
    passedData: updates,
  });
  return !!res.success;
}

export async function deleteCredential(
  mindId: string,
  credentialId: string,
): Promise<boolean> {
  const res = await apiDelete({
    path: `/admin/minds/${mindId}/credentials/${credentialId}`,
  });
  return !!res.success;
}

export async function revokeCredential(
  mindId: string,
  credentialId: string,
): Promise<boolean> {
  const res = await apiPost({
    path: `/admin/minds/${mindId}/credentials/${credentialId}/revoke`,
  });
  return !!res.success;
}

// ─── Parenting ──────────────────────────────────────────────────

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

export async function createParentingSession(
  mindId: string
): Promise<{ session: ParentingSession; greeting: string } | null> {
  const res = await apiPost({
    path: `/admin/minds/${mindId}/parenting/sessions`,
  });
  return res.success ? res.data : null;
}

export async function listParentingSessions(
  mindId: string
): Promise<ParentingSession[]> {
  const res = await apiGet({
    path: `/admin/minds/${mindId}/parenting/sessions`,
  });
  return res.success ? res.data : [];
}

export async function getParentingSession(
  mindId: string,
  sessionId: string
): Promise<ParentingSessionDetails | null> {
  const res = await apiGet({
    path: `/admin/minds/${mindId}/parenting/sessions/${sessionId}`,
  });
  return res.success ? res.data : null;
}

export async function sendParentingChatStream(
  mindId: string,
  sessionId: string,
  message: string
): Promise<Response> {
  const api = import.meta.env.VITE_API_URL ?? "/api";

  const isPilot =
    typeof window !== "undefined" &&
    (window.sessionStorage?.getItem("pilot_mode") === "true" ||
      !!window.sessionStorage?.getItem("token"));

  let jwt: string | null = null;
  if (isPilot) {
    jwt = window.sessionStorage.getItem("token");
  } else {
    jwt = localStorage.getItem("auth_token") || localStorage.getItem("token");
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (jwt) headers.Authorization = `Bearer ${jwt}`;

  return fetch(
    `${api}/admin/minds/${mindId}/parenting/sessions/${sessionId}/chat/stream`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({ message }),
    }
  );
}

export async function triggerParentingReadingStream(
  mindId: string,
  sessionId: string
): Promise<Response> {
  const api = import.meta.env.VITE_API_URL ?? "/api";

  const isPilot =
    typeof window !== "undefined" &&
    (window.sessionStorage?.getItem("pilot_mode") === "true" ||
      !!window.sessionStorage?.getItem("token"));

  let jwt: string | null = null;
  if (isPilot) {
    jwt = window.sessionStorage.getItem("token");
  } else {
    jwt = localStorage.getItem("auth_token") || localStorage.getItem("token");
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (jwt) headers.Authorization = `Bearer ${jwt}`;

  return fetch(
    `${api}/admin/minds/${mindId}/parenting/sessions/${sessionId}/trigger-reading/stream`,
    {
      method: "POST",
      headers,
    }
  );
}

export async function updateParentingSession(
  mindId: string,
  sessionId: string,
  data: { title: string }
): Promise<boolean> {
  const res = await apiPatch({
    path: `/admin/minds/${mindId}/parenting/sessions/${sessionId}`,
    passedData: data,
  });
  return !!res.success;
}

export async function getParentingProposals(
  mindId: string,
  sessionId: string
): Promise<SyncProposal[]> {
  const res = await apiGet({
    path: `/admin/minds/${mindId}/parenting/sessions/${sessionId}/proposals`,
  });
  return res.success ? res.data : [];
}

export async function updateParentingProposal(
  mindId: string,
  sessionId: string,
  proposalId: string,
  status: "approved" | "rejected" | "pending"
): Promise<boolean> {
  const res = await apiPatch({
    path: `/admin/minds/${mindId}/parenting/sessions/${sessionId}/proposals/${proposalId}`,
    passedData: { status },
  });
  return !!res.success;
}

export async function startParentingCompile(
  mindId: string,
  sessionId: string
): Promise<{ runId: string; autoCompleted?: boolean } | null> {
  const res = await apiPost({
    path: `/admin/minds/${mindId}/parenting/sessions/${sessionId}/compile`,
  });
  return res.success ? res.data : null;
}

export async function getParentingCompileStatus(
  mindId: string,
  sessionId: string
): Promise<any> {
  const res = await apiGet({
    path: `/admin/minds/${mindId}/parenting/sessions/${sessionId}/compile-status`,
  });
  return res.success ? res.data : null;
}

export async function deleteParentingSession(
  mindId: string,
  sessionId: string
): Promise<boolean> {
  const res = await apiDelete({
    path: `/admin/minds/${mindId}/parenting/sessions/${sessionId}`,
  });
  return !!res.success;
}

export async function abandonParentingSession(
  mindId: string,
  sessionId: string
): Promise<boolean> {
  const res = await apiPost({
    path: `/admin/minds/${mindId}/parenting/sessions/${sessionId}/abandon`,
  });
  return !!res.success;
}

// ─── Skill Upgrade Sessions ─────────────────────────────────────

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

export async function createSkillUpgradeSession(
  mindId: string,
  skillId: string
): Promise<{ session: SkillUpgradeSession; greeting: string } | null> {
  const res = await apiPost({
    path: `/admin/minds/${mindId}/skills/${skillId}/upgrade/sessions`,
  });
  return res.success ? res.data : null;
}

export async function listSkillUpgradeSessions(
  mindId: string,
  skillId: string
): Promise<SkillUpgradeSession[]> {
  const res = await apiGet({
    path: `/admin/minds/${mindId}/skills/${skillId}/upgrade/sessions`,
  });
  return res.success ? res.data : [];
}

export async function getSkillUpgradeSession(
  mindId: string,
  skillId: string,
  sessionId: string
): Promise<SkillUpgradeSessionDetails | null> {
  const res = await apiGet({
    path: `/admin/minds/${mindId}/skills/${skillId}/upgrade/sessions/${sessionId}`,
  });
  return res.success ? res.data : null;
}

export async function sendSkillUpgradeChatStream(
  mindId: string,
  skillId: string,
  sessionId: string,
  message: string
): Promise<Response> {
  const api = import.meta.env.VITE_API_URL ?? "/api";

  const isPilot =
    typeof window !== "undefined" &&
    (window.sessionStorage?.getItem("pilot_mode") === "true" ||
      !!window.sessionStorage?.getItem("token"));

  let jwt: string | null = null;
  if (isPilot) {
    jwt = window.sessionStorage.getItem("token");
  } else {
    jwt = localStorage.getItem("auth_token") || localStorage.getItem("token");
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (jwt) headers.Authorization = `Bearer ${jwt}`;

  return fetch(
    `${api}/admin/minds/${mindId}/skills/${skillId}/upgrade/sessions/${sessionId}/chat/stream`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({ message }),
    }
  );
}

export async function triggerSkillUpgradeReadingStream(
  mindId: string,
  skillId: string,
  sessionId: string
): Promise<Response> {
  const api = import.meta.env.VITE_API_URL ?? "/api";

  const isPilot =
    typeof window !== "undefined" &&
    (window.sessionStorage?.getItem("pilot_mode") === "true" ||
      !!window.sessionStorage?.getItem("token"));

  let jwt: string | null = null;
  if (isPilot) {
    jwt = window.sessionStorage.getItem("token");
  } else {
    jwt = localStorage.getItem("auth_token") || localStorage.getItem("token");
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (jwt) headers.Authorization = `Bearer ${jwt}`;

  return fetch(
    `${api}/admin/minds/${mindId}/skills/${skillId}/upgrade/sessions/${sessionId}/trigger-reading/stream`,
    {
      method: "POST",
      headers,
    }
  );
}

export async function getSkillUpgradeProposals(
  mindId: string,
  skillId: string,
  sessionId: string
): Promise<SyncProposal[]> {
  const res = await apiGet({
    path: `/admin/minds/${mindId}/skills/${skillId}/upgrade/sessions/${sessionId}/proposals`,
  });
  return res.success ? res.data : [];
}

export async function updateSkillUpgradeProposal(
  mindId: string,
  skillId: string,
  sessionId: string,
  proposalId: string,
  status: "approved" | "rejected" | "pending"
): Promise<boolean> {
  const res = await apiPatch({
    path: `/admin/minds/${mindId}/skills/${skillId}/upgrade/sessions/${sessionId}/proposals/${proposalId}`,
    passedData: { status },
  });
  return !!res.success;
}

export async function startSkillUpgradeCompile(
  mindId: string,
  skillId: string,
  sessionId: string
): Promise<{ success: boolean } | null> {
  const res = await apiPost({
    path: `/admin/minds/${mindId}/skills/${skillId}/upgrade/sessions/${sessionId}/compile`,
  });
  return res.success ? res.data : null;
}

export async function getSkillUpgradeCompileStatus(
  mindId: string,
  skillId: string,
  sessionId: string
): Promise<any> {
  const res = await apiGet({
    path: `/admin/minds/${mindId}/skills/${skillId}/upgrade/sessions/${sessionId}/compile-status`,
  });
  return res.success ? res.data : null;
}

export async function deleteSkillUpgradeSession(
  mindId: string,
  skillId: string,
  sessionId: string
): Promise<boolean> {
  const res = await apiDelete({
    path: `/admin/minds/${mindId}/skills/${skillId}/upgrade/sessions/${sessionId}`,
  });
  return !!res.success;
}

export async function abandonSkillUpgradeSession(
  mindId: string,
  skillId: string,
  sessionId: string
): Promise<boolean> {
  const res = await apiPost({
    path: `/admin/minds/${mindId}/skills/${skillId}/upgrade/sessions/${sessionId}/abandon`,
  });
  return !!res.success;
}

export async function updateSkillUpgradeSession(
  mindId: string,
  skillId: string,
  sessionId: string,
  data: { title: string }
): Promise<boolean> {
  const res = await apiPatch({
    path: `/admin/minds/${mindId}/skills/${skillId}/upgrade/sessions/${sessionId}`,
    passedData: data,
  });
  return !!res.success;
}
