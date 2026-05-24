/**
 * Fireflies-to-Substrate Pipeline Constants
 *
 * Notion IDs and configuration constants used across the pipeline.
 * Spec source of truth: docs/fireflies-to-substrate-pipeline.md.
 *
 * The Notion databases were created 2026-05-24 under the Content Engine
 * parent page per CW peer-review Q1 position. IDs locked at creation time;
 * if the databases are recreated, update these constants.
 */

// State of Now page (substrate root)
export const STATE_OF_NOW_PAGE_ID = "369fdaf1-20c4-81c6-98bf-df4c0b32c556";

// Section 2 (Active customer state) bullet block IDs, one per current customer.
// Pipeline replaces these blocks in place when committing approved proposals.
// Source: verified via Notion API read at session-open 2026-05-24.
export const SECTION_2_CUSTOMER_BLOCKS: Record<string, string> = {
  "One Endodontics": "17478b34-7a18-4b39-8518-07fcf7607cdd",
  "Artful Orthodontics": "7bf4ab46-91ac-476d-a275-244e4392dc7f",
  "Caswell Orthodontics": "16d252c5-1bb7-4c30-aae9-dd6ed3d17aa1",
  "Garrison Orthodontics": "761dc1d2-99b9-41ae-bfaf-1834b30b8112",
  "Coastal Endodontic Studio": "e898af9c-f05b-4773-9602-6503723055fd",
};

// Section 2 owner paragraph block (read for schema confirmation only).
export const SECTION_2_OWNER_BLOCK = "988bfe6f-d784-4c4c-b30e-a6d5badb81b4";

// Section 2 heading block (for appending NEW customers; out of scope for v1).
export const SECTION_2_HEADING_BLOCK = "008702f8-c31b-48d3-ba7b-4529f77c4a16";

// Fireflies Proposals database (one page per pipeline run; approval lives here).
export const FIREFLIES_PROPOSALS_DB_ID = "9c2bd421d9fe4716931a77a0de8e95f5";

// Section 2 Event Log database (append-only audit, one row per committed bullet).
export const SECTION_2_EVENT_LOG_DB_ID = "b367d78c26e248f69b3ddff189e5755f";

// Default model per AR-003: Sonnet 4.6 for bulk extraction.
// Overridable via env for cost/quality experiments.
export const EXTRACTOR_MODEL =
  process.env.FIREFLIES_EXTRACTOR_MODEL || "claude-sonnet-4-6";

// Default Fireflies window in hours. Configurable per run via CLI flag.
export const DEFAULT_WINDOW_HOURS = 24;
export const MAX_WINDOW_HOURS = 7 * 24; // 7 days, per spec section 3

// Valid approver signatures. Strict per CW Q2: human-only. CC and CW cannot
// sign. Jo's Claude cannot sign on Jo's behalf. The substrate trust anchor
// is the human signature.
export const VALID_APPROVER_SIGNATURES = ["Corey", "Jo"] as const;
export type ApproverSignature = (typeof VALID_APPROVER_SIGNATURES)[number];

// Valid proposer signatures. Pipeline today is CC-only; CW listed so future
// CW-initiated runs can route through the same pipeline without schema change.
export const VALID_PROPOSER_SIGNATURES = ["CC", "CW"] as const;
export type ProposerSignature = (typeof VALID_PROPOSER_SIGNATURES)[number];
