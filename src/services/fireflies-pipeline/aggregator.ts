/**
 * Aggregator
 *
 * Groups extraction records by customer and renders each customer's
 * PROPOSED Section 2 bullet by appending new event detail to the prior
 * bullet text. Most recent status wins; resolution events and signals
 * accumulate within the window.
 *
 * Design choice: rather than rebuild the bullet from scratch (which would
 * lose hand-curated baseline facts like "$232K April production, 158
 * referrals, 95% doctor mix" that Jo or Corey added), the aggregator
 * preserves the prior bullet text and appends a new dated event suffix.
 * The human reviewer can edit before approval (spec section 6,
 * edit-on-approval).
 *
 * Spec source: docs/fireflies-to-substrate-pipeline.md section 5.
 */

import type {
  ExtractionRecord,
  ProposedBullet,
  AccountHealthSignal,
} from "./types";

/**
 * Group extraction records by customer canonical name.
 */
function groupByCustomer(
  records: ExtractionRecord[],
): Map<string, ExtractionRecord[]> {
  const grouped = new Map<string, ExtractionRecord[]>();
  for (const r of records) {
    const list = grouped.get(r.customer) ?? [];
    list.push(r);
    grouped.set(r.customer, list);
  }
  // Sort each customer's records by transcript_date ascending so the
  // "most recent status wins" rule is unambiguous when there are multiple.
  for (const list of grouped.values()) {
    list.sort((a, b) =>
      a.transcript_date < b.transcript_date ? -1 : a.transcript_date > b.transcript_date ? 1 : 0,
    );
  }
  return grouped;
}

/**
 * Render the event-suffix line for one transcript's worth of extractions.
 * Format:
 *   YYYY-MM-DD [from Fireflies call <transcript_id>, attendees: X, Y]:
 *   resolved A ("quote"); signal positive B ("quote"); concern C ("quote").
 */
function renderEventLineForRecord(record: ExtractionRecord): string {
  const date = record.transcript_date.slice(0, 10);
  const attendeesStr = record.attendees
    .map((a) => `${a.name} (${a.role})`)
    .join(", ");
  const parts: string[] = [];

  for (const ev of record.resolution_events) {
    parts.push(`resolved ${ev.issue} ("${ev.evidence_quote}")`);
  }
  for (const sig of record.account_health_signals) {
    parts.push(formatSignal(sig));
  }
  if (record.mentions.length > 0) {
    parts.push(`mentions: ${record.mentions.join("; ")}`);
  }

  const detail = parts.length > 0 ? parts.join("; ") : "no material events extracted";
  return `${date} [from Fireflies ${record.transcript_id}, attendees: ${attendeesStr}]: ${detail}.`;
}

function formatSignal(sig: AccountHealthSignal): string {
  const conf = sig.confidence === "high" ? "" : ` (${sig.confidence} confidence)`;
  return `${sig.signal_type} signal ${sig.polarity}${conf} ("${sig.evidence_quote}")`;
}

/**
 * Determine the most recent state tag for a customer across the window.
 * Returns null if no status_change was extracted.
 */
function pickLatestStateTag(records: ExtractionRecord[]): string | null {
  // records are already sorted ascending; walk from end to find first with status_change
  for (let i = records.length - 1; i >= 0; i--) {
    const r = records[i]!;
    if (r.status_change) return r.status_change.to.toUpperCase();
  }
  return null;
}

/**
 * Strip trailing punctuation/whitespace so we can cleanly append.
 */
function trimEnd(s: string): string {
  return s.replace(/[\s.]+$/, "");
}

/**
 * Render the full PROPOSED bullet text for one customer.
 * priorBullet may be empty string for customers whose Section 2 entry is
 * the "current state unknown to CW; Jo or Corey to populate" placeholder
 * (e.g. Garrison, Coastal); in that case the bullet is built from the
 * extraction alone with a "first-known-state" note.
 */
function renderProposedBullet(
  customer: string,
  records: ExtractionRecord[],
  priorBullet: string,
): ProposedBullet {
  const stateTag = pickLatestStateTag(records);
  const stateTagPriorMatch = priorBullet.match(/\b([A-Z][A-Z\s-]{2,})\b(?=\s+(?:despite|\.|,|$))/);
  const priorStateTag = stateTagPriorMatch ? stateTagPriorMatch[1]!.trim() : null;

  const stateTagSuffix =
    stateTag && stateTag !== priorStateTag
      ? priorStateTag
        ? ` State now ${stateTag} (was ${priorStateTag}).`
        : ` State ${stateTag}.`
      : "";

  const eventLines = records.map(renderEventLineForRecord);
  const eventSuffix =
    eventLines.length > 0 ? ` ${eventLines.join(" ")}` : "";

  const sourceList = records.map((r) => r.transcript_id);
  const sourceSuffix =
    sourceList.length > 0
      ? ` Source: ${sourceList.join(", ")}.`
      : "";

  let bulletText: string;
  if (priorBullet.trim().length === 0 || /current state unknown to cw/i.test(priorBullet)) {
    // Bootstrap a fresh bullet for placeholder customers (Garrison, Coastal).
    bulletText = `${customer}: state populated 2026-05-24 from Fireflies pipeline.${stateTagSuffix}${eventSuffix}${sourceSuffix}`;
  } else {
    bulletText = `${trimEnd(priorBullet)}.${stateTagSuffix}${eventSuffix}${sourceSuffix}`;
  }

  return {
    customer,
    rendered_text: bulletText,
    source_transcript_ids: sourceList,
    state_tag: stateTag,
    source_record_count: records.length,
  };
}

/**
 * Main entry point: aggregate extraction records into proposed bullets.
 *
 * @param extractions - flat list of extraction records from all transcripts in window
 * @param priorBullets - map of customer canonical name to current Section 2 bullet text
 * @returns one ProposedBullet per customer that had at least one extraction
 */
export function aggregateProposals(
  extractions: ExtractionRecord[],
  priorBullets: Map<string, string>,
): ProposedBullet[] {
  const grouped = groupByCustomer(extractions);
  const proposals: ProposedBullet[] = [];
  for (const [customer, records] of grouped.entries()) {
    const prior = priorBullets.get(customer) ?? "";
    proposals.push(renderProposedBullet(customer, records, prior));
  }
  // Stable sort by customer name for deterministic output (matters for test
  // assertions and for the Notion proposal page rendering order).
  proposals.sort((a, b) => a.customer.localeCompare(b.customer));
  return proposals;
}
