/**
 * Per-Transcript Extractor
 *
 * Calls the LLM (Sonnet 4.6 per AR-003) with a transcript and returns
 * structured extraction records, one per customer mentioned.
 *
 * Voice constraint per spec section 4: the extractor is a stenographer,
 * not an analyst. Every status change, resolution event, and account-health
 * signal must carry a verbatim evidence_quote that this module then
 * cross-checks against the source transcript via substring match. Records
 * that fail the substring check are dropped with logged warnings before the
 * aggregator sees them.
 *
 * Failure-mode mapping (spec section 8):
 *   - Malformed JSON -> EXTRACTION_PARSE_FAIL (drop transcript, continue run)
 *   - Customer not in roster -> ROSTER_MISMATCH (drop record, keep others)
 *   - Evidence quote not in transcript text -> EVIDENCE_VERIFICATION_FAIL
 *     (drop the offending event from the record, keep the rest of the record)
 */

import { runAgent } from "../../agents/service.llm-runner";
import { rosterAsPromptList, lookupRosterEntry } from "./roster";
import { EXTRACTOR_MODEL } from "./constants";
import type {
  FirefliesTranscript,
  ExtractionRecord,
  StatusChangeRecord,
  ResolutionEventRecord,
  AccountHealthSignal,
} from "./types";

// Maximum transcript characters to send to the LLM. ~50K chars is roughly
// 12K tokens, well under any context window concern but enough for a 90min
// call. If the transcript is longer, we keep the first half + last half
// (the middle of a long meeting is rarely where the decisions live).
const MAX_TRANSCRIPT_CHARS = 50_000;

function truncateTranscript(text: string): string {
  if (text.length <= MAX_TRANSCRIPT_CHARS) return text;
  const half = Math.floor(MAX_TRANSCRIPT_CHARS / 2);
  const head = text.slice(0, half);
  const tail = text.slice(-half);
  return `${head}\n\n[...transcript truncated for length; middle ${text.length - MAX_TRANSCRIPT_CHARS} chars omitted...]\n\n${tail}`;
}

const EXTRACTOR_SYSTEM_PROMPT = `You are an extraction agent for Alloro's Fireflies-to-Substrate pipeline.

Your job: read a customer-call transcript and extract structured events per customer in strict JSON format. You are a stenographer, not an analyst.

CUSTOMER ROSTER (use ONLY these canonical names; do not invent customer names):
${rosterAsPromptList()}

RULES:

1. **One record per customer mentioned.** If the transcript involves multiple roster customers (rare; joint call), emit one record per customer. If the transcript involves NO roster customer (e.g. internal Alloro standup), emit an empty records array.

2. **Use canonical customer names from the roster only.** If you see "1Endo" in the transcript, emit "One Endodontics". If you see "Coastal Endo", emit "Coastal Endodontic Studio". Never emit a customer name that is not in the roster above.

3. **Every event must carry a verbatim evidence_quote.** Status changes, resolution events, and account-health signals all require quotes pulled VERBATIM from the transcript. No paraphrase. The pipeline will substring-validate every quote against the transcript text; quotes that fail validation will be dropped.

4. **Quote evidence in customer or team voice only.** The evidence_quote should be something a participant actually said in the transcript. Do not synthesize, paraphrase, or summarize. If a participant did not actually say it, do not claim they did.

5. **Status tags require evidence.** Never propose a status_change without an evidence_quote that supports it. If you cannot find a quote that shows the customer signaling intent to renew, churn, escalate, or recover, set status_change to null.

6. **Flag low-confidence inferences in extraction_notes.** If you are inferring something from indirect signal, say so explicitly in extraction_notes with reasoning. The reviewer will read these notes.

7. **Output strict JSON only.** No commentary, no markdown fences, no preamble.

OUTPUT SCHEMA:

{
  "records": [
    {
      "customer": "Canonical Customer Name from roster",
      "transcript_id": "<echo the transcript_id you were given>",
      "transcript_title": "<echo the transcript_title>",
      "transcript_date": "<echo the transcript_date>",
      "attendees": [
        {"role": "doctor|alloro_team|other", "name": "<name>"}
      ],
      "status_change": null OR {
        "from": "<prior state, e.g. churn-pending>",
        "to": "<new state, e.g. recovery-underway>",
        "evidence_quote": "<verbatim from transcript>"
      },
      "resolution_events": [
        {
          "issue": "<what was broken or open>",
          "resolution": "<what was resolved>",
          "evidence_quote": "<verbatim from transcript>"
        }
      ],
      "account_health_signals": [
        {
          "signal_type": "satisfaction|concern|intent_to_renew|intent_to_churn|other",
          "polarity": "positive|negative|neutral",
          "confidence": "low|medium|high",
          "evidence_quote": "<verbatim from transcript>"
        }
      ],
      "mentions": [
        "<free-text thing named that is not an event, e.g. 'Caroline mentioned as referral source'>"
      ],
      "extraction_notes": [
        "<your reasoning trail, especially for low-confidence inferences>"
      ]
    }
  ]
}

If no roster customer is in the transcript, return: {"records": []}.`;

function buildUserMessage(transcript: FirefliesTranscript): string {
  return [
    `TRANSCRIPT METADATA:`,
    `transcript_id: ${transcript.id}`,
    `transcript_title: ${transcript.title}`,
    `transcript_date: ${transcript.date}`,
    `duration_seconds: ${transcript.duration}`,
    `attendees: ${transcript.attendees.map((a) => a.name).join(", ")}`,
    ``,
    transcript.summary ? `FIREFLIES AUTO-SUMMARY:\n${transcript.summary}\n` : `(no Fireflies auto-summary available)\n`,
    `FULL TRANSCRIPT TEXT:`,
    truncateTranscript(transcript.fullText),
  ].join("\n");
}

/**
 * Validate that an evidence quote appears in the transcript text via
 * substring match. Case-insensitive; whitespace-tolerant (collapses runs
 * of whitespace before comparing).
 */
export function evidenceQuoteInTranscript(
  quote: string,
  transcriptText: string,
): boolean {
  if (!quote || typeof quote !== "string") return false;
  const normalize = (s: string) =>
    s.toLowerCase().replace(/\s+/g, " ").trim();
  const normalizedQuote = normalize(quote);
  const normalizedTranscript = normalize(transcriptText);
  if (normalizedQuote.length < 4) return false; // reject implausibly short "quotes"
  return normalizedTranscript.includes(normalizedQuote);
}

/**
 * Validate one extraction record against the source transcript.
 * Returns a sanitized copy of the record with quote-failing events dropped.
 * If the customer is not in the roster, returns null (caller drops record).
 */
export function validateExtractionRecord(
  record: ExtractionRecord,
  transcript: FirefliesTranscript,
): ExtractionRecord | null {
  if (!lookupRosterEntry(record.customer)) {
    console.warn(
      `[ROSTER_MISMATCH] extractor returned non-roster customer "${record.customer}" from transcript ${transcript.id}; dropping record`,
    );
    return null;
  }

  const statusChange: StatusChangeRecord | null =
    record.status_change &&
    evidenceQuoteInTranscript(record.status_change.evidence_quote, transcript.fullText)
      ? record.status_change
      : null;

  if (record.status_change && !statusChange) {
    console.warn(
      `[EVIDENCE_VERIFICATION_FAIL] status_change quote not found in transcript ${transcript.id} for ${record.customer}; dropping status_change`,
    );
  }

  const resolutionEvents: ResolutionEventRecord[] = [];
  for (const ev of record.resolution_events || []) {
    if (evidenceQuoteInTranscript(ev.evidence_quote, transcript.fullText)) {
      resolutionEvents.push(ev);
    } else {
      console.warn(
        `[EVIDENCE_VERIFICATION_FAIL] resolution_event quote not found in transcript ${transcript.id} for ${record.customer} (issue=${ev.issue}); dropping event`,
      );
    }
  }

  const accountHealthSignals: AccountHealthSignal[] = [];
  for (const sig of record.account_health_signals || []) {
    if (evidenceQuoteInTranscript(sig.evidence_quote, transcript.fullText)) {
      accountHealthSignals.push(sig);
    } else {
      console.warn(
        `[EVIDENCE_VERIFICATION_FAIL] account_health_signal quote not found in transcript ${transcript.id} for ${record.customer} (type=${sig.signal_type}); dropping signal`,
      );
    }
  }

  return {
    customer: lookupRosterEntry(record.customer)!.canonical_name, // canonicalize
    transcript_id: record.transcript_id || transcript.id,
    transcript_title: record.transcript_title || transcript.title,
    transcript_date: record.transcript_date || transcript.date,
    attendees: record.attendees || [],
    status_change: statusChange,
    resolution_events: resolutionEvents,
    account_health_signals: accountHealthSignals,
    mentions: record.mentions || [],
    extraction_notes: record.extraction_notes || [],
  };
}

/**
 * Extract structured records from a single transcript via the LLM.
 * Returns 0+ records (0 if no roster customer is involved).
 *
 * Failure modes are logged but do not throw:
 *   - LLM returns no JSON or malformed JSON -> [EXTRACTION_PARSE_FAIL], returns []
 *   - LLM returns record with non-roster customer -> [ROSTER_MISMATCH], record dropped
 *   - LLM returns record with quotes not in transcript -> [EVIDENCE_VERIFICATION_FAIL],
 *     offending events dropped but record retained
 */
export async function extractFromTranscript(
  transcript: FirefliesTranscript,
): Promise<ExtractionRecord[]> {
  let result;
  try {
    result = await runAgent({
      systemPrompt: EXTRACTOR_SYSTEM_PROMPT,
      userMessage: buildUserMessage(transcript),
      model: EXTRACTOR_MODEL,
      maxTokens: 8192,
      temperature: 0,
      // No prefill: Sonnet 4.6 rejects assistant prefill; the runAgent JSON
      // extractor handles markdown fences and stray prose.
      cacheSystem: true, // system prompt is stable; cache it across transcripts in this run
    });
  } catch (err) {
    console.error(
      `[EXTRACTION_LLM_ERROR] LLM call failed for transcript ${transcript.id}: ${(err as Error).message}`,
    );
    return [];
  }

  if (!result.parsed) {
    console.warn(
      `[EXTRACTION_PARSE_FAIL] could not parse JSON from extractor for transcript ${transcript.id}`,
    );
    return [];
  }

  const records = (result.parsed as { records?: unknown[] }).records;
  if (!Array.isArray(records)) {
    console.warn(
      `[EXTRACTION_PARSE_FAIL] extractor returned object without records array for transcript ${transcript.id}`,
    );
    return [];
  }

  const validated: ExtractionRecord[] = [];
  for (const raw of records) {
    const candidate = validateExtractionRecord(raw as ExtractionRecord, transcript);
    if (candidate) validated.push(candidate);
  }
  return validated;
}
