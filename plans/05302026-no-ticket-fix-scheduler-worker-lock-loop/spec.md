# Fix BullMQ Worker Lock-Renewal Loop (Non-Blocking Scheduler)

## Why
The worker log floods with `could not renew lock for job repeat:...` on `minds-scheduler`,
`minds-skill-triggers`, and `gbp-automation-deployment`. Root cause: tick processors `await`
long-running work **inline** while holding a short BullMQ lock. The lock expires mid-processing,
the stalled-checker requeues the job, it gets re-picked, and the orphaned attempt's renewal fails —
forever. The repeatable iteration never reaches a terminal state, so it never advances
(observed `count: 2199`, job wedged in `wait`, lock key `PTTL = -2`).

## What
Decouple **discovery (tick)** from **execution (handler)** so every repeatable tick completes in
sub-second and never risks its lock. Concretely:
1. `minds-scheduler` tick becomes a dispatcher that enqueues one job per due schedule onto a new
   `minds-schedule-exec` queue; a dedicated exec worker runs the agent handler under a long lock.
2. `minds-skill-triggers` gets a realistic `lockDuration` + bounded-concurrency webhook fires.
3. Every Worker gets its own Redis connection (no shared instance for lock renewal).
4. `gbp-automation-deployment` stall is diagnosed and given the matching fix.

**Done when:** worker runs for >10 min with zero `could not renew lock` errors, scheduler ticks
complete sub-second, and scheduled agents still execute end-to-end (run records created/completed).

## Context

**Relevant files:**
- `src/workers/worker.ts` — all ~20 Worker definitions + a single shared `connection` (L41) reused by every Worker; `minds-scheduler` (L201) and `minds-skill-triggers` (L88) set no `lockDuration` (BullMQ default 30s); schedule setup + graceful shutdown live here.
- `src/workers/processors/scheduler.processor.ts` — `processSchedulerTick` (L31) loops due schedules and `await`s `agent.handler()` **inline** (L59), then owns run-record lifecycle + `next_run_at`.
- `src/services/agentRegistry.ts` — `agent.handler()` runs `executeProoflineAgent` / `executeRankingAgent` "for all onboarded locations" → multi-minute. This is what blows the 30s lock.
- `src/workers/processors/skillTrigger.processor.ts` — `processSkillTrigger` (L56) loops due skills: `SkillWorkRunModel.create` (fast) + `await fireWorkCreationWebhook` (network → n8n) + timestamp update.
- `src/workers/queues.ts` — `getMindsQueue(name)` (L23) builds `minds-<name>` queues with `prefix: '{minds}'` on a shared connection. `getGbpAutomationQueue` (L75) for `{gbp}`.
- `src/models/ScheduleModel.ts` — `ScheduleModel.findDueSchedules` (L69), `ScheduleRunModel.createRun` (L104) / `completeRun` (L116) / `failRun` (L133) / `hasActiveRun` (L150). Reused, not modified.

**Patterns to follow:**
- **Dispatch fan-out** — `src/workers/processors/websiteGeneration.processor.ts:131` already does exactly the target pattern: scan, then `await queue.add("generate-page", data, { removeOnComplete, removeOnFail })` one job per item. The scheduler dispatcher mirrors this.
- **Long-running worker config** — `wb-*` workers in `worker.ts` (e.g. L240 `wb-layout-generate`) set `lockDuration: 600000`, `removeOnComplete/Fail`. The new exec worker matches this shape.
- **Per-queue processor file** — each queue has one `*.processor.ts` imported into `worker.ts`. New queue → new `scheduleExec.processor.ts`.

**Reference file:** `src/workers/processors/websiteGeneration.processor.ts` — closest analog for dispatcher → exec-queue structure.

## Constraints

**Must:**
- Keep `prefix: '{minds}'` consistent between the new exec Queue and its Worker (mismatch = jobs never picked up).
- Preserve `maxRetriesPerRequest: null` and the `REDIS_TLS === "true"` branch on every connection (BullMQ requires the former for Workers).
- Idempotent enqueue: dispatcher must not double-enqueue the same due schedule (jobId keyed on schedule id + due window) AND re-check `hasActiveRun`.
- Run-record semantics unchanged from the user's perspective: one `schedule_runs` row per execution, `next_run_at` advances exactly once per run (success or failure).

**Must not:**
- Add new dependencies. BullMQ + ioredis already present.
- Change `agentRegistry` handler signatures or the agents themselves.
- Touch DB schema — `schedule_runs` / `schedules` already hold everything needed (no migrations folder).
- Refactor unrelated workers' logic; only their connection wiring (T3) and lock durations where justified.
- Modify `src/index.ts` — it does not run these workers (confirmed).

**Out of scope:**
- The one-time local-Redis unblock (clearing wedged iterations) — that's a rollout step, not code.
- Redesigning gbp deployment business logic — only its lock/connection/dispatch wiring (T4).
- Converting skill-triggers to full per-skill fan-out (noted as alternative, not chosen).

## Risk

**Level:** 3 (changes job-execution semantics for all scheduled agents; blast radius = every schedule + every worker's connection wiring).

**Risks identified:**
- **Double execution during dispatcher rollout** — old wedged tick + new dispatcher both touch a due schedule. → **Mitigation:** idempotent jobId `sched-${schedule.id}-${dueWindowMs}` on the exec queue + `hasActiveRun` guard in both dispatcher (skip enqueue) and exec worker (skip run). At-most-once per window.
- **Connection count jump (Level 2)** — per-worker connections → ~20 workers × ~2 conns ≈ 40 to ElastiCache Serverless in prod. → **Mitigation:** ElastiCache Serverless connection ceiling is high (tens of thousands); 40 is negligible. Confirm against the prod instance before deploy; if constrained, group low-traffic workers onto a shared connection and isolate only the high-churn ones (`minds-scheduler`, `minds-schedule-exec`, `minds-skill-triggers`, `gbp-automation-deployment`).
- **Exec worker concurrency vs. agent cost** — running multiple AI agents in parallel could spike API/DB load. → **Mitigation:** start exec worker at `concurrency: 2`, `lockDuration: 900000` (15 min); the existing `hasActiveRun` guard already serializes per-schedule.
- **Stalled-loop recurrence if a handler genuinely exceeds the exec lock** — a 20-min agent would still stall the exec job. → **Mitigation:** set exec `lockDuration` above realistic worst case (15 min) and document; add `maxStalledCount` so a true overrun fails cleanly instead of looping.

**Blast radius (known consumers):**
- `worker.ts` → only the worker process (PID running `src/workers/worker.ts`); `src/index.ts` does **not** import it (confirmed via grep).
- `scheduler.processor.ts` → imported only by `worker.ts`.
- `queues.ts` `getMindsQueue` → used by controllers for OTHER queues (scrape-compare, compile-publish, seo-bulk-generate, review-sync) — the new `minds-schedule-exec` queue is additive and touches none of them.
- `ScheduleModel` / `ScheduleRunModel` / `agentRegistry` → reused as-is, no signature changes → no downstream impact.

**Pushback / alternatives considered:**
- **B — just raise the scheduler `lockDuration`:** smallest diff, but the tick still runs handlers serially inline. A handler >60s means the next minute's tick fires while this one runs (overlap), and any handler exceeding the chosen bound re-triggers the exact loop. Rejected — masks, doesn't fix.
- **skill-triggers full fan-out (one job per skill):** maximally consistent with the scheduler fix, but heavier for "insert row + fire webhook." Chose the proportionate path (lock bump + bounded-concurrency fires). Revisit if due-skill volume grows large.

## Tasks

### T1: Scheduler dispatch split (tick → exec queue → exec worker)
**Do:**
- New `src/workers/processors/scheduleExec.processor.ts` exporting `processScheduleExec(job)`: reads `scheduleId` from `job.data`, re-checks `ScheduleRunModel.hasActiveRun` (skip if running), `createRun`, looks up `getAgentHandler`, runs `await agent.handler()`, then `completeRun`/`failRun` + `ScheduleModel.updateById({ last_run_at, next_run_at })`. This is the execution half lifted from `scheduler.processor.ts` L46–81.
- Rewrite `processSchedulerTick` in `scheduler.processor.ts` to be a **dispatcher only**: `findDueSchedules`, and for each, if `!hasActiveRun`, enqueue onto `getMindsQueue("schedule-exec")` with `jobId: sched-${schedule.id}-${flooredDueWindow}`, `removeOnComplete: { count: 50 }`, `removeOnFail: { count: 25 }`. Return immediately. No `agent.handler()` call remains in the tick. Keep `computeNextRunAt` where the executor can use it (move into exec processor or share).
- In `worker.ts`: add a `schedulerExecWorker = new Worker("minds-schedule-exec", ... processScheduleExec, { connection: <own>, concurrency: 2, lockDuration: 900000, prefix: '{minds}', removeOnComplete: { count: 50 }, removeOnFail: { count: 25 } })`. Register it in the event-handler loop (L400) and in `shutdown()` (L417+).
- Leave the `minds-scheduler` worker's lock at default — the dispatcher is sub-second.
**Files:** `src/workers/processors/scheduleExec.processor.ts` (new), `src/workers/processors/scheduler.processor.ts`, `src/workers/worker.ts`
**Depends on:** none
**Verify:** `npx tsc --noEmit`; start worker, watch logs — `[SCHEDULER]` tick logs return immediately, agent execution logs come from the exec worker; a manually-due schedule creates exactly one `schedule_runs` row and `next_run_at` advances once.

### T2: skill-triggers lock + bounded webhook concurrency
**Do:**
- In `worker.ts`, set `minds-skill-triggers` worker `lockDuration: 300000` (5 min).
- In `skillTrigger.processor.ts`, fire webhooks with bounded concurrency (e.g. `Promise.allSettled` over a small batch) instead of one sequential `await` per skill, so total wall-time doesn't scale linearly with due-skill count. Keep per-skill error isolation (current try/catch behavior).
**Files:** `src/workers/worker.ts`, `src/workers/processors/skillTrigger.processor.ts`
**Depends on:** none
**Verify:** `npx tsc --noEmit`; with multiple due skills, the tick completes well under the lock window; each skill still gets a work run + webhook.

### T3: Per-worker Redis connections
**Do:**
- In `worker.ts`, replace the single shared `connection` (L41) passed to every Worker with a factory `makeConnection()` returning a fresh `IORedis({ host, port, maxRetriesPerRequest: null, ...(TLS) })`. Each `new Worker(...)` gets its own `makeConnection()`. Track created connections in an array; `shutdown()` quits each.
- Queues in `queues.ts` may keep their shared connection (enqueue-side sharing is fine) — no change required there unless T1/T4 surface a reason.
**Files:** `src/workers/worker.ts`
**Depends on:** none (independent; can land with or before T1)
**Verify:** `npx tsc --noEmit`; `redis-cli info clients` shows each worker connected; sustained run shows no renewal stalls attributable to connection contention.

### T4: Diagnose + fix gbp-automation-deployment stall
**Do:**
- Read `src/workers/processors/gbpAutomation.processor.ts` and identify which repeatable (`sync-local-posts` daily / `scan-local-post-generation` hourly) wedged and whether it does inline long work.
- If it scans-then-processes inline like the scheduler did → apply the same dispatch split (scan enqueues per-item deployment jobs; the existing `gbp-automation-deployment` worker already processes individual deployments).
- If runtime is bounded and it was purely a renewal-starvation victim → T3 + a lock-duration review resolves it; confirm no further change needed.
**Files:** `src/workers/processors/gbpAutomation.processor.ts` (TBD after read), `src/workers/worker.ts` (TBD)
**Depends on:** T3 (rules out the connection amplifier first)
**Verify:** `npx tsc --noEmit`; the gbp repeatable completes and advances its iteration; no `could not renew lock` on `{gbp}:gbp-automation-deployment`.

## Done
- [ ] `npx tsc --noEmit` — zero new errors
- [ ] Worker runs >10 min: **zero** `could not renew lock` across `minds-scheduler`, `minds-skill-triggers`, `gbp-automation-deployment`
- [ ] `redis-cli LRANGE '{minds}:minds-scheduler:active' 0 -1` and `:wait` do not stay pinned on one repeat timestamp; iterations advance
- [ ] A due schedule produces exactly one `schedule_runs` row, runs the agent via the exec worker, and `next_run_at` advances once (no duplicate execution)
- [ ] Scheduler tick logs return sub-second (dispatch only)
- [ ] No regression: controllers enqueuing other `getMindsQueue(...)` jobs (scrape-compare, compile-publish, seo-bulk-generate, review-sync) still process
- [ ] **Rollout step (operational, post-merge):** once deployed, clear the wedged repeatable iterations so they stop erroring before the first clean tick — local: stop worker, delete keys for the 3 queues, restart; prod: same against the prod Redis during a quiet window

## Revision Log

### Rev 1 — 2026-05-30 — T4 resolved during execution
**Change:** `gbp-automation-deployment` worker `lockDuration` raised 5 min → 20 min; no gbp business-logic change.
**Reason:** Read `GbpPublishedLocalPostService.syncAll` (L460) and `GbpLocalPostScheduleService.processDueSettings` (L155). `syncAll` (the `sync-local-posts` repeatable) loops `await this.sync(perLocation)` over **all** selected locations with a Google API call each, and the repeatable enqueues it with **no `limit`** — so wall-time scales with location count and outran the 5-min lock. `processDueSettings` is bounded (`limit=25`, DB-only) — not a problem. Because the job is **daily** (no overlap risk) and the spec fenced off redesigning gbp business logic, the proportionate fix is the per-worker connection (T3, removes the renewal-starvation trigger) + a generous lock. 
**Known limitation / follow-up:** as location count grows, even 20 min will eventually be exceeded. The correct scaling fix is to make `sync-local-posts` a per-location dispatcher (enqueue one `sync-local-post-location` job per location, mirroring T1). Deferred to its own task — it's a `GbpPublishedLocalPostService` refactor, out of this spec's scope.
