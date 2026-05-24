/**
 * Fireflies-to-Substrate Pipeline Types
 *
 * Shared types across the pipeline stages. Schema mirrors the spec at
 * docs/fireflies-to-substrate-pipeline.md section 4.
 */

import type { ApproverSignature, ProposerSignature } from "./constants";

// =====================================================================
// INPUT LAYER (Fireflies)
// =====================================================================

/**
 * A single transcript fetched from Fireflies. Pipeline-internal shape;
 * different sources (MCP, JSON file, future GraphQL client) normalize into
 * this shape.
 */
export interface FirefliesTranscript {
  id: string;
  title: string;
  date: string; // ISO-8601
  duration: number; // seconds
  attendees: Array<{ name: string; email?: string }>;
  /** Full transcript sentences joined with spaces. Used for evidence-quote
   *  substring validation. */
  fullText: string;
  /** Optional auto-summary from Fireflies. Null if not yet generated. */
  summary: string | null;
}

// =====================================================================
// PROCESSING LAYER (Extractor)
// =====================================================================

export type StatusChangeRecord = {
  from: string;
  to: string;
  evidence_quote: string;
};

export type ResolutionEventRecord = {
  issue: string;
  resolution: string;
  evidence_quote: string;
};

export type AccountHealthSignal = {
  signal_type: "satisfaction" | "concern" | "intent_to_renew" | "intent_to_churn" | "other";
  polarity: "positive" | "negative" | "neutral";
  confidence: "low" | "medium" | "high";
  evidence_quote: string;
};

/**
 * One record per (customer, transcript) pair. Extractor returns an array
 * of these; aggregator groups by customer across transcripts.
 *
 * Voice constraint on the extractor: every event in this record must carry
 * a verbatim evidence_quote that survives substring validation against the
 * source transcript text. Records that fail validation are dropped before
 * the aggregator sees them.
 */
export interface ExtractionRecord {
  customer: string; // matched against Section 2 roster; non-roster customers are dropped
  transcript_id: string;
  transcript_title: string;
  transcript_date: string; // ISO-8601
  attendees: Array<{ role: string; name: string }>;
  status_change: StatusChangeRecord | null;
  resolution_events: ResolutionEventRecord[];
  account_health_signals: AccountHealthSignal[];
  mentions: string[]; // free-text things named that are not events
  extraction_notes: string[]; // LLM reasoning trail
}

// =====================================================================
// AGGREGATION LAYER
// =====================================================================

/**
 * One PROPOSED bullet per customer, after aggregating multi-transcript
 * extractions. Shape matches Section 2 free-text format (see spec section 5).
 */
export interface ProposedBullet {
  customer: string;
  /** Final rendered bullet text in Section 2 shape (no PROPOSED prefix; the
   *  Notion page wrapper carries the proposal metadata). */
  rendered_text: string;
  /** Source transcript IDs that contributed to this bullet. */
  source_transcript_ids: string[];
  /** Convenience: the most recent state tag suggested by the extractions, if any. */
  state_tag: string | null;
  /** Convenience: count of source records this bullet aggregates. */
  source_record_count: number;
}

// =====================================================================
// OUTPUT LAYER (Notion proposal page)
// =====================================================================

export interface PipelineRunMetadata {
  run_id: string; // ISO-8601 timestamp + short suffix, e.g. "2026-05-24T17:18Z-a3f2"
  run_timestamp: string; // ISO-8601
  window_hours: number;
  proposer_signature: ProposerSignature;
  source_transcript_ids: string[];
  notes: string;
}

/**
 * Result of writing a pipeline run to the Fireflies Proposals database.
 * The page_id is the human's approval surface; they tick Approval and
 * pick a signature, then the committer reads back from page_id.
 */
export interface ProposalPageRef {
  page_id: string;
  page_url: string;
  run_id: string;
}

// =====================================================================
// COMMIT LAYER
// =====================================================================

/**
 * A pending approval ready for the committer to process.
 * Surfaced by querying the Fireflies Proposals database for
 * Approval=true AND Approval signature IN [Corey, Jo] AND Committed=false.
 */
export interface PendingApproval {
  page_id: string;
  run_id: string;
  approver: ApproverSignature;
  approved_at: string;
  /** Bullet content read back from the proposal page body. May include
   *  approver edits per spec section 6 ("edit-on-approval"). */
  bullets: Array<{
    customer: string;
    rendered_text: string;
    source_transcript_ids: string[];
  }>;
}

/**
 * One row appended to the Section 2 Event Log database per committed bullet.
 */
export interface EventLogEntry {
  event_id: string;
  committed_at: string;
  customer: string;
  committer_signature: ApproverSignature;
  proposer_signature: ProposerSignature;
  source_transcripts: string;
  event_summary: string;
  edits_applied: string;
  prior_bullet_text: string;
  new_bullet_text: string;
  proposal_page_id: string;
}
