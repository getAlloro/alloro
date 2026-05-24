# Fireflies-to-Substrate Pipeline

Code home for the pipeline spec at `docs/fireflies-to-substrate-pipeline.md`. Greenlit by Corey via CW peer review 2026-05-23 (State of Now Section 5 item 9) with the five CW positions on the open questions applied.

## What it does

Turns Fireflies customer-call transcripts into proposed Section 2 (Active customer state) updates on the State of Now Notion page. Mandatory human approval gate (Corey or Jo only) before any write to the substrate.

## Module map

| File | Responsibility |
|---|---|
| `constants.ts` | Notion IDs, model selection, valid signatures, customer-block map |
| `types.ts` | Shared types across the seven pipeline stages |
| `roster.ts` | Customer roster + recognition-term matching |
| `transcriptSource.ts` | Pluggable transcript fetcher (MVP: JSON files in `tmp/fireflies-input/`) |
| `extractor.ts` | Per-transcript LLM extractor (Sonnet 4.6 per AR-003); substring-validates every evidence quote |
| `aggregator.ts` | Groups extractions by customer, generates PROPOSED bullets |
| `proposalWriter.ts` | Creates one Notion page per pipeline run in the Fireflies Proposals database |
| `committer.ts` | Reads approved pages, replaces Section 2 blocks, archives proposal page |
| `eventLog.ts` | Appends to Section 2 Event Log (append-only audit) |
| `voiceCheck.ts` | Pre-commit voice-doctrine check (BLOCK mode per spec section 8) |
| `section2Reader.ts` | Fetches current Section 2 bullet text for each roster customer |
| `pipeline.ts` | Orchestrator that wires the stages end-to-end (extractor through proposal write) |

The committer is intentionally a separate process from the pipeline orchestrator: a human must approve between the two.

## CLI usage

Manual trigger (per CW Q4: cron deferred until manual pattern proves out):

```bash
# Full roster, 24h window, write to Notion proposal page
npx tsx scripts/run-fireflies-pipeline.ts

# Single customer, dry run (skip Notion write)
npx tsx scripts/run-fireflies-pipeline.ts --customer "Garrison Orthodontics" --dry-run

# 72h backfill against one customer
npx tsx scripts/run-fireflies-pipeline.ts --window 72 --customer "One Endodontics" \
  --notes "1Endo backfill test"

# After Corey or Jo approves the proposal page in Notion
npx tsx scripts/commit-fireflies-proposals.ts
```

## Approval flow

1. Run the pipeline. It writes a page to the Fireflies Proposals database with PROPOSED bullets per customer (Approval=false, Committed=false).
2. Hand the page URL to Corey or Jo. They review the bullet text, edit inline if needed, then tick the Approval checkbox AND pick the Approval signature (Corey or Jo only). CC and CW cannot sign.
3. Run the committer. For each page with Approval=true, signature in {Corey, Jo}, Committed=false:
   - Read bullet text from page body (honoring any approver edits)
   - Run voice-doctrine check (BLOCK on em-dash, marketing-superlative cluster, etc.)
   - Replace the Section 2 customer block via substrateWriter (409 retry)
   - Append one row per committed customer to Section 2 Event Log
   - Mark the proposal page Committed=true, archive it

## Notion databases (locked 2026-05-24)

- **Fireflies Proposals**: `9c2bd421d9fe4716931a77a0de8e95f5` (under Content Engine parent)
- **Section 2 Event Log**: `b367d78c26e248f69b3ddff189e5755f` (sibling under Content Engine)

If either ID changes, update `constants.ts`.

## Transcript input (MVP)

For the manual-MVP phase, transcripts come from JSON files in `tmp/fireflies-input/`. CC populates this directory using the Fireflies MCP tools available in the Claude Code session (one JSON file per transcript matching the `FirefliesTranscript` shape in `types.ts`).

Future production source: a thin GraphQL client against the Fireflies API. The `TranscriptSource` interface in `transcriptSource.ts` is designed so the swap is a single-file change.

## Tests

```bash
npx vitest run tests/fireflies-pipeline/
```

42 tests cover roster matching, evidence-quote substring validation, extraction-record sanitization (drops hallucinated customers and quotes), aggregator bullet rendering, and voice-check integration.

## Failure modes covered

Per spec section 8 (also covered in code):
- Fireflies MCP / source unavailable: pipeline aborts, no proposals generated
- Extractor returns malformed JSON: drop transcript, log, continue with others in window
- Extractor hallucinates customer: drop record (`[ROSTER_MISMATCH]`)
- Evidence quote not in transcript: drop offending event (`[EVIDENCE_VERIFICATION_FAIL]`)
- Notion 409: substrateWriter handles retry with jitter
- Voice check fail at commit: abort that page's commit, surface to operator, require re-edit

## Pipeline run example

First real-data run (2026-05-24): Artful Orthodontics customer call (2026-05-20, Maria Pavlak).
- 1 transcript considered, 1 matched roster, 1 extraction record, 1 proposal generated.
- One evidence quote dropped by substring validation (LLM concatenated multiple sentences). The pipeline's hallucination guard caught it before reaching the human.
- Notion proposal page: `36afdaf1-20c4-81db-9e33-d2d86710a125`. Awaiting Corey or Jo approval to test the committer end-to-end.

## Q3 backfill finding (1Endo)

The CW Q3 position called for a backfill test against May 21-23 Fireflies transcripts mentioning 1Endo / Saif. Fireflies search across May 21-24 returned 0 results for "Saif", "1Endo", "One Endo", "endo", and "contract". The 1Endo contract resolution Corey surfaced manually was not captured in a Fireflies transcript within that window. The May 19 internal Weekly Reset transcript mentions "Set up June 4th call with Endo client" as an action item, which is likely the next scheduled 1Endo touchpoint. This is a real finding for the substrate-freshness gap: even when the pipeline ships, Fireflies-only ingestion leaves Slack and direct conversation gaps. Slack-to-Substrate is a later phase per Section 5 item 7.
