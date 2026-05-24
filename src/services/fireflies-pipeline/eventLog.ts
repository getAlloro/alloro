/**
 * Section 2 Event Log Writer
 *
 * Append-only audit log for every committed Section 2 update. One row per
 * customer bullet committed. Permanent retention; the log is the answer
 * to "where did this Section 2 entry come from, who proposed it, who
 * approved it, what changed, when?"
 *
 * Spec source: docs/fireflies-to-substrate-pipeline.md section 7.
 */

import axios from "axios";
import { SECTION_2_EVENT_LOG_DB_ID } from "./constants";
import type { EventLogEntry } from "./types";

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

function buildProperties(entry: EventLogEntry): Record<string, unknown> {
  return {
    "Event ID": {
      title: [{ type: "text", text: { content: entry.event_id } }],
    },
    "Committed at": { date: { start: entry.committed_at } },
    Customer: { select: { name: entry.customer } },
    "Committer signature": { select: { name: entry.committer_signature } },
    "Proposer signature": { select: { name: entry.proposer_signature } },
    "Source transcripts": {
      rich_text: [
        { type: "text", text: { content: entry.source_transcripts.slice(0, 2000) } },
      ],
    },
    "Event summary": {
      rich_text: [
        { type: "text", text: { content: entry.event_summary.slice(0, 2000) } },
      ],
    },
    "Edits applied": {
      rich_text: [
        { type: "text", text: { content: entry.edits_applied.slice(0, 2000) } },
      ],
    },
    "Prior bullet text": {
      rich_text: [
        { type: "text", text: { content: entry.prior_bullet_text.slice(0, 2000) } },
      ],
    },
    "New bullet text": {
      rich_text: [
        { type: "text", text: { content: entry.new_bullet_text.slice(0, 2000) } },
      ],
    },
    "Proposal page ID": {
      rich_text: [{ type: "text", text: { content: entry.proposal_page_id } }],
    },
  };
}

/**
 * Append one row to the Section 2 Event Log database.
 * Creates a new page with the audit properties; no body content.
 */
export async function appendEventLogRow(entry: EventLogEntry): Promise<string> {
  const url = `${NOTION_API_BASE}/pages`;
  const body = {
    parent: { database_id: SECTION_2_EVENT_LOG_DB_ID },
    properties: buildProperties(entry),
  };
  const response = await axios.post(url, body, { headers: notionHeaders() });
  return response.data.id;
}

/**
 * Append multiple rows in sequence. Failures are logged and the loop
 * continues; the audit log is best-effort, since the substrate write
 * has already happened by the time we get here.
 */
export async function appendEventLogRows(entries: EventLogEntry[]): Promise<void> {
  for (const entry of entries) {
    try {
      await appendEventLogRow(entry);
    } catch (err) {
      console.error(
        `[EVENT_LOG_WRITE_FAIL] entry ${entry.event_id}: ${(err as Error).message}`,
      );
    }
  }
}
