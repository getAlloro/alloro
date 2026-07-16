/**
 * Leadgen Submissions — shared types
 *
 * Mirrors the response shapes returned by the admin leadgen endpoints on
 * signalsai-backend (see /api/admin/leadgen-submissions*). Redefined here
 * for frontend consumption; nothing imported from the backend.
 */

export type FinalStage =
  | "landed"
  | "input_started"
  | "input_submitted"
  | "audit_started"
  | "stage_viewed_1"
  | "stage_viewed_2"
  | "stage_viewed_3"
  | "stage_viewed_4"
  | "stage_viewed_5"
  | "results_viewed"
  | "report_engaged_1min"
  | "email_gate_shown"
  | "email_submitted"
  | "account_created"
  | "account_linked"
  | "abandoned";

/**
 * Why a session is considered "linked" to a user account.
 *   - persisted: leadgen_sessions.user_id is set (real at OTP verify time)
 *   - email:     derived by admin list join — users.email matches
 *   - domain:    derived — audit_processes.domain matches organizations.domain
 *   - null:      not linked
 */
export type LinkedVia = "persisted" | "email" | "domain" | null;

export type LeadgenDataQuality = "valid" | "empty" | "report_without_audit";

export interface SubmissionSummary {
  id: string;
  email: string | null;
  domain: string | null;
  practice_search_string: string | null;
  audit_id: string | null;
  audit_status: string | null;
  user_agent: string | null;
  final_stage: FinalStage;
  completed: boolean;
  abandoned: boolean;
  /** Server-computed integrity state for honest admin rendering. */
  data_quality?: LeadgenDataQuality;
  /** Persisted account relationship. Derived matches must not populate this. */
  user_id?: number | null;
  /** Persisted conversion timestamp. This is the only conversion signal. */
  converted_at?: string | null;
  first_seen_at: string;
  last_seen_at: string;
  /** Neutral association hint. It never implies account linkage or conversion. */
  linked_via?: LinkedVia;
}

/**
 * Non-stage CTA / interaction events emitted by the leadgen tool. These do
 * NOT advance `final_stage` — they enrich the per-session timeline only.
 * Keep in sync with the backend validation allow-list in
 * `LeadgenTrackingController`.
 */
export type LeadgenCtaEvent =
  | "cta_clicked_strategy_call"
  | "cta_clicked_create_account"
  | "email_field_focused"
  | "email_field_blurred_empty"
  | "audit_retried";

export type LeadgenEventName = FinalStage | LeadgenCtaEvent;

export interface LeadgenEvent {
  id: string;
  session_id: string;
  event_name: LeadgenEventName;
  event_data: Record<string, unknown> | null;
  created_at: string;
}

export interface LeadgenSession extends SubmissionSummary {
  referrer: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_term: string | null;
  utm_content: string | null;
  browser: string | null;
  os: string | null;
  device_type: string | null;
  user_id: number | null;
  converted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface LeadgenStats {
  total_sessions: number;
  total_conversions: number;
  conversion_rate_pct: number | null;
  median_time_to_convert_ms: number | null;
}

export interface AuditProcess {
  id: string;
  domain: string | null;
  practice_search_string: string | null;
  status: string | null;
  realtime_status: number | null;
  error_message: string | null;
  retry_count: number;
  step_screenshots: unknown;
  step_website_analysis: unknown;
  step_self_gbp: unknown;
  step_competitors: unknown;
  step_gbp_analysis: unknown;
  created_at: string;
  updated_at: string;
}

export interface SubmissionDetail {
  session: LeadgenSession;
  events: LeadgenEvent[];
  audit: AuditProcess | null;
}

export interface FunnelStage {
  name: FinalStage;
  count: number;
  drop_off_pct: number | null;
  ordinal: number;
}

export interface ListFilters {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: "all" | "completed" | "abandoned" | "in_progress";
  from?: string;
  to?: string;
  hasEmail?: boolean;
}

export interface ListResponse {
  items: SubmissionSummary[];
  total: number;
  page: number;
  pageSize: number;
}

export interface FunnelResponse {
  stages: FunnelStage[];
}
