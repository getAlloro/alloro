# START HERE — Alloro done-for-you build (the map for Dave + his Claude)

*2026-07-08. The single front door to this repo. Read this first: it tells you what to read, in what order, how the pieces fit, what is still open, and what lives outside this box. If another doc calls itself "the index" or "the single source," it means the single source for ITS slice — this file is the map over all of them.*

## What you are receiving, and what you are expected to do
**What this is:** the complete build inputs for Alloro's done-for-you attraction engine — the strategy behind it, a spec for each piece, and the honest state of what is built vs not. It is NEW information for you. It does NOT touch how you run your own systems, branch, or conventions — those are yours, and this assumes you know them.
**What you are expected to do with it:** build the engine in slices — the honest-say chapters first, then the value levers (the mental model below). You decide sequence and batching against your own read of the branch; the specs tell you WHAT each piece must be and WHY (the owner/clarity intent you would otherwise have to reverse-engineer), with every code anchor verified against `origin/dev/dave`. Where a decision is owed to Corey (the OPEN list below), do NOT guess — flag it. Nothing here dictates HOW to code; it is what to build, why, and what is true.

## What this repo is
The build inputs for Alloro's done-for-you ATTRACTION engine: the journey from a stranger's first impression (Google Business Profile / search / SEO) through the website to a submitted contact form and a booking. Every doc here is either the WHY (frame/strategy), the WHAT (build specs), or the GUARDRAILS (what is honest to claim).

## The mental model — read this or nothing else lands right
The engine has two halves, in two separate doc-families you build in order:

1. **SAY it honestly** — the "inversion" chapters (Ch1-7). They make what the dashboard SAYS true and specific: kill fabricated numbers, show honest states, one verdict + one move. Cheap, in-repo, no external dependency.
2. **DO it for them** — the "MAGIC" value-levers. They make the engine actually DELIVER the value it points at: request the review, respond to the lead, close the search-to-content loop, book the appointment, attribute the win. This is what makes it "done-for-you" instead of "honest advice."

The card RECOMMENDS the move (Family 1); the lever DOES the move and attributes the lift (Family 2). A dashboard without levers is honest advice, not a done-for-you engine. **Build order: honest-say first (it is cheap, and it is the contract the levers report into), then the levers.**

## Read in this order

**0. This file.**

**1. The frame (why any of this):**
- `strategy/the-engine.md` — the vision: Alloro as the physician of business health; the value ceiling + the 4 moves that uncap it.
- `strategy/self-proving-loop.md` — the competitive thesis: value + trust welded by clinical honesty; the current-to-target bridge.

**2. How we work + the honest state of play:**
- `specs/DAVE-CLAUDE-HANDOFF.md` — how-we-work, product direction, honest state, and the start-here for the INVERSION engine (Family 1).
- `strategy/canon-to-stake.md` — what is DECIDED vs what is still owed to Corey. Read before assuming a decision is made.
- `guardrails/built-vs-unbuilt-capabilities.md` — the code-verified list of what Alloro HAS and HAS NOT built. Load before writing any customer-facing spec or copy.

**3. Family 1 — SAY it honestly (the inversion chapters):**
- `specs/inversion-map.md` — the index of the 7-chapter build + proof status.
- `specs/inversion-01-data-truth.md` through `specs/inversion-07-verdict-and-one-thing.md` — the chapters in order (Ch1 shipped as PR #145; see build state below).
- `specs/inversion-02-card-standard.md` — the card quality bar + the unified card type every chapter reports into.

**4. Family 2 — DO it for them (the MAGIC value-levers):**
- `specs/dave-build-handoff.md` — **the per-lever build briefs** (what / why / files / done-check for all 9 levers). The detailed handoff.
- `specs/magic-operational-build-list.md` — **the same 9 levers as a priority-tiered list** (Tier 0-3). Use it to sequence; use `dave-build-handoff.md` for the per-lever detail. Two views of one lever set.
- `strategy/connect-lever-audit.md` — the code audit behind the levers: what is built vs the 9 proven players (the file:line receipts).
- `strategy/acquisition-mechanism-model.md` — the cited science of WHY the levers work (speed-to-lead, discovery-to-advocacy).

**5. Specific de-risked briefs (build when you reach them):**
- `specs/reflect-decouple-build-brief.md` — decouple the monthly Reflect pipeline from PMS import (PARKED per Corey).
- `specs/reviews-dose-calculator.md` — the reviews "dose" dashboard feature (greenfield, buildable).
- `specs/audit-pillar-overclaims-spec.md` — prompt edits so the free audit stops recommending unbuilt capabilities.

## Prior art — the two repos you already have access to
- **alloro-checkup** — a FROZEN front-end prototype + API contract for the public "health-score / Checkup" acquisition funnel (scan -> score -> email-gate lead capture). `DAVE_INTEGRATION.md` is a ready-to-implement blueprint for `/api/checkup/scan` + `/api/checkup/unlock` (request/response shapes, Redis cache-key format, Google Places field lists, brand tokens). It is the top-of-funnel front door. Caveat: UI + spec only, NO backend code, all data mocked (March 2026). REFERENCE it when you build the public audit / lead-magnet funnel.
- **alloro-dreamteam** — NOT reusable runtime. A Claude-Code prompt-pack + strategy prose, abandoned after a 26-hour burst (March 2026). No agent runtime, no task queue, no scheduler in code. Copy forward only two patterns: `agent_docs/checkup-pipeline/webhook-handler.js` (intake -> instant 200 -> async Slack+Notion notify, a clean no-human-contact lead-capture shape) and `run-intelligence-agent.sh` (`claude --print` headless-runner-on-cron). **Honest implication: the no-human-contact levers are greenfield — there is no existing agentic engine to inherit; you build the automation fresh. These two snippets are patterns, not infrastructure.**

## OPEN — decisions and designs owed BEFORE certain levers can build (the screws not in the box)
> **Feasibility first (the bluntest gate):** three of the nine levers are BLOCKED on access Alloro does not have today — review requests (no patient contact list + no send channel), booking (no scheduler integration), and call-tracking (no phone service). They are not "unbuilt"; they are un-buildable until Alloro acquires that access, which is a strategy/cost decision for Corey, not a build task. Verified gate: `specs/dave-build-handoff.md` (FEASIBILITY GATE). Buildable-now set: GSC->content, form security, speed-to-lead, Reflect decouple, web-attribution; AEO + keyword research need only an external API key.

Nothing here is a hidden assumption; these are the known blanks. Several are Corey's to stake, not yours to guess:
- **Speed-to-lead response content is undesigned** (`specs/dave-build-handoff.md:50`). "Design-first — a hollow auto-reply is worse than silence." The valuable response is not written. Design it (or get it from Corey) before building.
- **Booking has no chosen path** (`specs/dave-build-handoff.md:56`). No vendor (Calendly / Acuity / NexHealth / etc.), no data model, no PMS write-back. Decide before building.
- **Attribution rail (Ch5b) is named, not specced** (`specs/inversion-05-bookable-leads-screen.md`). The three pieces (booking/outcome record, visitor-id on submission, session-to-submission-to-booking join) are listed; no schema. This is the moat piece, and it is a blank.
- **AEO is headline-only** (`specs/dave-build-handoff.md:38`). Which engines, how to query, how to detect a citation, the data model — all owed.
- **Review-requests: provider + trigger + template unresolved** (`specs/dave-build-handoff.md:29`). SMS provider unchosen; non-PMS customers have no "completed visit" signal to trigger on; owner-approved template not written.
- **Human stakes owed to Corey** (`specs/DAVE-CLAUDE-HANDOFF.md:75-76`): Ch5a auto-ack toggle default + copy; whether Ch6's review-ask is an owner-capable action or must stay pure read-only; and the "pushed digest" owner-glance surface the cards assume but that is NOT built (scope the fixes to the logged-in surface, or build the digest).
- **The own-the-rail / PatientPop timing call** (`strategy/the-engine.md`, `strategy/canon-to-stake.md`): is booking + attribution the NEXT slice or the ceiling? "Presence-only scales" is NOT settled. This could reorder the whole build; it is Corey's.
- **Phase-0 route-selectors are unmeasured** (`strategy/company-pathophysiology.md:18`): gross margin per customer + real runway are unknown, and they select which route to build. Measure before committing the sequence.
- **The simulation "ONE DATA ASK"** (`specs/DAVE-CLAUDE-HANDOFF.md:102`): a human must produce an anonymized data-shape snapshot before the honesty / fixtures harness can run for real.

## Pointers that leave this box (and how to resolve them)
A few docs reference things not in {this repo + the alloro app repo + alloro-checkup + alloro-dreamteam}. Resolutions:
- **`DOCTRINE.md`** (cited in `strategy/ceo-visionary-operating-system.md`) — lives in the `alloro-brain` repo, which you do NOT have. It concerns the PARKED CEO/Visionary OS and does not block the attraction build. If you need it, ask Corey.
- **"Dashboard Accuracy & Trust" doc** (cited in `READ-ME-FIRST` + `specs/audit-pillar-overclaims-spec.md`) — a Notion doc you cannot open. The load-bearing content (the F1-F9 fabricated-number findings) is IN this repo at `guardrails/scan-findings-070626.md`. Use that.
- **`project_alloro_built_vs_unbuilt_capabilities`** (cited in `specs/inversion-07-verdict-and-one-thing.md`) — an auto-memory filename, not a file here. The real code-verified list is in this repo at `guardrails/built-vs-unbuilt-capabilities.md`. Use that.
- **Lattice citations** tagged "alloro-brain LOCAL, not repo-verifiable" in the inversion specs — most of those files ARE in this repo under `library/lattices/`. Check there before treating a lattice cite as unreachable.
- **"session transcript / session trail"** (cited for per-chapter verdicts + research URLs) — a chat log you cannot open; the verdicts it backs are summarized in `strategy/inversion-frame-validation.md` and the research is in `research/`.

## Current build state (PRs on getAlloro/alloro, verified 2026-07-08)
- **#145 — MERGED** (2026-07-08): Slice 1, honest dashboard numbers (Ch1 data-truth, 4 fixes). Live.
- **#146 — OPEN**: the inversion engine docs + mission + profiles handoff.
- **#147 — OPEN**, but its work is already on `origin/dev/dave` (commit `aac57428`; `sectionBuilders.ts` reads `search_position`), so the PR is effectively redundant: align Practice Hub dashboard rank with real Maps position.
- **#148 — OPEN**: Foundation + Ch2 unified card-type + Ch7 FIX 1.
- (Any doc that says #145 is "ready to merge" is stale; it is merged.)
- **Where the next NEW build starts:** the foundation (Ch2 + Ch7) is in flight as #148; the first clean stage chapter to build is **Ch3 (Findable)** or **Ch4 (Choosable)**, both fully specced, both feed the foundation selector, neither carries an open Corey decision (Ch5a and Ch6 do).

## Code-anchor accuracy (verified 2026-07-08 against `origin/dev/dave`)
All ~95 code anchors the specs cite were checked against the live branch: every file exists, no symbol has disappeared, and the symbol names are exact. A few line numbers drifted a handful of lines as the branch moved, so **anchor on the symbol name, not the line number** — grep the symbol; the line is a hint, the symbol is the contract. Known corrections worth carrying:
- **Ch1's data-truth fix has already LANDED on the branch.** The `|| 1` rank fallbacks the specs cite as a dependency are now `?? null` at the same lines. That dependency is met, not pending.
- **GSC lever (`dave-build-handoff.md`):** the query/impression data is NOT at `service.gsc-integration.ts:274` (that is `fetchSites`). The service lives at `src/controllers/admin-websites/feature-services/`; trace the data from the `historic-gsc-backfill` job (`:527`) and the 16-month const (`:17`).
- **Ch6 (`inversion-06`):** `insertRaw` is in `service.agent-orchestrator.ts` (`:164`/`:192`), not `agent-input-builder.ts`; `extractReviewSummary` is at `metricsHelpers.ts:116` (not `:144`).
- **Ch5 (`inversion-05`):** `websiteMetrics.ts:257` is `monthVisitors` (not `monthLeads`); `PlaceDataTransformService.ts:92-93` has website + phone but no hours field.
Everything else is exact or a sub-10-line shift on a correctly-named symbol.

## The one non-negotiable (from the levers doc)
Every value-lever must run WITHOUT a human touching the account (the Slack / Zoom / Claude standard). The economics only work if delivery is automated; the owner approves once where there is outbound, then it runs. Any lever that needs a human per customer is re-scoped until it does not. Full rationale: `specs/dave-build-handoff.md` (THE STANDARD).
