# Weekly Website Performance Summary Agent

## Why
The new Website overview shows the numbers, but owners still have to interpret them. A short, plain-English **weekly** summary ("traffic up 18%, 4 new leads, conversion holding at 6%") turns the dashboard data into a takeaway. It reuses the existing scheduled-agent system (Proofline/Ranking) — no new infra.

## What
A **weekly** scheduled agent that, per onboarded org with a website + active Rybbit integration, compares this week vs last week (traffic + leads + conversion), asks the LLM for an owner-readable summary, and stores it in `agent_results` (`agent_type = "website_summary"`). A user-facing endpoint returns the latest summary, surfaced as a "This week" insight on the Website overview.

**Done when:** the weekly schedule runs the agent, a per-org summary lands in `agent_results`, `GET /user/website/summary` returns the latest, and the overview shows it (with graceful empty/loading states). `npx tsc -b` passes; the agent isolates per-org failures.

## Context

**Decisions (locked with Dave):** weekly cadence (not daily); surface on the Website overview.

**Reuse — existing scheduled-agent pattern:**
- Scheduler: `schedules` table → tick → `scheduleExec.processor.ts` → `getAgentHandler(agent_key)` → handler → save `schedule_runs`. ([scheduleExec.processor.ts](src/workers/processors/scheduleExec.processor.ts))
- Registry: [src/services/agentRegistry.ts](src/services/agentRegistry.ts) — `agent_key → { displayName, description, handler: () => Promise<{summary}> }`.
- Executor analog: [service.proofline-executor.ts](src/controllers/agents/feature-services/service.proofline-executor.ts) — iterate onboarded orgs, per-org try/catch, insert `agent_results`.
- LLM: [src/agents/service.llm-runner.ts](src/agents/service.llm-runner.ts) — `runAgent({ systemPrompt, userMessage, model?, maxTokens?, temperature?, outputSchema?, costContext? })`, Anthropic, Zod-validated + auto-retry.
- Storage: [AgentResultModel.ts](src/models/AgentResultModel.ts) — `agent_results` (organization_id, location_id=null, agent_type, date_start/end, agent_input, agent_output JSON, status); `findLatestByOrganizationAndAgent(orgId, agentType)`.
- Rybbit: [service.rybbit-data.ts](src/utils/rybbit/service.rybbit-data.ts) — `fetchRybbitMonthlyComparison(orgId, curStart, curEnd, prevStart, prevEnd)` takes arbitrary date ranges (despite the name) → reuse for week-over-week; `RybbitOverviewData = {sessions, pageviews, users, bounce_rate, pages_per_session, session_duration}`.
- Leads: [FormSubmissionModel.ts](src/models/website-builder/FormSubmissionModel.ts) — counts per project; add a date-ranged verified-count (or inline query) for this-week / last-week.
- Schedule seeding: a Knex migration inserting the row (pattern: [20260315000001](src/database/migrations/20260315000001_create_schedules_tables.ts:50)).
- Surface analog: the Website overview hero — add a "This week" insight near it.

**Reference files:** `service.proofline-executor.ts` (executor), `agentRegistry.ts` (registration), `service.llm-runner.ts` (LLM), the schedules migration (seed).

## Constraints

**Must:**
- Weekly cron (e.g. `0 6 * * 1`, Mon 6am UTC); `agent_key = "website_summary"`.
- Only process orgs with a website project AND an active Rybbit integration AND ≥1 data day — **skip others** (no wasted LLM calls, no empty summaries).
- Per-org try/catch; one org's failure must not abort the run (mirror Proofline).
- Validate LLM output with a Zod schema (`runAgent` outputSchema).
- Pass `costContext` to `runAgent` so calls log to `ai_cost_events`.
- New user endpoint org-scoped via `req.organizationId` (mirror `getFormSubmissionStats`); role `admin|manager`.
- `npx tsc -b` passes.
- Commit author `LagDave <laggy80@gmail.com>`.

**Must not:**
- Add a new queue/worker — reuse the scheduler + agentRegistry.
- Run daily, or run for orgs with no website/analytics.
- Create tasks (out of scope for v1 — passive summary only).
- Block the overview render on the summary (independent fetch, graceful empty state).

**Out of scope:** turning summaries into tasks; email/notification delivery; an admin UI for the new agent; per-location (this is org/project-level).

## Risk

**Level:** 2.

**Risks identified:**
- **LLM cost (weekly × N orgs)** → recurring spend. **Mitigation:** weekly (chosen), skip orgs without website+Rybbit+data, `costContext` logging for visibility.
- **Low-signal weeks** (little traffic) → bland summaries. **Mitigation:** prompt handles "quiet week" gracefully; skip orgs with no data entirely.
- **Output drift / unparseable LLM JSON** → bad surface. **Mitigation:** Zod `outputSchema` + `runAgent` retry; frontend tolerates missing fields.
- **Per-org failure** → run aborts. **Mitigation:** per-org try/catch, continue, record failures in the run summary.
- **Stale summary shown** → confusion. **Mitigation:** surface "as of {date_end}"; empty state until first run.

**Blast radius:** additive — new agent_key + migration row + one user endpoint + one overview element. No change to existing agents, scheduler, or other endpoints. New weekly LLM cost.

**Pushback:** Already applied (daily → weekly for signal + cost). Keep v1 passive (no tasks) until the summary quality is proven on real data.

## Tasks

### T1: Prompt + output schema
**Do:** Add `src/agents/<dir>/WebsiteSummary.md` (owner-readable, non-technical, dental/ortho voice; input = week-over-week traffic + leads + conversion; output JSON). Define a Zod `WebsiteSummaryOutputSchema`: `{ headline: string; highlights: string[] (2–4); recommendation?: string; sentiment: "up"|"flat"|"down" }`.
**Files:** `src/agents/.../WebsiteSummary.md`, a schema file (co-located with the executor or in agents).
**Verify:** schema parses a sample output; prompt loads via the existing `loadPrompt()`.

### T2: Week-over-week payload builder
**Do:** A pure builder that, given a project/org + reference date, computes this-week vs last-week date ranges and assembles `{ practiceName, period, traffic: {thisWeek, lastWeek} (Rybbit), leads: {thisWeek, lastWeek}, conversion: {thisWeek, lastWeek} }`. Use `fetchRybbitMonthlyComparison` with week ranges; add/period a verified-leads-by-range count to `FormSubmissionModel` (or inline query).
**Files:** `src/controllers/agents/feature-services/service.website-summary-payload.ts` (or similar), `FormSubmissionModel.ts` (date-ranged count if needed).
**Depends on:** none.
**Verify:** returns a populated payload for org 5 (Garrison) / org 39 (One Endo); null/skips when no Rybbit data.

### T3: Executor
**Do:** `executeWebsiteSummaryAgent(referenceDate?)`: list onboarded orgs with website+active-Rybbit; per org (try/catch) build payload (T2) → `runAgent({ systemPrompt: WebsiteSummary, userMessage: JSON(payload), outputSchema, costContext })` → insert `agent_results` (agent_type="website_summary", location_id=null, date_start/end = week range, agent_input, agent_output, status). Return `{ totalOrgs, successful, skipped, failed, durationMs }`.
**Files:** `src/controllers/agents/feature-services/service.website-summary-executor.ts`.
**Depends on:** T1, T2.
**Verify:** dry-run for one org inserts a valid `agent_results` row; failures isolated.

### T4: Register + schedule
**Do:** Add `website_summary` to [agentRegistry.ts](src/services/agentRegistry.ts) (→ `executeWebsiteSummaryAgent`). New Knex migration inserting the `schedules` row (agent_key="website_summary", schedule_type="cron", cron_expression="0 6 * * 1", enabled=true, next_run_at).
**Files:** `src/services/agentRegistry.ts`, `src/database/migrations/<ts>_seed_website_summary_schedule.ts`.
**Depends on:** T3.
**Verify:** `getRegisteredAgents()` includes it; migration inserts the row; scheduler tick picks it up (next_run_at set).

### T5: User endpoint + frontend API
**Do:** `GET /user/website/summary` → resolve org → `AgentResultModel.findLatestByOrganizationAndAgent(orgId, "website_summary")` → return `{ success, summary: agent_output | null, asOf: date_end }`. Add route (role admin|manager) + `fetchWebsiteSummary()` in `frontend/src/api/websiteAnalytics.ts`.
**Files:** `UserWebsiteController.ts`, `src/routes/user/website.ts`, `frontend/src/api/websiteAnalytics.ts`.
**Depends on:** T1 (output shape).
**Verify:** authed GET returns the latest summary (or null) for the org.

### T6: Surface on the overview
**Do:** In `WebsiteOverview`, fetch the summary (T5) and render a "This week" insight near the hero — headline + highlights, sentiment-colored, "as of {date}". Graceful empty ("Your first weekly summary will appear after the next run") + loading states. Wizard demo value.
**Files:** `frontend/src/components/website/overview/WebsiteOverview.tsx` (+ a small `WeeklyInsight` piece).
**Depends on:** T5.
**Verify:** overview shows the summary when present; empty state otherwise; `tsc -b` passes.

## Done
- [ ] `npx tsc -b` (backend + frontend) — zero new errors
- [ ] Weekly `schedules` row exists; `agent_key="website_summary"` resolves a handler
- [ ] Agent run produces a per-org `agent_results` row (agent_type="website_summary"); orgs without website/Rybbit/data are skipped; per-org failures isolated
- [ ] `GET /user/website/summary` returns the latest summary (or null) for the org
- [ ] Overview shows the "This week" insight (headline + highlights + "as of") with empty/loading states
- [ ] LLM calls log to `ai_cost_events` via `costContext`
- [ ] No new queue/worker; existing agents/scheduler untouched
