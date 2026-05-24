/**
 * Pipeline Orchestrator
 *
 * Wires transcript source -> extractor -> aggregator -> proposal writer
 * end-to-end. Returns the Notion proposal page reference so the operator
 * can hand the URL to Corey or Jo for approval.
 *
 * Note: the orchestrator does NOT commit. The committer runs as a separate
 * step after a human approves. This separation matches the spec's mandatory
 * approval-gate design and keeps the read/write surfaces isolated.
 *
 * Spec source: docs/fireflies-to-substrate-pipeline.md section 2.
 */

import { randomBytes } from "node:crypto";
import {
  DEFAULT_WINDOW_HOURS,
  MAX_WINDOW_HOURS,
  type ProposerSignature,
} from "./constants";
import { extractFromTranscript } from "./extractor";
import { aggregateProposals } from "./aggregator";
import { writeProposalPage } from "./proposalWriter";
import { matchTranscriptToCustomers, CUSTOMER_ROSTER } from "./roster";
import {
  JsonFileTranscriptSource,
  type TranscriptSource,
} from "./transcriptSource";
import type {
  FirefliesTranscript,
  ExtractionRecord,
  ProposedBullet,
  ProposalPageRef,
  PipelineRunMetadata,
} from "./types";

export interface PipelineRunOptions {
  /** Window in hours (1 to 168). Defaults to 24. */
  windowHours?: number;
  /** Filter to a single customer canonical name; null = all customers. */
  onlyCustomer?: string | null;
  /** Proposer signature (CC or CW). Defaults to "CC". */
  proposer?: ProposerSignature;
  /** Transcript source. Defaults to JsonFileTranscriptSource("tmp/fireflies-input"). */
  source?: TranscriptSource;
  /** Map of customer canonical name to current Section 2 bullet text.
   *  In production the orchestrator fetches this from Notion at run time;
   *  for the MVP and for tests, callers can pass it explicitly. */
  priorBullets?: Map<string, string>;
  /** If true, skip the Notion proposal page write; return a synthetic
   *  ref for inspection only. Useful for the first build-out test. */
  dryRun?: boolean;
  /** Optional notes to attach to the proposal page metadata. */
  notes?: string;
}

export interface PipelineRunResult {
  run_id: string;
  transcripts_considered: number;
  transcripts_with_roster_match: number;
  extractions_total: number;
  proposals_generated: number;
  proposal_page: ProposalPageRef | null;
  proposals: ProposedBullet[];
}

function generateRunId(): string {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const suffix = randomBytes(2).toString("hex");
  return `${ts}-${suffix}`;
}

/**
 * Filter transcripts: keep only those whose title, summary, attendee
 * names, or full text mention at least one roster customer (or matches
 * the onlyCustomer filter if set).
 */
function filterByRoster(
  transcripts: FirefliesTranscript[],
  onlyCustomer: string | null,
): FirefliesTranscript[] {
  const kept: FirefliesTranscript[] = [];
  for (const t of transcripts) {
    const searchable = [
      t.title,
      t.summary || "",
      t.attendees.map((a) => `${a.name} ${a.email || ""}`).join(" "),
      t.fullText.slice(0, 5000), // first 5K chars only, for speed; deep matches caught by extractor
    ].join(" ");
    const matched = matchTranscriptToCustomers(searchable);
    if (matched.length === 0) continue;
    if (onlyCustomer && !matched.some((m) => m.canonical_name === onlyCustomer)) continue;
    kept.push(t);
  }
  return kept;
}

/**
 * Run the pipeline end-to-end up to (but not including) the commit step.
 * Returns the proposal page reference and the proposals for inspection.
 */
export async function runPipeline(
  options: PipelineRunOptions = {},
): Promise<PipelineRunResult> {
  const windowHours = Math.min(
    Math.max(options.windowHours ?? DEFAULT_WINDOW_HOURS, 1),
    MAX_WINDOW_HOURS,
  );
  const proposer: ProposerSignature = options.proposer ?? "CC";
  const source = options.source ?? new JsonFileTranscriptSource();
  const priorBullets = options.priorBullets ?? new Map();
  const onlyCustomer = options.onlyCustomer ?? null;

  const runId = generateRunId();
  const runTimestamp = new Date().toISOString();

  const transcripts = await source.fetchWithinHours(windowHours);
  const filtered = filterByRoster(transcripts, onlyCustomer);

  console.error(
    `[PIPELINE_RUN] run_id=${runId} window=${windowHours}h transcripts_considered=${transcripts.length} transcripts_with_roster_match=${filtered.length}`,
  );

  const extractions: ExtractionRecord[] = [];
  for (const t of filtered) {
    const recs = await extractFromTranscript(t);
    extractions.push(...recs);
  }

  // If filtering to a single customer, drop extractions for other customers
  const scopedExtractions = onlyCustomer
    ? extractions.filter((e) => e.customer === onlyCustomer)
    : extractions;

  const proposals = aggregateProposals(scopedExtractions, priorBullets);

  if (proposals.length === 0) {
    console.error(
      `[PIPELINE_NO_PROPOSALS] run_id=${runId} no proposals generated; no Notion write`,
    );
    return {
      run_id: runId,
      transcripts_considered: transcripts.length,
      transcripts_with_roster_match: filtered.length,
      extractions_total: scopedExtractions.length,
      proposals_generated: 0,
      proposal_page: null,
      proposals: [],
    };
  }

  const allSourceIds = Array.from(
    new Set(scopedExtractions.map((e) => e.transcript_id)),
  );
  const runMetadata: PipelineRunMetadata = {
    run_id: runId,
    run_timestamp: runTimestamp,
    window_hours: windowHours,
    proposer_signature: proposer,
    source_transcript_ids: allSourceIds,
    notes:
      options.notes ??
      (onlyCustomer
        ? `Single-customer run filtered to ${onlyCustomer}.`
        : `Full-roster run across ${CUSTOMER_ROSTER.length} customers.`),
  };

  let proposalPage: ProposalPageRef | null = null;
  if (!options.dryRun) {
    proposalPage = await writeProposalPage(proposals, runMetadata);
    console.error(
      `[PIPELINE_PROPOSAL_WRITTEN] run_id=${runId} page_id=${proposalPage.page_id} url=${proposalPage.page_url}`,
    );
  } else {
    console.error(`[PIPELINE_DRY_RUN] run_id=${runId} proposals_generated=${proposals.length}; skipping Notion write`);
  }

  return {
    run_id: runId,
    transcripts_considered: transcripts.length,
    transcripts_with_roster_match: filtered.length,
    extractions_total: scopedExtractions.length,
    proposals_generated: proposals.length,
    proposal_page: proposalPage,
    proposals,
  };
}
