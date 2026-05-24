# Fireflies-to-Substrate Pipeline (Spec)

**Status:** Draft for Corey + CW (Claude Web, the browser-side strategic-mirror Claude) review. Architecture only; build implementation deferred to a future session after approval.
**Author:** CC (Claude Code, the in-terminal engineering Claude). 2026-05-23, wave1-ship-prep follow-up session.
**Companion doctrine:** AP-8 (the substrate-stale anti-pattern: any claim must be verified against current code AND current runtime before it is asserted, since yesterday's belief becomes today's misinformation if not re-anchored).

## 1. The gap this closes

State of Now (the Notion page every Alloro Claude reads at session start, locked 2026-05-23 as the Five-Claude Shared Substrate, where "Five-Claude" means the five surfaces: CC in terminal, CW in the browser, Cowork as the project-management Claude, Jo's Claude, and Dave's Claude) currently has five sections. Section 2 (Active customer state) is the per-customer rollup that every Claude reads to know who is who.

Today, Section 2 has two structural weaknesses:

1. **No real-time refresh mechanism.** Section 2 is updated manually by Jo (with CC and CW appending product-side events). Two of five customers are flagged "Current state unknown to CW; Jo or Corey to populate" as of session-open today, which means cross-team Claudes are reading partial data on those customers.
2. **Product/technical state only, no relationship signal.** When Jo finishes a customer call and the substance lives only in the Fireflies transcript, no Claude reading State of Now at session start knows the outcome. Saif's churn-recovery state, a Caroline objection, a Caswell duplicate-org workaround Jo described to the customer on a call: all of it is invisible to the substrate until someone hand-summarizes it into Section 2.

This pipeline turns Fireflies transcripts into proposed Section 2 deltas that a human approves before the substrate sees them. It does not auto-update the substrate; the approval gate is mandatory by design.

## 2. Pipeline shape (data flow)

```
Fireflies (source)
  -> Window selector (last N hours, default 24, configurable to 48)
  -> Per-transcript extractor (LLM, model per AR-003)
  -> Per-customer aggregator (groups extracted events by practice)
  -> PROPOSED bullet generator (shapes output to Section 2 format)
  -> Review queue (Notion page or repo file; both options below)
  -> Human approval gate (Corey or Jo)
  -> Section 2 committer (writes approved bullets to State of Now)
  -> Event log appender (audit row per commit)
```

Seven stages, six between Fireflies and the substrate. The approval gate is the only stage that requires a human. Every other stage is automatable but should not auto-trigger end-to-end on day one; the spec sequences a manual-trigger MVP before any cron.

## 3. Input layer

**Source.** Fireflies via the existing Fireflies MCP (`mcp__claude_ai_Fireflies__fireflies_get_transcripts` to list, `mcp__claude_ai_Fireflies__fireflies_get_transcript` to fetch detail, `mcp__claude_ai_Fireflies__fireflies_search` for keyword scope, `mcp__claude_ai_Fireflies__fireflies_get_summary` for the auto-summary). The MCP is already connected to this Claude session; no new auth surface needed.

**Window.** Default 24 hours. Configurable to 48 for catch-up runs after a missed cycle. Configurable upward to a custom range when the operator names a reason (covering a vacation gap, re-running after a pipeline failure). Hard upper bound: 7 days, since older transcripts have already been hand-summarized into Section 2 or are no longer load-bearing for substrate freshness.

**Filter.** Limit transcripts to meetings whose attendee list intersects the active customer roster maintained in Section 2. A Fireflies recording of an internal Alloro team standup does not feed Section 2; only customer calls do. The active customer roster is parsed from Section 2 itself at run time (the first word of each bullet is the practice name; the Section 2 owner field in the header confirms scope).

**Edge cases the input layer must handle:**
- A transcript exists but the Fireflies summary has not finished generating. Fall back to the raw transcript; tag the output with a "transcript-only, no summary" marker so the reviewer knows the extraction had no pre-summary scaffold.
- A meeting has multiple customers (rare, e.g. a joint call). Generate one PROPOSED bullet per customer, both linked to the same source transcript.
- A meeting was internal but a customer was Cc'd on the invite without attending. Skip; the filter checks attendance, not invite list.

## 4. Processing layer (extraction)

Per transcript, an LLM extracts a structured event set per customer. Model selection follows AR-003 (Alloro's multi-model orchestration architecture decision: Opus 4.7 for strategic reasoning, Sonnet 4.6 for bulk content generation, Haiku 4.5 for high-volume polling and classification). Extraction is bulk classification with structured output; default to Sonnet 4.6.

**Extraction schema (one record per customer per transcript):**

```yaml
customer: "Saif Endodontics"            # matched against Section 2 roster
transcript_id: "fireflies://abc123"     # source link
transcript_date: "2026-05-23T14:30:00Z"
attendees:
  - role: "doctor"
    name: "Saif"
  - role: "alloro_team"
    name: "Jo"
status_change:                          # nullable
  from: "churn-pending"
  to: "recovery-underway"
  evidence_quote: "Jo, I want to give this another month."
resolution_events:                      # array, may be empty
  - issue: "GBP connection blocked"
    resolution: "Jo walked through OAuth re-grant; doctor completed during call"
    evidence_quote: "Done, I can see it now."
account_health_signals:                 # array, may be empty
  - signal_type: "satisfaction"
    polarity: "positive"
    confidence: "high"
    evidence_quote: "This is the first dashboard I have actually used in months."
  - signal_type: "concern"
    polarity: "negative"
    confidence: "medium"
    evidence_quote: "I am not sure my associate will use it."
mentions:                               # things named that are not events
  - "Caroline (referral source) mentioned as next prospect"
  - "Next call: doctor's request, no date set"
extraction_notes:                       # the LLM's reasoning trail
  - "Inferred recovery-underway from explicit 'another month' commitment; flagging as high confidence."
```

**Why this shape.** Each field maps to something Section 2 cares about: status tag, dated event line, free-text note. The structured intermediate lets the bullet generator format consistently and lets the audit log point to evidence quotes rather than re-summarizing.

**Voice constraints on the extractor prompt.** The extractor prompt must instruct the LLM to (a) quote evidence verbatim (no paraphrase) for each event, (b) flag low-confidence inferences explicitly, (c) never invent a customer name not in the active roster, (d) never propose a status tag (`CHURN-RISK`, `RECOVERY-UNDERWAY`, etc.) without an evidence quote. The extractor is a stenographer, not an analyst. Analyst judgment lives at the approval gate.

**Failure mode: the extractor hallucinates an event.** Mitigation is the evidence-quote requirement: every status change, resolution event, and account health signal must carry a quote from the transcript. The aggregator validates that every quote appears in the source transcript text (substring match); records that fail validation are dropped with a logged warning, not surfaced to the reviewer.

## 5. Aggregator and output layer

The aggregator groups extracted records by customer, merging multiple transcripts in the window into one PROPOSED bullet per customer. Within a customer, the most recent event wins for status; resolution events and signals accumulate.

**Output format (one PROPOSED bullet per customer, matching the current Section 2 shape):**

```
PROPOSED [from Fireflies, 2026-05-23 17:00 UTC by [CC]]: [Practice Name] ([Contact First Name]): [Vertical], [City ST]. [STATE TAG IN CAPS if changed, else preserve prior tag]. [2026-05-23 event line]: [resolution event or signal, with evidence quote in parens]. Source: [fireflies-link]. Replaces current bullet from [date of last manual update] if approved.
```

**Worked example (illustrative, not a real Saif event):**

```
PROPOSED [from Fireflies, 2026-05-23 17:00 UTC by [CC]]: Saif Endodontics (Saif): endodontics, [city ST]. RECOVERY-UNDERWAY (was CHURN-PENDING). 2026-05-23 call with Jo resolved GBP-OAuth block (doctor: "Done, I can see it now."); doctor committed to "another month" trial; satisfaction signal positive ("first dashboard I have actually used in months"); associate-adoption concern flagged. Source: fireflies://abc123. Replaces current bullet from 2026-05-22 if approved.
```

**Two output destinations to choose between (pick one at build time, do not ship both):**

- **Option A: PROPOSED bullets land in a dedicated Notion page.** A sibling page to State of Now titled "Section 2 Proposals (Pending Review)". Reviewer reads the page, approves entries, and the committer copies approved entries into Section 2 with the PROPOSED prefix stripped and the signature swapped to whoever approved.
- **Option B: PROPOSED bullets land in a repo file at `tmp/section-2-proposals/YYYY-MM-DD.md`.** Reviewer reads the file, comments approve/reject inline, the committer parses approvals and writes to Section 2.

**Recommendation: Option A (Notion).** Three reasons. (a) Jo lives in Notion and does not regularly open the repo; Option B routes around her. (b) The approval gesture (clicking an approve toggle on a Notion page) is faster than running a CLI command. (c) The State of Now substrate is in Notion already; the proposal page sits next to it in the same surface, which matches the reader's mental model. Option B is the fallback only if Notion API write reliability degrades.

## 6. Approval gate

Mandatory human review before any bullet reaches State of Now. Only Corey or Jo can approve. The gate enforces three rules:

1. **Identity check.** Approver signature must match `[Corey]` or `[Jo]`. CC, CW, Cowork, Dave's Claude, and Jo's Claude cannot approve; they can only propose. (Yes, Jo's Claude cannot approve on Jo's behalf. The signature must be Jo herself, since the approval is the substrate trust anchor.)
2. **Evidence check.** Approver implicitly confirms the evidence quotes are accurate by approving; the proposal page links to the source transcript inline so the check is one click away.
3. **Edit-on-approval.** Approver may edit the bullet text during approval; the committer respects the edited text, not the original PROPOSED text. The audit log records both versions.

**Approval surface (Notion page):**

```
[PROPOSED 2026-05-23 17:00 UTC by [CC]] [bullet text]
  [ ] Approve as-is        signed by: ___
  [ ] Approve with edits   edited text: ___    signed by: ___
  [ ] Reject               reason: ___    signed by: ___
```

**Rejection.** A rejected proposal is logged with the rejection reason, removed from the proposal page, and not retried automatically. If the next run produces the same proposal again, it appears fresh; the rejection log is one-time.

**Stale proposals.** A proposal not approved or rejected within 72 hours is auto-archived (moved to a sibling page "Section 2 Proposals (Archived)") with an `[AUTO-ARCHIVED, STALE]` tag and not re-proposed unless the source event recurs. Why 72: long enough that a weekend or vacation does not auto-archive everything (note: weekday-agnostic phrasing per the no-business-hours doctrine); short enough that the proposal page does not accumulate cruft.

## 7. Substrate event log

Every approved commit to Section 2 appends one row to a Section 2 Event Log (new Notion page, sibling to State of Now). The log is append-only, never edited, and exists for audit.

**Event log row format:**

```
2026-05-23 17:18 UTC | customer: Saif Endodontics | committer: [Jo] (approved [CC]'s PROPOSED) | source: fireflies://abc123 | event_summary: status RECOVERY-UNDERWAY; GBP-OAuth resolved | edits_applied: minor (changed "another month" to "30-day trial extension") | prior_bullet_archived_to: [Section 2 History page, 2026-05-22 snapshot]
```

The event log gives any Claude reading Section 2 the answer to "where did this come from and when?" without parsing the bullet itself. It also gives Corey and Jo a single surface to scan when they want to audit recent substrate changes.

**Retention.** Event log is permanent. Section 2 History page snapshots the prior bullet text before each replacement and is also permanent. Storage cost is trivial; substrate trust depends on full traceability.

## 8. Failure modes and what happens

| Failure | Detection | Behavior |
|---|---|---|
| Fireflies MCP unavailable | MCP call returns error | Pipeline run aborts; logs `[PIPELINE_ABORT_FIREFLIES_DOWN]`; no proposals generated; no Section 2 change |
| Extractor LLM returns malformed JSON | Schema validation fails | Drop that transcript's extraction; log `[EXTRACTION_PARSE_FAIL]` with transcript ID; continue with other transcripts in window |
| Extractor hallucinates a customer not in roster | Roster cross-check fails | Drop the record; log `[ROSTER_MISMATCH]` with the hallucinated name |
| Evidence quote not found in transcript text | Substring validation fails | Drop the record; log `[EVIDENCE_VERIFICATION_FAIL]` |
| Notion proposal page write returns 409 | HTTP 409 conflict | Retry once with jitter (use the substrateWriter pattern already in `src/services/notion/substrateWriter.ts`); on second failure log `[PROPOSAL_WRITE_CONFLICT]` and surface to operator |
| Two proposals for the same customer in same window | Aggregator dedup | Merge events into a single bullet, most recent status wins; no duplicate bullets |
| Approver edits introduce a banned construct (em-dash, etc.) | Voice check on edited text pre-commit | Block the commit; surface the violation to the approver; require re-edit (this is one of the few places the voice check is BLOCK, not FLAG, since the substrate carries doctrine and must pass its own rules per the 2026-05-23 doctrine entry 14) |

## 9. Build sequencing

Build is deferred to a future session after Corey + CW review this spec. When build does begin, sequence in this order to keep blast radius Green throughout:

1. **Extraction prototype, Notion-output-only.** Hard-coded one-customer test (Saif); manual trigger; output a JSON file to `tmp/`; review the extracted shape before any Notion write. Validates the LLM extraction quality with zero substrate risk. Two hours of build.
2. **Proposal page write, dry-run.** Add Notion write to a throwaway test page; verify the bullet shape renders correctly; do not point at the real Section 2 substrate yet. One hour.
3. **Approval gate, manual.** Build the approval-page format; have Corey or Jo approve one real proposal; the committer is a CLI command run by CC, not automated. Two hours.
4. **Event log writer.** Append-only log writes on commit; verify rows appear correctly. One hour.
5. **Window selector and aggregator.** Now wire up the full 24-hour window, all customers; still manual trigger; still gate-mandatory. Two hours.
6. **Cron, daily, off-hours.** Only after steps 1-5 prove stable for one week of manual runs. Daily run produces proposals; review surface still requires human approval. (Frequency configurable; daily is the baseline.) One hour to wire.
7. **Hourly during active customer days.** Only after a daily cadence proves stable. This is the long-term cadence target, but step 6's daily run is the MVP and may suffice for months.

Total estimated build: 9 hours across the seven steps, single-engineer. Stop after any step if the output quality degrades.

## 10. Out of scope (deliberately)

- **Slack messages and email as input sources.** Same gap exists there, but the input layer for those is different (no MCP equivalent to Fireflies that returns structured transcripts). Future work.
- **Direct Section 2 writes without the approval gate.** Auto-approval is a substrate-trust hazard; the gate is the point of the pipeline. If auto-approval becomes desirable (after months of high precision), revisit then.
- **Updating sections other than Section 2.** Section 3 (Active priorities) and Section 5 (Pending decisions and blockers) could also benefit from transcript-driven proposals, but each has a different shape and different owners. Out of scope for v1; treat as a sequel spec.
- **Closed-loop learning (the extractor learns from approval/rejection patterns).** Tempting and probably valuable, but a v2 concern. v1 is a stenographer with a human in the loop; that is enough to close the freshness gap.
- **Notion comment threads as approval signal.** Considered and rejected; the explicit approve/reject checkboxes are clearer than parsing comment intent.

## 11. North Stars check (NS-001)

NS-001 is the Alloro two-North-Stars decision filter: NS1 (undeniable value per customer) and NS2 (inevitable path to unicorn). Every build the team greenlights must move at least one.

This pipeline serves NS2 (inevitable path to unicorn). Reasoning: the bottleneck on scaling the customer base is the substrate's freshness, since cross-team Claudes cannot coordinate on a customer whose state they do not know. Closing the freshness gap removes a coordination tax that compounds as the customer count grows. NS1 (undeniable value per customer) is indirect: a faster-coordinating team ships fixes faster, which the customer experiences as responsiveness, but the customer never sees this pipeline directly.

## 12. Open questions for Corey + CW

1. **Notion page vs. repo file for the proposal surface.** Spec recommends Notion (Option A). Confirm or override.
2. **Approval signature: Corey or Jo only.** Confirm that no other surface (CW for product-side events, Dave for technical-side events) gets approval authority. The strict version is doctrine-clean; a less-strict version (CW approves product-side, Jo approves all) is operationally lighter but introduces ambiguity at handoffs.
3. **First-customer scope for the prototype.** Spec assumes Saif as the test customer (since the Saif churn-recovery state is a current Section 2 entry and a fresh transcript is likely available). Alternative: a customer whose Section 2 entry is currently the "unknown to CW" placeholder, since the freshness gap is bigger there.
4. **Cron timing if the pipeline gets to step 6.** Spec proposes daily. Confirm. (Hourly during active-customer days, step 7, is a later choice.)
5. **Build session ownership.** Spec assumes CC builds. Alternative: CW writes the extractor prompt (since CW does prompt-engineering work elsewhere in the substrate), CC builds the I/O scaffolding around it. Joint build is also viable; same fewer-handoff principle that already governs CC + CW coordination.

## 13. Provenance and verification log

- Section 2 shape verified at session-open 2026-05-23 via Notion API read of State of Now (page id `369fdaf1-20c4-81c6-98bf-df4c0b32c556`); five customer bullets confirmed, two flagged "unknown to CW; Jo or Corey to populate".
- Fireflies MCP tool availability verified in-session via the deferred-tool-search surface (`mcp__claude_ai_Fireflies__fireflies_get_transcripts` and siblings).
- AR-003 multi-model orchestration policy verified against `CLAUDE.md` (Architecture section) at session-open.
- The substrate writer with 409 retry referenced in section 8 verified at `src/services/notion/substrateWriter.ts` (commit `2f1933a5` on wave1-ship-prep, shipped earlier this session, currently in PR #105 awaiting Dave merge).
- The two Section 2 placeholder customers (Garrison Orthodontics, Coastal Endodontic Studio) verified in the Section 2 read; both currently carry the "unknown to CW" tag.
- No claims in this spec depend on cross-session memory without in-session verification; AP-8 compliant.
