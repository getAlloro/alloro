/**
 * Committer
 *
 * Reads approved Fireflies Proposals pages and applies the bullets to
 * State of Now Section 2. Strict approval-gate enforcement per CW Q2:
 * only pages with Approval=true AND Approval signature in {Corey, Jo}
 * AND Committed=false are eligible. CC and CW signatures are rejected.
 *
 * For each eligible page:
 *   1. Read bullet text from page body (heading_3 + bulleted_list_item pairs).
 *      Approver may have edited the bullet text since proposal; we honor
 *      the current page-body text as the source of truth.
 *   2. Run voice check on each bullet (BLOCK mode per spec section 8;
 *      doctrine applies to its enforcers per 2026-05-23 Section 4 entry).
 *   3. For each customer, look up the Section 2 block ID and updateBlock
 *      via substrateWriter (409 retry built in).
 *   4. Append one row per committed customer to Section 2 Event Log.
 *   5. Update the proposal page: Committed=true, Committed at=now.
 *   6. Archive the proposal page (Notion archived=true).
 *
 * If any voice check fails, abort the page commit, leave Committed=false,
 * and surface to operator. Other pages in the same committer run continue
 * to be processed.
 *
 * Spec source: docs/fireflies-to-substrate-pipeline.md section 6 + section 7.
 */

import axios from "axios";
import { updateBlock } from "../notion/substrateWriter";
import {
  FIREFLIES_PROPOSALS_DB_ID,
  SECTION_2_CUSTOMER_BLOCKS,
  VALID_APPROVER_SIGNATURES,
  type ApproverSignature,
  type ProposerSignature,
} from "./constants";
import { findFirstVoiceFailure } from "./voiceCheck";
import { appendEventLogRows } from "./eventLog";
import type { PendingApproval, EventLogEntry } from "./types";

const NOTION_API_BASE = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";

function notionHeaders(): Record<string, string> {
  const token = process.env.NOTION_TOKEN;
  if (!token) throw new Error("NOTION_TOKEN env var not set");
  return {
    Authorization: `Bearer ${token}`,
    "Notion-Version": NOTION_VERSION,
    "Content-Type": "application/json",
  };
}

// ---------------------------------------------------------------------
// Query: find pending approvals
// ---------------------------------------------------------------------

interface NotionPagePropertyResults {
  results: Array<{
    id: string;
    properties: Record<string, any>;
    archived: boolean;
  }>;
}

/**
 * Query the Fireflies Proposals database for pages where Approval=true,
 * Approval signature in {Corey, Jo}, and Committed=false. Returns the raw
 * Notion page summaries; caller fetches body via getPageBody.
 */
export async function findPendingApprovals(): Promise<
  Array<{
    page_id: string;
    run_id: string;
    approver: ApproverSignature;
    approved_at: string;
    proposer: ProposerSignature;
    source_transcripts: string;
  }>
> {
  const url = `${NOTION_API_BASE}/databases/${FIREFLIES_PROPOSALS_DB_ID}/query`;
  const filter = {
    and: [
      { property: "Approval", checkbox: { equals: true } },
      { property: "Committed", checkbox: { equals: false } },
    ],
  };
  const response = await axios.post<NotionPagePropertyResults>(
    url,
    { filter },
    { headers: notionHeaders() },
  );

  const pending: Array<{
    page_id: string;
    run_id: string;
    approver: ApproverSignature;
    approved_at: string;
    proposer: ProposerSignature;
    source_transcripts: string;
  }> = [];

  for (const page of response.data.results) {
    if (page.archived) continue;
    const sigName = page.properties["Approval signature"]?.select?.name;
    if (!sigName || !VALID_APPROVER_SIGNATURES.includes(sigName as ApproverSignature)) {
      console.warn(
        `[APPROVAL_REJECTED] page ${page.id} has Approval=true but signature is "${sigName ?? "null"}" (must be Corey or Jo); skipping`,
      );
      continue;
    }
    const runIdTitle = page.properties["Run ID"]?.title;
    const runId = Array.isArray(runIdTitle) && runIdTitle.length > 0
      ? runIdTitle.map((t: any) => t.plain_text || "").join("")
      : "unknown-run";
    const approvedAtDate = page.properties["Approved at"]?.date?.start;
    const notesText = page.properties["Notes"]?.rich_text;
    const notes = Array.isArray(notesText)
      ? notesText.map((t: any) => t.plain_text || "").join("")
      : "";
    const proposerMatch = notes.match(/Proposer:\s*(CC|CW)/);
    const proposer: ProposerSignature = (proposerMatch?.[1] as ProposerSignature) || "CC";
    const sourceText = page.properties["Source transcripts"]?.rich_text;
    const sourceTranscripts = Array.isArray(sourceText)
      ? sourceText.map((t: any) => t.plain_text || "").join("")
      : "";

    pending.push({
      page_id: page.id,
      run_id: runId,
      approver: sigName as ApproverSignature,
      approved_at: approvedAtDate || new Date().toISOString(),
      proposer,
      source_transcripts: sourceTranscripts,
    });
  }

  return pending;
}

// ---------------------------------------------------------------------
// Read page body: extract bullet text per customer
// ---------------------------------------------------------------------

/**
 * Fetch all block children of a page and pair heading_3 (customer name)
 * with the immediately following bulleted_list_item (bullet text).
 * Handles approver edits since proposal write.
 */
export async function readApprovedBullets(
  pageId: string,
): Promise<Array<{ customer: string; rendered_text: string }>> {
  const url = `${NOTION_API_BASE}/blocks/${pageId}/children`;
  const response = await axios.get(url, { headers: notionHeaders() });
  const blocks = response.data.results as any[];

  const bullets: Array<{ customer: string; rendered_text: string }> = [];
  let pendingCustomer: string | null = null;

  for (const block of blocks) {
    if (block.type === "heading_3") {
      const text = (block.heading_3.rich_text || [])
        .map((t: any) => t.plain_text || "")
        .join("")
        .trim();
      pendingCustomer = text || null;
    } else if (block.type === "bulleted_list_item" && pendingCustomer) {
      const text = (block.bulleted_list_item.rich_text || [])
        .map((t: any) => t.plain_text || "")
        .join("")
        .trim();
      bullets.push({ customer: pendingCustomer, rendered_text: text });
      pendingCustomer = null;
    }
  }

  return bullets;
}

// ---------------------------------------------------------------------
// Section 2 block replacement
// ---------------------------------------------------------------------

/**
 * Read the current text of a Section 2 customer block (for the event-log
 * "prior bullet text" field).
 */
export async function readSection2BulletText(blockId: string): Promise<string> {
  const url = `${NOTION_API_BASE}/blocks/${blockId}`;
  const response = await axios.get(url, { headers: notionHeaders() });
  const block = response.data;
  if (block.type !== "bulleted_list_item") return "";
  return (block.bulleted_list_item.rich_text || [])
    .map((t: any) => t.plain_text || "")
    .join("");
}

/**
 * Replace the Section 2 customer block content with new bullet text.
 * Uses substrateWriter for 409 retry.
 */
async function replaceSection2Block(
  blockId: string,
  newText: string,
  proposer: ProposerSignature,
): Promise<void> {
  await updateBlock({
    blockId,
    body: {
      bulleted_list_item: {
        rich_text: [{ type: "text", text: { content: newText } }],
      },
    },
    actor: proposer,
    reason: "fireflies-pipeline section 2 commit",
  });
}

// ---------------------------------------------------------------------
// Mark proposal page committed + archive
// ---------------------------------------------------------------------

async function markProposalCommitted(
  pageId: string,
  committedAt: string,
): Promise<void> {
  const url = `${NOTION_API_BASE}/pages/${pageId}`;
  await axios.patch(
    url,
    {
      properties: {
        Committed: { checkbox: true },
        "Committed at": { date: { start: committedAt } },
      },
    },
    { headers: notionHeaders() },
  );
}

async function archiveProposalPage(pageId: string): Promise<void> {
  const url = `${NOTION_API_BASE}/pages/${pageId}`;
  await axios.patch(url, { archived: true }, { headers: notionHeaders() });
}

// ---------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------

export interface CommitResult {
  page_id: string;
  run_id: string;
  approver: ApproverSignature;
  committed_customers: string[];
  skipped_customers: Array<{ customer: string; reason: string }>;
  voice_check_failure: { customer: string; violations: string[] } | null;
  event_log_entries: number;
}

/**
 * Process all pending approvals. Each page is committed independently;
 * one page's voice failure does not block others.
 */
export async function commitPendingApprovals(): Promise<CommitResult[]> {
  const pending = await findPendingApprovals();
  const results: CommitResult[] = [];
  for (const p of pending) {
    results.push(await commitOnePage(p));
  }
  return results;
}

async function commitOnePage(pending: {
  page_id: string;
  run_id: string;
  approver: ApproverSignature;
  approved_at: string;
  proposer: ProposerSignature;
  source_transcripts: string;
}): Promise<CommitResult> {
  const committedAt = new Date().toISOString();
  const bullets = await readApprovedBullets(pending.page_id);

  // BLOCK: voice doctrine check on approver-edited bullet text
  const voiceFailure = findFirstVoiceFailure(bullets);
  if (voiceFailure) {
    console.error(
      `[COMMIT_BLOCKED_VOICE] page ${pending.page_id} bullet for ${voiceFailure.customer} failed voice check: ${voiceFailure.result.violations.join("; ")}`,
    );
    return {
      page_id: pending.page_id,
      run_id: pending.run_id,
      approver: pending.approver,
      committed_customers: [],
      skipped_customers: bullets.map((b) => ({
        customer: b.customer,
        reason: `voice check failed on ${voiceFailure.customer}: ${voiceFailure.result.violations.join("; ")}`,
      })),
      voice_check_failure: {
        customer: voiceFailure.customer,
        violations: voiceFailure.result.violations,
      },
      event_log_entries: 0,
    };
  }

  const committed: string[] = [];
  const skipped: Array<{ customer: string; reason: string }> = [];
  const eventLogRows: EventLogEntry[] = [];

  for (const b of bullets) {
    const blockId = SECTION_2_CUSTOMER_BLOCKS[b.customer];
    if (!blockId) {
      skipped.push({
        customer: b.customer,
        reason: `customer "${b.customer}" not in SECTION_2_CUSTOMER_BLOCKS map; expected one of ${Object.keys(SECTION_2_CUSTOMER_BLOCKS).join(", ")}`,
      });
      console.warn(
        `[COMMIT_SKIP_UNKNOWN_CUSTOMER] page ${pending.page_id} bullet references "${b.customer}"; no Section 2 block mapped`,
      );
      continue;
    }
    const priorText = await readSection2BulletText(blockId);
    try {
      await replaceSection2Block(blockId, b.rendered_text, pending.proposer);
      committed.push(b.customer);
      eventLogRows.push(buildEventLogEntry(pending, committedAt, b, priorText));
    } catch (err) {
      skipped.push({
        customer: b.customer,
        reason: `Section 2 write failed: ${(err as Error).message}`,
      });
      console.error(
        `[COMMIT_WRITE_FAIL] page ${pending.page_id} customer ${b.customer}: ${(err as Error).message}`,
      );
    }
  }

  if (eventLogRows.length > 0) {
    await appendEventLogRows(eventLogRows);
  }

  if (committed.length > 0) {
    await markProposalCommitted(pending.page_id, committedAt);
    await archiveProposalPage(pending.page_id);
  }

  return {
    page_id: pending.page_id,
    run_id: pending.run_id,
    approver: pending.approver,
    committed_customers: committed,
    skipped_customers: skipped,
    voice_check_failure: null,
    event_log_entries: eventLogRows.length,
  };
}

function buildEventLogEntry(
  pending: {
    page_id: string;
    run_id: string;
    approver: ApproverSignature;
    proposer: ProposerSignature;
    source_transcripts: string;
  },
  committedAt: string,
  bullet: { customer: string; rendered_text: string },
  priorText: string,
): EventLogEntry {
  const eventIdSlug = bullet.customer.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return {
    event_id: `${committedAt}-${eventIdSlug}`,
    committed_at: committedAt,
    customer: bullet.customer,
    committer_signature: pending.approver,
    proposer_signature: pending.proposer,
    source_transcripts: pending.source_transcripts,
    event_summary: bullet.rendered_text.slice(0, 200),
    edits_applied:
      priorText === bullet.rendered_text
        ? "none (bullet committed as proposed)"
        : "approver edited bullet text",
    prior_bullet_text: priorText,
    new_bullet_text: bullet.rendered_text,
    proposal_page_id: pending.page_id,
  };
}
