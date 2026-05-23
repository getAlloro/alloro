# CLAUDE.md -- Alloro

## Project Overview

Mission: give every business owner the life they set out to build. Alloro is a universal business intelligence platform; beachhead is licensed specialists (endodontics first). Architecture is universal; vocabulary configs handle vertical-specific UI labels. North Stars: NS1 Undeniable Value, NS2 Inevitable Unicorn, NS3 Calistoga Standard.

Source of Truth: `docs/PRODUCT-OPERATIONS.md` (Product Constitution). If code contradicts that doc, the code is wrong.

## Architecture

**Decision AR-009 (May 2, 2026, locked):** Discovery is downstream of authenticity. Every Alloro surface speaks to the patient's question, not the doctor's keyword. The product is the practice deserving the answer, not the practice ranking for the term.

**Continuous Answer Engine Loop** (architecture spec: https://www.notion.so/p/354fdaf120c481df8e62c2c34e2cfe71). Eight components run on signals, not weekly cadence: Signal Watcher, Trigger Router, Research Agent (regeneration modes), Copy Agent (regeneration modes), Reviewer Claude gate, AEO Monitor (continuous), Live Activity Feed, Live Activity rendering layer. Monday email weekly ritual stays per AR-001.

**AR-003 multi-model orchestration:** Opus 4.7 for strategic reasoning and architectural decisions. Sonnet 4.6 for bulk content generation and standard agent workflows. Haiku 4.5 for validators, classification, and high-volume polling. Every Claude API call routes through the model-selection layer; do not hardcode model strings in agent files.

**AR-008 calculation transparency:** Every user-facing deterministic calculation ships with a runtime LLM translator that renders plain-English methodology against the user's actual data. Calculation code is the source of truth; the LLM is the translator.

**Repo:** `~/code/alloro`. Working branch: `sandbox` (never push to main; the merge is Dave's).

**Structure map:**
- `src/` -- backend (Node.js, Express, Knex, PostgreSQL, BullMQ, Redis). `src/routes/` API routes (mounted in `src/index.ts`), `src/controllers/` request handlers, `src/services/` business logic, `src/workers/` BullMQ workers + `processors/`, `src/jobs/` cron jobs, `src/agents/` agent runtime, `src/database/migrations/` schema.
- `frontend/` -- React 18+, TypeScript, Vite, Tailwind, shadcn/ui. `frontend/src/pages/` routed pages (routes in `App.tsx`), `frontend/src/components/`, `frontend/src/api/` typed API client, `frontend/src/contexts/` + `hooks/`.
- `.claude/agents/` -- Dream Team agent definitions. `.claude/rules/` -- rule files loaded by this doc. `.claude/lattices/` -- static product/voice/journey/knowledge context.
- `docs/` -- Product Constitution + specs. `scripts/` -- quality gates + tooling. `tests/` -- vitest suites.

**Branch convention:** CC does not create branches on its own. If `sandbox` is the wrong branch for a task, stop and ask Corey first. When Corey approves a branch, name bug-fix branches `bug-XX-name` (e.g. `bug-01-billing`) and other branches a short kebab-case feature name.

## Team

- Corey (Founder/Visionary): generates direction, owns external relationships, approves Red blast radius
- Jo (COO/Integrator): active. Oversees Dream Team agents at the department level (CRO, CMO, CS, Product, Engineering, Voice of Client, Operations). Sections 4-5 of Three-Lane v2 deferred until Continuous Answer Engine validated across two paying clients.
- Dave (CTO, Philippines): architectural review, owns the merge. Receives finished specs only.

## Build Patterns

**Engineer Handoff Format (LOCKED -- April 11, 2026):** every spec for Dave uses the V2 card format: Card N, Blast Radius, Complexity, Dependencies, What Changes (file:change), Touches (DB/Auth/Billing/API), Verification Tests (runnable), Done Gate. Full spec in `.claude/rules/build-safety.md`. Canonical worked example: https://www.notion.so/349fdaf120c4810aa045dfa4124ffa68 (Dave Handoff Format -- April 10, 2026). Match its shape; it is canonical until superseded.

**Session types:** THINKING (explore, lock decisions, no production code), BUILD (start with locked decisions, ship Dave-ready cards), BUG TRIAGE (find root cause, fix, commit). AI infers type from Corey's opening. False clarity test: if AI cannot write a Work Order in 60 seconds, it is THINKING.

**One feature = one commit = one verifiable step.** Single discrete commits with proof files at `/tmp/`. CC ships TSC clean, build clean, tests green, then Dave reviews and merges. Last successful pace: foundation reconciliation commit `5ef1e472` shipped in 4 minutes.

**Pre-commit hard gates** (block on failure): `data-flow-audit.sh`, `content-quality-lint.sh`, TypeScript check (`tsc -b --force`). Advisory gates: `constitution-check.sh`, `vertical-sweep.sh`. Manual gate: `npm run build` in `frontend/`.

## CC Operating Preamble

Operate autonomously. Complete the full task end-to-end before asking for review. Make reasonable decisions without checking in. Fill adjacent gaps.

When a Work Order finishes:
1. Post PASS or FAIL with the result (commit hash, files changed, verification output).
2. Pull the next item and execute it without asking for direction.
3. Repeat until the queue is empty or a genuine blocker is hit.

Only stop and report when: (a) the queue is empty and all items PASS; (b) a genuine blocker needs a credential, file, or decision CC does not have; (c) something changes the scope of the current task; (d) the task is Red blast radius and needs Corey's approval before any code.

When found state contradicts how a task described it, surface that before proceeding -- do not build on the wrong premise.

## Verification Gate

No work is reported complete until it passes the gate. Before any PASS:
1. **Builds clean** -- `tsc -b --force` clean; `npm run build` in `frontend/` clean when frontend changed.
2. **Tests green** -- `npx vitest run`; new behavior has a covering test.
3. **Wired** -- the change is referenced by a route mount, worker registration, import, or cron. Unwired code is not done (see Anti-Pattern Log AP-2).
4. **Walked** -- for customer-facing surfaces, confirm what the customer actually sees, not just that it compiles.
5. **Proof** -- a proof file at `/tmp/` or pasted verification output.

Claude builds and verifies. Claude does not approve merges -- Dave reviews and merges. Full protocol: `.claude/rules/build-safety.md`.

## Deployment Pathway (LOCKED)

Sandbox EC2 auto-deploys on every push to the sandbox branch. The pipeline is working; if a sandbox feature is broken, it is a code problem, fix it directly. Never say "blocked by EC2" or "blocked by Dave" for sandbox work.

Production pathway: sandbox QA passes, Dave reviews the diff, Dave merges to main. Corey never pushes to main. CC never pushes to main. The merge is Dave's. Always.

## Notion Workspace

Notion integration: NOTION_TOKEN resolves to bot `Alloro Backend` (id `354fdaf1-20c4-819b-a8de-00278db11304`, workspace `Alloro`). Verify with `curl -s -H "Authorization: Bearer $NOTION_TOKEN" -H "Notion-Version: 2022-06-28" https://api.notion.com/v1/users/me` before any Phase 1+ task.

Four operational databases (read-write from CC):

| Database | ID | Purpose |
|----------|-----|---------|
| Sandbox Card Inbox | `ddac061f-88fe-4f5e-9863-d5be2449cf81` | Per-CC-session cards (Build B, commit `e2ed72bf`) |
| State Transition Log | `5785db54-467a-4505-9b3b-53673c940cdb` | Card state-machine audit trail (Build C) |
| Dave Sprint Inbox | `c7262a4c-2272-4e23-a79f-8929d7e8d793` | Promoted cards awaiting Dave merge |
| Reviewer Gate Audit Log | `354fdaf1-20c4-8196-9373-d78eedc29172` | Reviewer Claude verdicts (Build A) |

CC Operating Space (read at session start): https://www.notion.so/p/32dfdaf120c4819fa720f60b68ce0c0e
Decision Log: https://www.notion.so/p/327fdaf120c4816093cdd4c75d2cc6a6
Three-Lane Coordination v2: https://www.notion.so/p/354fdaf120c481069946cd7a856c4b0b

CC modifies only Corey-owned pages. Jo's and Dave's pages are read-only for cross-context.

## State Machine (Build C, commit `c6999279`)

Cards transition through ten states. Defined in `src/services/blackboard/stateTransitions.ts`.

States: `New` -> `Reviewer Gated` -> (`Reviewer Blocked` | `Jo Reviewed`) -> `Dave Queued` -> `Dave In Progress` -> `Dave Shipped` -> `Verified` -> `Archived`. `Rejected` is terminal from any pre-Dave state.

State Transition Log actor enum: `Corey`, `Jo`, `Dave`, `CC`, `ReviewerClaude`, `BridgeTranslator`, `CronVerifier`, `GitHook`. Every transition is logged with actor attribution and reason.

## Reviewer Gate

Implementation: `src/services/agents/reviewerClaude.ts`. Two functions:
- `runReviewerClaude(card)`: deterministic 8-check pass over the Build B card structure. Used in session-mode upserts.
- `runReviewerClaudeOnArtifact(artifact)`: LLM-driven review (commit `3fba7324`). Six checks per AR-002: HIPAA, Brand Voice, Irreplaceable Thing, Em-Dash, Factual Citation, Vertical Regulation.

Verdict enum: `Not Yet Run` | `PASS` | `PASS_WITH_CONCERNS` | `BLOCK`. Auto-promotion of PASS verdicts is gated by blast radius (Red always pauses for Corey). PASS_WITH_CONCERNS routes to Jo. BLOCK routes to Corey for revision.

No regeneration ships to a doctor-facing surface without passing the gate.

## Session Cycle

Session start:
0. **Fetch the Alloro — State of Now page first, before any other action.** URL: https://www.notion.so/Alloro-State-of-Now-369fdaf120c481c698bfdf4c0b32c556. Read all five sections (current state, customer state, active priorities, doctrine refs, pending decisions). Note each section's last-updated timestamp. Sign the Last-Read Log on the page with `[CC] YYYY-MM-DD`. If the page can't be fetched, name that fact in the response before answering anything else. This is the shared substrate read by every Claude (CC, CW, Cowork, Jo's Claude, Dave's Claude) at session start — locked 2026-05-23 per the Five-Claude Shared Substrate proposal.
1. Infer session type from Corey's opening (THINKING / BUILD / BUG TRIAGE).
2. `git branch --show-current && git status --short`.
3. `export SESSION_ANCHOR_COMMIT=$(git rev-parse HEAD)`. Bridge Translator session-mode reads this at session end.
4. Read `CURRENT-SPRINT.md` (GPS) + `docs/PRODUCT-OPERATIONS.md` (Constitution).
5. If BUILD: read `memory/context/session-contract.md` (decision-lock questions).

Session end (BUILD sessions that produced commits):
```bash
SESSION_ANCHOR_COMMIT=<sha-from-start> npx tsx scripts/run-bridge-translator.ts --session
```
Zero commits = zero cards. Same Card ID = update in place. Cards land in Sandbox Card Inbox; Reviewer Claude runs per card; State Transition Log captures every event.

## Voice Constraints

Implementation and full banned-phrase list: `src/services/narrator/voiceConstraints.ts`. Categories blocked: em-dashes (and en-dashes); promotional puffery (the marketing-superlative cluster); empty-verb hype (the SaaS-launch-deck cluster); Alloro-as-hero framings ("we saved you"); shame framings ("you're behind"). Read the source file before producing any narrator or customer-facing copy; the regex set is the spec.

Never show AI-generated recommendations to customers without human review. Show data (reviews, ratings, completeness, citations); hide advice. HIPAA check, factual accuracy check, recommendation-vs-fact check, and "would a doctor see through this" check before any AI text reaches a customer.

UI/typography: minimum font `text-xs` (12px); maximum weight `font-semibold`. Do not use `#212D40` for text; use `#1A1D23`.

## Standing Rules

- Never push to main directly
- Never commit credentials
- No fabricated content; every claim traces to verified data (PR-005)
- One feature = one commit = one verifiable step
- Universal language in core docs and code; vertical-specific only in vocabulary configs (L-001)
- Dave receives finished specs only, never rough ideas
- Every external-facing string passes Reviewer Claude before publish (AR-002)
- Before building, check the Anti-Pattern Log (`.claude/rules/anti-patterns.md`); do not repeat a logged failure. Add an entry when a session uncovers a new repeatable failure.

## Open Loops

- Active n8n call sites: 9 backend paths still POST to `ALLORO_N8N_WEBHOOK_URL`. Findings: `/tmp/n8n-sweep-2026-05-02.md`. Pending Corey decision (missed retirement vs deliberate stub).
- Notion connector "N8N Integration" rename to "Alloro Claude Code" pending Corey UI step.
- main branch CLAUDE.md is pre-foundation. Updates land naturally with the next sandbox->main merge by Dave.

## Rules (loaded automatically)

@.claude/rules/task-routing.md
@.claude/rules/build-safety.md
@.claude/rules/information-architecture.md
@.claude/rules/anti-patterns.md
@.claude/lattices/alloro-context.md
