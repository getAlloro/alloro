/**
 * Proposal Page Writer
 *
 * Creates one page in the Fireflies Proposals Notion database per pipeline
 * run. The page body contains the PROPOSED bullets (one per customer) so a
 * human approver can read, optionally edit, then tick the Approval checkbox
 * and pick their signature.
 *
 * Approval surface is the database properties; bullet text is the page
 * body. This matches CW's Q1 position: "Notion proposal page per pipeline
 * run in a new Fireflies Proposals database under Content Engine parent.
 * Approval = checkbox property on the page. Committer archives after apply."
 *
 * Spec source: docs/fireflies-to-substrate-pipeline.md section 5.
 */

import axios from "axios";
import { FIREFLIES_PROPOSALS_DB_ID } from "./constants";
import type {
  ProposedBullet,
  PipelineRunMetadata,
  ProposalPageRef,
} from "./types";

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

/**
 * Build the Notion property payload for a Fireflies Proposals page.
 * Property names match the database schema created 2026-05-24.
 */
function buildProperties(
  run: PipelineRunMetadata,
  customers: string[],
): Record<string, unknown> {
  // Notion rejects null property values; omit nullable fields entirely on create.
  // Approval signature, Approved at, Committed at are populated by the human approver
  // and the committer respectively, not at proposal-write time.
  return {
    "Run ID": {
      title: [{ text: { content: run.run_id } }],
    },
    "Run timestamp": {
      date: { start: run.run_timestamp },
    },
    Window: {
      rich_text: [{ text: { content: `${run.window_hours}h` } }],
    },
    "Customers proposed": {
      multi_select: customers.map((name) => ({ name })),
    },
    Approval: { checkbox: false },
    Committed: { checkbox: false },
    "Source transcripts": {
      rich_text: [
        {
          text: {
            content: run.source_transcript_ids.join(", ") || "(none)",
          },
        },
      ],
    },
    Notes: {
      rich_text: [
        {
          text: {
            content: `Proposer: ${run.proposer_signature}. ${run.notes}`.slice(0, 2000),
          },
        },
      ],
    },
  };
}

/**
 * Build the Notion page body (block children) showing one heading + one
 * bulleted_list_item per customer proposal. The human approver reads this,
 * edits inline if needed, then sets Approval=true and signs in the DB
 * properties.
 *
 * The first block is an instructional callout so the approver knows exactly
 * what the approval gesture means and what the committer will do.
 */
// Notion API caps rich_text[i].text.content at 2000 characters. Long bullets
// must be split across multiple rich_text segments within the same block;
// the rendered bullet text is the concatenation.
const NOTION_RICH_TEXT_MAX_CHARS = 1900;

function chunkRichText(text: string): unknown[] {
  if (text.length <= NOTION_RICH_TEXT_MAX_CHARS) {
    return [{ text: { content: text } }];
  }
  const chunks: unknown[] = [];
  let i = 0;
  while (i < text.length) {
    chunks.push({ text: { content: text.slice(i, i + NOTION_RICH_TEXT_MAX_CHARS) } });
    i += NOTION_RICH_TEXT_MAX_CHARS;
  }
  return chunks;
}

function buildPageBody(
  proposals: ProposedBullet[],
  run: PipelineRunMetadata,
): unknown[] {
  const blocks: unknown[] = [];

  blocks.push({
    object: "block",
    type: "callout",
    callout: {
      icon: { type: "emoji", emoji: "📥" },
      color: "blue_background",
      rich_text: [
        {
          type: "text",
          text: {
            content:
              "How to approve: review each PROPOSED bullet below, edit inline if needed, then in the database properties tick the Approval checkbox AND pick your Approval signature (Corey or Jo only). The committer runs separately and reads the edited bullet text from this page body. Only Corey or Jo signatures are honored; CC, CW, and the assistant Claudes cannot sign. Auto-archive after 72 hours if not approved or rejected.",
          },
        },
      ],
    },
  });

  blocks.push({
    object: "block",
    type: "heading_2",
    heading_2: {
      rich_text: [
        {
          type: "text",
          text: {
            content: `Proposed Section 2 updates (${proposals.length} customer${proposals.length === 1 ? "" : "s"})`,
          },
        },
      ],
    },
  });

  for (const p of proposals) {
    blocks.push({
      object: "block",
      type: "heading_3",
      heading_3: {
        rich_text: [
          {
            type: "text",
            text: { content: p.customer },
          },
        ],
      },
    });
    blocks.push({
      object: "block",
      type: "bulleted_list_item",
      bulleted_list_item: {
        rich_text: chunkRichText(p.rendered_text),
      },
    });
    blocks.push({
      object: "block",
      type: "paragraph",
      paragraph: {
        rich_text: [
          {
            type: "text",
            text: {
              content: `Sources: ${p.source_transcript_ids.join(", ") || "(none)"} | Records aggregated: ${p.source_record_count}${p.state_tag ? ` | New state tag: ${p.state_tag}` : ""}`,
            },
            annotations: { italic: true, color: "gray" },
          },
        ],
      },
    });
  }

  blocks.push({
    object: "block",
    type: "divider",
    divider: {},
  });

  blocks.push({
    object: "block",
    type: "paragraph",
    paragraph: {
      rich_text: [
        {
          type: "text",
          text: {
            content: `Run metadata: window=${run.window_hours}h, proposer=${run.proposer_signature}, source transcripts=${run.source_transcript_ids.length}.`,
          },
          annotations: { italic: true, color: "gray" },
        },
      ],
    },
  });

  return blocks;
}

/**
 * Create a new page in the Fireflies Proposals database with the proposed
 * bullets as page body content. Returns the new page ID and URL.
 *
 * Notion API: POST /v1/pages with parent.database_id and children.
 * substrateWriter is not used here because the substrate writer's scope
 * (per its own header comment) is "append_block_children, update_block,
 * patch_page" only. Page creation is a separate Notion API call; the 409
 * concurrency risk is low here because each pipeline run creates a unique
 * page (no two writers race for the same target).
 */
export async function writeProposalPage(
  proposals: ProposedBullet[],
  run: PipelineRunMetadata,
): Promise<ProposalPageRef> {
  const customerNames = proposals.map((p) => p.customer);
  const body = {
    parent: { database_id: FIREFLIES_PROPOSALS_DB_ID },
    properties: buildProperties(run, customerNames),
    children: buildPageBody(proposals, run),
  };

  const response = await axios.post(`${NOTION_API_BASE}/pages`, body, {
    headers: notionHeaders(),
  });

  return {
    page_id: response.data.id,
    page_url: response.data.url,
    run_id: run.run_id,
  };
}
